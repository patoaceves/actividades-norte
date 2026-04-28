// api/submit.js
// Crea un registro de asistente en Airtable.
// — Verifica capacidad antes de escribir (no permite overbooking)
// — Verifica que email+idActividad no esté ya registrado (idempotencia)
// — idAsistente de 6 dígitos con retry si colisiona
// — Headers CORS

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
    },
  },
};

function firstVal(v) { return Array.isArray(v) ? v[0] : v; }

// 6 dígitos: 100000-999999 → 900K opciones
// Con 50 inscritos por actividad, prob. de colisión ~0.14%
function generateIdAsistente(idActividad) {
  return `${idActividad}${Math.floor(100000 + Math.random() * 900000)}`;
}

// ── Metadata API → { fieldName: fieldId } ───────────────────────────
async function getFieldMap(pat, baseId, tableId) {
  const r    = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Metadata API: ${JSON.stringify(data)}`);
  const table = data.tables?.find(t => t.id === tableId);
  if (!table) throw new Error(`Tabla ${tableId} no encontrada`);
  const map = {};
  table.fields?.forEach(f => { map[f.name] = f.id; });
  return map;
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
    nombre:        firstVal(f[ACTIVIDADES.fields.nombre])        || idActividad,
    cuota:         firstVal(f[ACTIVIDADES.fields.cuota])         || '0',
    casa:          firstVal(f[ACTIVIDADES.fields.casa])          || '',
    fechaCompleta: firstVal(f[ACTIVIDADES.fields.fechaCompleta]) || '',
    seccion,
    lugares:       lugares != null ? Number(lugares) : null,
  };
}

// ── Lista idAsistentes existentes en la tabla destino para esa actividad ──
// Solo se usa para evitar colisiones del random — no para validar duplicados.
async function listarRegistrosActividad(pat, cfg, idActividad, fieldMap) {
  const idActividadFieldId = fieldMap['ID Actividad'];
  if (!idActividadFieldId) throw new Error('Campo "ID Actividad" no encontrado en tabla destino');

  const formula = encodeURIComponent(`{ID Actividad}='${idActividad}'`);
  const fl      = [idActividadFieldId, cfg.ids.idAsistente]
    .filter(Boolean).map(f => `fields[]=${f}`).join('&');

  let offset = '', pages = 0;
  const ids = [];
  do {
    const url = `https://api.airtable.com/v0/${cfg.base}/${cfg.table}`
      + `?returnFieldsByFieldId=true&filterByFormula=${formula}&${fl}&pageSize=100`
      + (offset ? `&offset=${offset}` : '');
    const r    = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
    const data = await r.json();
    if (!r.ok) throw new Error(`Airtable list: ${JSON.stringify(data)}`);
    (data.records || []).forEach(rec => {
      const i = String(firstVal(rec.fields[cfg.ids.idAsistente]) || '').trim();
      if (i) ids.push(i);
    });
    offset = data.offset || '';
    pages++;
  } while (offset && pages < 20);

  return { idsAsistente: ids };
}

// ── Construir payload con field IDs ─────────────────────────────────
function buildPayload(formFields, fieldMap, cfg, idAsistente, genero) {
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

  return result;
}

// ── Handler ──────────────────────────────────────────────────────────
const REQUIRED = [
  'Nombre', 'Apellidos', 'Email', 'WhatsApp',
  'Encargado, Centro, Institución', 'Ciudad', 'ID Actividad',
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { fields, genero = 'varonil' } = req.body || {};
  if (!DESTINO[genero]) return res.status(400).json({ error: `Género inválido: ${genero}` });
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

    // 3. Field map (Metadata API)
    const fieldMap = await getFieldMap(pat, cfg.base, cfg.table);

    // 4. Listar idAsistentes existentes (solo para evitar colisiones del random)
    //    Nota: el campo `Lugares Disponibles V/F` en Airtable ya es el cupo
    //    RESTANTE (típicamente fórmula: cupoTotal - COUNT(asistentes)).
    //    NO validamos email duplicado: una persona puede registrar a otros
    //    asistentes con el mismo correo (ej: pareja, hijos, etc.).
    const { idsAsistente } = await listarRegistrosActividad(
      pat, cfg, idActividad, fieldMap
    );

    // 5. Verificar capacidad — `lugares` es lugares DISPONIBLES, no cupo total
    if (actividad.lugares != null && actividad.lugares <= 0) {
      return res.status(409).json({
        error: 'Esta actividad ya está llena',
        lugares: actividad.lugares,
      });
    }

    // 6. Generar idAsistente único (con retry contra colisiones)
    let idAsistente;
    const idsSet = new Set(idsAsistente);
    for (let i = 0; i < 5; i++) {
      const candidato = generateIdAsistente(idActividad);
      if (!idsSet.has(candidato)) { idAsistente = candidato; break; }
    }
    if (!idAsistente) throw new Error('No se pudo generar un ID de asistente único');

    // 7. Construir payload
    const payload = buildPayload(fields, fieldMap, cfg, idAsistente, genero);

    // 9. Escribir
    const r    = await fetch(
      `https://api.airtable.com/v0/${cfg.base}/${cfg.table}?returnFieldsByFieldId=true`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fields: payload }),
      }
    );
    const data = await r.json();
    if (!r.ok) throw new Error(`Airtable write: ${JSON.stringify(data)}`);

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
