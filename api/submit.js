// api/submit.js
// Crea un registro de asistente en Airtable.
// — Verifica capacidad antes de escribir (no permite overbooking)
// — idAsistente de 4 dígitos con retry contra colisiones
// — CORS restringido por origen
// — Filtrado en JS (NO usa nombres de campo en filterByFormula)

const ACTIVIDADES = {
  base:  'appxtlc0kwOVOI0lm',
  table: 'tbl2TeJgRtxbhWJMa',
  fields: {
    idActividad:   'fldzIa1RbjhIBivKF',
    cuota:         'fldVePGXnIEkMWciI',
    nombre:        'fldvqjXPKFoQXgAMe',
    casa:          'fldBg4qtC8fWw9I4n',
    fechaCompleta: 'fldSwY4v4Rhlf2iK3',
    seccion:       'fldXXEE93HzWeMoH1',
    lugaresV:      'fldSZapFVdBE7vooa',
    lugaresF:      'fld8OQ8NitjT2sHEA',
  },
};

const DESTINO = {
  varonil: {
    base:  'app38fvKJRzcjw6eG',
    table: 'tblJsudzO54IZxZBi',
    pat:   () => process.env.AIRTABLE_PAT_VARONIL,
    ids: {
      idAsistente: 'fldOihfiaa06buyO5',
      codigoPais:  'fldkQVoEWdXG7JDZt',
      metodoPago:  'fld4qR4oAexk6hdXE',
      // linkActividad: 'fld...', // opcional: field ID del link "Actividades V"
      // linkTablaActividades: 'tbl...', // opcional: tabla vinculada (synced)
    },
  },
  femenil: {
    base:  'appsCGzy0VlF0JpTq',
    table: 'tbl8WVhn59QbGKig2',
    pat:   () => process.env.AIRTABLE_PAT_FEMENIL,
    ids: {
      idAsistente: 'flddMIj6reMzSHRtP',
      codigoPais:  'fldnv2cwLLZgKxm79',
      centro:      'fldWpi9Cy0PRVFQvC',
      // linkActividad: 'fld...', // opcional: field ID del link "Actividades F"
      // linkTablaActividades: 'tbl...', // opcional: tabla vinculada (synced)
    },
  },
};

// ── CORS por allow-list ──────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://registro.actividadesnorte.com',
  'https://www.registro.actividadesnorte.com',
  'https://actividadesnorte.com',
  'https://www.actividadesnorte.com',
  process.env.PUBLIC_BASE_URL,
].filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[\w-]+\.vercel\.app$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function firstVal(v) { return Array.isArray(v) ? v[0] : v; }
const { parseLugares } = require('./_lib/lugares');
const { construirEmailBody, enviarEmail } = require('./_lib/email');
const { montoContadoMXN, montoApartadoMXN } = require('./_lib/precios');

// 4 dígitos: 1000-9999 → 9000 opciones por actividad
// Formato: ${idActividad}${4 dígitos} → ej. AV031 + 7098 = AV0317098
function generateIdAsistente(idActividad) {
  return `${idActividad}${Math.floor(1000 + Math.random() * 9000)}`;
}

// ── Metadata API → { fieldName: fieldId } y también { fieldName: {id, type} } ──
async function getFieldMap(pat, baseId, tableId) {
  const r    = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Metadata API: ${JSON.stringify(data)}`);
  const table = data.tables?.find(t => t.id === tableId);
  if (!table) throw new Error(`Tabla ${tableId} no encontrada`);
  const map   = {};   // name -> id  (retrocompat)
  const meta  = {};   // name -> { id, type, linkedTableId }
  table.fields?.forEach(f => {
    map[f.name] = f.id;
    meta[f.name] = { id: f.id, type: f.type, linkedTableId: f.options?.linkedTableId };
  });
  map.__meta = meta;
  return map;
}

// Dado el ID textual de actividad (ej "AF052"), encuentra el record ID en la
// tabla VINCULADA de la base de asistentes. Esa tabla suele ser una synced
// table desde la central y NO preserva los record IDs originales, por eso hay
// que resolver el rec... local buscando por el campo "ID Actividad".
async function resolverRecordEnTablaVinculada(pat, baseId, linkedTableId, idActividad) {
  if (!linkedTableId) return null;

  const meta = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  const metaData = await meta.json();
  if (!meta.ok) throw new Error(`Metadata (tabla vinculada): ${JSON.stringify(metaData)}`);
  const tabla = metaData.tables?.find(t => t.id === linkedTableId);
  if (!tabla) { console.warn(`Tabla vinculada ${linkedTableId} no existe en base ${baseId}`); return null; }

  const fields = tabla.fields || [];

  // Campos candidatos donde puede vivir el ID de actividad, en orden de
  // preferencia. Incluimos campos de texto/fórmula y el primario, porque en
  // algunas tablas el "ID" es el campo primario (que a veces trae el nombre
  // completo "AF050 - ...") o una columna aparte.
  const TEXTO_OK = new Set(['singleLineText', 'multilineText', 'formula', 'richText', 'autoNumber', 'barcode']);
  const preferidos = [];
  const exacto = fields.find(f => f.name.trim().toLowerCase() === 'id actividad');
  if (exacto) preferidos.push(exacto);
  const primario = fields.find(f => f.id === tabla.primaryFieldId);
  if (primario && !preferidos.includes(primario)) preferidos.push(primario);
  fields.forEach(f => {
    if (!preferidos.includes(f) && (TEXTO_OK.has(f.type) || /\bid\b/i.test(f.name))) preferidos.push(f);
  });

  const idFieldIds = preferidos.map(f => f.id);
  const target = String(idActividad).trim().toUpperCase();

  // Un valor "matchea" si es exactamente el ID, o si empieza con "AF050 -" /
  // "AF050:" / "AF050 " (para primarios con nombre completo).
  const matchVal = (raw) => {
    const s = String(firstVal(raw) || '').trim().toUpperCase();
    if (!s) return false;
    if (s === target) return true;
    return s.startsWith(target + ' ') || s.startsWith(target + '-') || s.startsWith(target + ':');
  };

  let offset = '', pages = 0, scanned = 0;
  do {
    const fl = idFieldIds.map(id => `fields[]=${id}`).join('&');
    const url = `https://api.airtable.com/v0/${baseId}/${linkedTableId}`
      + `?returnFieldsByFieldId=true&${fl}&pageSize=100`
      + (offset ? `&offset=${offset}` : '');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
    const data = await r.json();
    if (!r.ok) throw new Error(`List (tabla vinculada): ${JSON.stringify(data)}`);
    for (const rec of (data.records || [])) {
      scanned++;
      for (const fid of idFieldIds) {
        if (matchVal(rec.fields[fid])) return rec.id;
      }
    }
    offset = data.offset || '';
    pages++;
  } while (offset && pages < 30);

  console.warn(`No se encontró "${target}" en tabla vinculada ${linkedTableId} (base ${baseId}). `
    + `Campos escaneados: ${preferidos.map(f => f.name).join(', ')}. Records revisados: ${scanned}.`);
  return null;
}

// Encuentra el campo LINK a la actividad ("Actividades V" / "Actividades F",
// el del ícono de rayo). Devuelve { fieldId, linkedTableId } o null.
// El linkedTableId es la tabla (dentro de la MISMA base de asistentes, casi
// siempre una tabla sincronizada desde la central) contra la que se linkea.
function findLinkActividadField(fieldMap, genero) {
  const meta = fieldMap.__meta || {};
  const letra = genero === 'femenil' ? 'F' : 'V';
  const candidatos = Object.entries(meta)
    .filter(([, m]) => m.type === 'multipleRecordLinks');

  let hit = candidatos.find(([name]) =>
    name.trim().toLowerCase().startsWith(`actividades ${letra.toLowerCase()}`));
  if (!hit) hit = candidatos.find(([name]) => /actividad/i.test(name));
  if (!hit && candidatos.length === 1) hit = candidatos[0];

  if (!hit) return null;
  return { fieldId: hit[1].id, linkedTableId: hit[1].linkedTableId || null };
}

// Encuentra el campo de TEXTO "Actividades V/F" (sin rayo), donde se pega el
// nombre de la actividad ("AF050 - Curso de Retiro San Rafael"). Hay dos
// campos con el mismo nombre base: uno es el link (multipleRecordLinks) y otro
// es este texto; por eso filtramos por tipo texto.
function findTextoActividadFieldId(fieldMap, genero) {
  const meta = fieldMap.__meta || {};
  const letra = genero === 'femenil' ? 'F' : 'V';
  const TEXTO_OK = new Set(['singleLineText', 'multilineText', 'richText']);
  const candidatos = Object.entries(meta)
    .filter(([, m]) => TEXTO_OK.has(m.type));

  let hit = candidatos.find(([name]) =>
    name.trim().toLowerCase().startsWith(`actividades ${letra.toLowerCase()}`));
  if (!hit) hit = candidatos.find(([name]) => /^actividades\b/i.test(name.trim()));
  return hit ? hit[1].id : null;
}

// ── Buscar actividad ─────────────────────────────────────────────────
async function fetchActividad(idActividad) {
  const pat = process.env.AIRTABLE_PAT_ACTIVIDADES;
  if (!pat) throw new Error('AIRTABLE_PAT_ACTIVIDADES no configurado');

  const fl = Object.values(ACTIVIDADES.fields).map(f => `fields[]=${f}`).join('&');
  let found = null, offset = '';
  do {
    const url = `https://api.airtable.com/v0/${ACTIVIDADES.base}/${ACTIVIDADES.table}`
      + `?returnFieldsByFieldId=true&${fl}&pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const r    = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
    const data = await r.json();
    if (!r.ok) throw new Error(`Airtable actividades: ${JSON.stringify(data)}`);
    found  = data.records?.find(rec =>
      String(firstVal(rec.fields[ACTIVIDADES.fields.idActividad]) || '').trim() === idActividad
    );
    offset = found ? '' : (data.offset || '');
  } while (!found && offset);

  if (!found) throw new Error(`Actividad no encontrada: ${idActividad}`);
  const f       = found.fields;
  const seccion = String(firstVal(f[ACTIVIDADES.fields.seccion]) || '').toUpperCase();
  const lugares = seccion === 'FEMENIL'
    ? firstVal(f[ACTIVIDADES.fields.lugaresF])
    : firstVal(f[ACTIVIDADES.fields.lugaresV]);
  return {
    recordId:      found.id,   // rec... de la actividad en la base central (para el link)
    nombre:        firstVal(f[ACTIVIDADES.fields.nombre])        || idActividad,
    cuota:         firstVal(f[ACTIVIDADES.fields.cuota])         || '0',
    casa:          firstVal(f[ACTIVIDADES.fields.casa])          || '',
    fechaCompleta: firstVal(f[ACTIVIDADES.fields.fechaCompleta]) || '',
    seccion,
    lugares:       parseLugares(lugares),
  };
}

// ── Lista idAsistentes existentes en la tabla destino para esa actividad ──
// Solo se usa para evitar colisiones del random.
// IMPORTANTE: filtramos en JS, NO usamos filterByFormula con nombres de campo.
async function listarIdsAsistenteParaActividad(pat, cfg, idActividad, fieldMap) {
  const idActividadFieldId = fieldMap['ID Actividad'];
  if (!idActividadFieldId) throw new Error('Campo "ID Actividad" no encontrado en tabla destino');

  // Pedimos solo los 2 campos que necesitamos para abaratar la transferencia
  const fl = [idActividadFieldId, cfg.ids.idAsistente]
    .filter(Boolean).map(f => `fields[]=${f}`).join('&');

  let offset = '', pages = 0;
  const ids = [];
  do {
    const url = `https://api.airtable.com/v0/${cfg.base}/${cfg.table}`
      + `?returnFieldsByFieldId=true&${fl}&pageSize=100`
      + (offset ? `&offset=${offset}` : '');
    const r    = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
    const data = await r.json();
    if (!r.ok) throw new Error(`Airtable list: ${JSON.stringify(data)}`);
    (data.records || []).forEach(rec => {
      const recIdAct = String(firstVal(rec.fields[idActividadFieldId]) || '').trim();
      if (recIdAct !== idActividad) return; // filtro en JS
      const idA = String(firstVal(rec.fields[cfg.ids.idAsistente]) || '').trim();
      if (idA) ids.push(idA);
    });
    offset = data.offset || '';
    pages++;
  } while (offset && pages < 30);

  return ids;
}

// ── Construir payload con field IDs ─────────────────────────────────
function buildPayload(formFields, fieldMap, cfg, idAsistente, genero, linkInfo) {
  const get    = name => fieldMap[name];
  const result = {};

  const commonFields = [
    'Nombre', 'Apellidos', 'Email', 'WhatsApp',
    'Ciudad', 'ID Actividad', 'Pago',
    'T&C', 'PP', 'Aviso',
  ];
  for (const name of commonFields) {
    const id = get(name);
    if (id && formFields[name] !== undefined) result[id] = formFields[name];
  }

  const metodoPagoId = cfg.ids.metodoPago || get('Método de Pago');
  if (metodoPagoId) result[metodoPagoId] = formFields['Método de Pago'];

  const centroVal = formFields['Encargado, Centro, Institución'];
  if (genero === 'femenil' && cfg.ids.centro) {
    result[cfg.ids.centro] = centroVal;
  } else {
    const encId = get('Encargado, Centro, Institución');
    if (encId) result[encId] = centroVal;
  }

  if (formFields['Código País'] && cfg.ids.codigoPais) {
    result[cfg.ids.codigoPais] = formFields['Código País'];
  }

  result[cfg.ids.idAsistente] = idAsistente;

  // Link a la actividad (campo "Actividades V/F"). El fieldId y el recordId ya
  // vienen resueltos desde el handler (el recordId es el de la tabla vinculada,
  // NO el de la central). Si no se pudo resolver, se omite y hay retry defensivo.
  if (linkInfo?.fieldId && linkInfo?.recordId) {
    result[linkInfo.fieldId] = [linkInfo.recordId];
  }

  // Campo de TEXTO "Actividades V/F" (sin rayo): el nombre completo de la
  // actividad, ej "AF050 - Curso de Retiro San Rafael".
  if (linkInfo?.textoFieldId && linkInfo?.nombreActividad) {
    result[linkInfo.textoFieldId] = linkInfo.nombreActividad;
  }

  return result;
}

// ── Handler ──────────────────────────────────────────────────────────
const REQUIRED = [
  'Nombre', 'Apellidos', 'Email', 'WhatsApp',
  'Encargado, Centro, Institución', 'Ciudad', 'ID Actividad',
];

// ── ANTI-BOT ─────────────────────────────────────────────────────────
// Tres capas, sin fricción para humanos:
//   1. Honeypot (_hp): campo invisible que solo los bots llenan.
//   2. Timing trap (_elapsed): un humano tarda minutos en 3 pasos;
//      rechazamos submits a menos de 3 segundos de cargar la página.
//   3. Filtro de URLs: nombres/ciudades con links = spam.
const MIN_ELAPSED_MS = 3000;
const URL_PATTERN    = /https?:\/\/|www\.|<a\s/i;
const TEXT_FIELDS_TO_SCAN = [
  'Nombre', 'Apellidos', 'Ciudad', 'Encargado, Centro, Institución',
];

function esBot(body) {
  const { _hp, _elapsed, fields } = body || {};
  if (_hp && String(_hp).trim() !== '') return 'honeypot';
  // _elapsed puede faltar en clientes con la página cacheada vieja:
  // solo rechazamos si viene Y es sospechosamente corto.
  if (_elapsed !== undefined && Number(_elapsed) >= 0 && Number(_elapsed) < MIN_ELAPSED_MS) {
    return 'timing';
  }
  for (const f of TEXT_FIELDS_TO_SCAN) {
    if (fields?.[f] && URL_PATTERN.test(String(fields[f]))) return 'url-en-campo';
  }
  return null;
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { fields, genero } = req.body || {};

  // ANTI-BOT: rechazar antes de tocar Airtable. Respuesta genérica a
  // propósito, sin revelar qué trampa disparó.
  const botReason = esBot(req.body);
  if (botReason) {
    console.warn('submit bloqueado por anti-bot:', botReason);
    return res.status(400).json({ error: 'Solicitud inválida' });
  }

  if (!genero || !DESTINO[genero]) {
    return res.status(400).json({ error: `Género inválido o faltante: ${genero}` });
  }
  for (const f of REQUIRED) {
    if (!fields?.[f]) return res.status(400).json({ error: `Campo requerido: ${f}` });
  }

  try {
    const cfg = DESTINO[genero];
    const pat = cfg.pat();
    if (!pat) throw new Error(`AIRTABLE_PAT_${genero.toUpperCase()} no configurado`);

    const idActividad = String(fields['ID Actividad']).trim();

    // 1. Buscar actividad
    const actividad = await fetchActividad(idActividad);

    // 2. Validar sección
    if (actividad.seccion && actividad.seccion !== genero.toUpperCase()) {
      return res.status(400).json({
        error: `Esta actividad es ${actividad.seccion}, no ${genero.toUpperCase()}`,
      });
    }

    // 3. Verificar capacidad — `lugares` es lugares DISPONIBLES, no cupo total
    if (actividad.lugares != null && actividad.lugares <= 0) {
      return res.status(409).json({
        error: 'Esta actividad ya está llena',
        lugares: actividad.lugares,
      });
    }

    // 4. Field map (Metadata API)
    const fieldMap = await getFieldMap(pat, cfg.base, cfg.table);

    // 5. Listar idAsistentes existentes (solo para evitar colisiones del random)
    //    Filtrado en JS — NO usamos filterByFormula con nombres de campo.
    //    Nota: NO validamos email duplicado: una persona puede registrar a otros
    //    asistentes con el mismo correo (ej: pareja, hijos, etc.).
    const idsExistentes = await listarIdsAsistenteParaActividad(
      pat, cfg, idActividad, fieldMap
    );

    // 6. Generar idAsistente único (con retry contra colisiones)
    let idAsistente;
    const idsSet = new Set(idsExistentes);
    for (let i = 0; i < 20; i++) {
      const candidato = generateIdAsistente(idActividad);
      if (!idsSet.has(candidato)) { idAsistente = candidato; break; }
    }
    if (!idAsistente) throw new Error('No se pudo generar un ID de asistente único');

    // 7. Resolver el LINK a la actividad.
    //    El campo "Actividades V/F" linkea a una tabla dentro de la MISMA base
    //    de asistentes (synced desde la central). Esa tabla NO preserva los
    //    record IDs de la central, así que buscamos el rec... local por su
    //    "ID Actividad". Todo esto es best-effort: si algo falla, el registro
    //    se guarda igual sin el link (retry defensivo abajo).
    const linkField = findLinkActividadField(fieldMap, genero);
    const linkFieldId = cfg.ids.linkActividad || linkField?.fieldId || null;
    let linkRecordId = null;
    if (linkFieldId) {
      try {
        const linkedTableId = cfg.ids.linkTablaActividades || linkField?.linkedTableId || null;
        linkRecordId = await resolverRecordEnTablaVinculada(
          pat, cfg.base, linkedTableId, idActividad
        );
        if (!linkRecordId) {
          console.warn(`No se encontró la actividad ${idActividad} en la tabla vinculada ${linkedTableId}; se guardará sin link.`);
        }
      } catch (e) {
        console.warn('Error resolviendo el link a la actividad:', e.message);
      }
    }

    // Campo de TEXTO "Actividades V/F" (sin rayo): se llena con el nombre
    // completo de la actividad. Es independiente del link.
    const textoFieldId = cfg.ids.textoActividad || findTextoActividadFieldId(fieldMap, genero);
    const nombreActividad = actividad?.nombre || idActividad;

    // 8. Construir payload
    const payload = buildPayload(fields, fieldMap, cfg, idAsistente, genero,
      { fieldId: linkFieldId, recordId: linkRecordId, textoFieldId, nombreActividad });
    const metodoPagoId = cfg.ids.metodoPago || fieldMap['Método de Pago'];

    // 9. Escribir registro con reintentos defensivos.
    //    El registro del asistente NUNCA se pierde por un campo secundario:
    //    si Airtable rechaza el "Método de Pago" (opción inexistente) o el
    //    link a la actividad, reintentamos quitando ese campo. Los datos clave
    //    quedan igual y el método real está en la metadata del PI de Stripe.
    async function escribir(body) {
      const resp = await fetch(
        `https://api.airtable.com/v0/${cfg.base}/${cfg.table}?returnFieldsByFieldId=true`,
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields: body }),
        }
      );
      return { resp, json: await resp.json() };
    }

    let { resp: r, json: data } = await escribir(payload);

    // Retry 1: opción de Single Select "Método de Pago" no válida
    if (!r.ok && data?.error?.type === 'INVALID_MULTIPLE_CHOICE_OPTIONS') {
      const retryPayload = { ...payload };
      if (metodoPagoId) delete retryPayload[metodoPagoId];
      console.warn('Airtable rechazó Método de Pago, reintentando sin ese campo. Valor original:', fields['Método de Pago']);
      ({ resp: r, json: data } = await escribir(retryPayload));
    }

    // Retry 2: el link a la actividad falló (record inexistente en la tabla
    // vinculada, etc.). Guardamos el registro sin el link; el "ID Actividad"
    // en texto queda igual.
    if (!r.ok && linkFieldId && payload[linkFieldId]) {
      const retryPayload = { ...payload };
      delete retryPayload[linkFieldId];
      console.warn('Airtable rechazó el link a la actividad, reintentando sin ese campo. Error:', JSON.stringify(data?.error || {}));
      ({ resp: r, json: data } = await escribir(retryPayload));
      // Si aún falla, quitar también el texto de actividad y método de pago
      if (!r.ok && textoFieldId) {
        delete retryPayload[textoFieldId];
        ({ resp: r, json: data } = await escribir(retryPayload));
      }
      if (!r.ok && metodoPagoId) {
        delete retryPayload[metodoPagoId];
        ({ resp: r, json: data } = await escribir(retryPayload));
      }
    }

    if (!r.ok) throw new Error(`Airtable write: ${JSON.stringify(data)}`);

    // ── Correo de confirmación (Resend) ──────────────────────────────
    // Mismo contenido que la automation vieja de Airtable, ahora fuera de
    // Airtable. Best-effort: si el correo falla, NO rompemos el registro
    // (el asistente ya quedó guardado y, si aplica, el pago sigue su curso).
    //
    // NOTA de timing: en Tarjeta/OXXO el registro (y este correo) se crean
    // ANTES de que el pago se confirme en Stripe. Igual que la automation
    // original. Si en el futuro quieres que el correo de tarjeta salga solo
    // tras el pago exitoso, se movería a un webhook de Stripe; el de depósito
    // sí debe salir aquí (no pasa por Stripe).
    try {
      const emailDest    = fields['Email'];
      const contadoMxn   = montoContadoMXN(actividad.cuota);
      const apartadoMxn  = montoApartadoMXN(actividad.cuota);
      // 3 MSI: el total se cobra a meses, mismo monto que contado.
      const msiMxn       = contadoMxn;

      const { subject, html } = construirEmailBody({
        idAsistente,
        actividad:          actividad.nombre,
        fechaCompleta:      actividad.fechaCompleta,
        casa:               actividad.casa,
        metodoPago:         fields['Método de Pago'],
        lugaresDisponibles: actividad.lugares,   // ya normalizado (0/NO bloquea antes)
        contadoMxn,
        apartadoMxn,
        msiMxn,
      });

      const envio = await enviarEmail({ to: emailDest, subject, html });
      if (!envio.ok) {
        console.warn('No se pudo enviar el correo de confirmación:', envio.error);
      } else {
        console.log('Correo de confirmación enviado:', envio.id);
      }
    } catch (e) {
      console.warn('Error enviando el correo de confirmación:', e.message);
    }

    return res.status(200).json({
      success:    true,
      recordId:   data.id,
      idAsistente,
      actividad: {
        nombre:        actividad.nombre,
        cuota:         actividad.cuota,
        casa:          actividad.casa,
        fechaCompleta: actividad.fechaCompleta,
      },
    });

  } catch (err) {
    console.error('submit error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
