// api/submit.js
// Usa Metadata API para mapear field names → field IDs.
// El PAT necesita: schema.bases:read + data.records:write + acceso a la base.

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
  },
};

const DESTINO = {
  varonil: {
    base:  'app38fvKJRzcjw6eG',
    table: 'tblJsudzO54IZxZBi',
    pat:   () => process.env.AIRTABLE_PAT_VARONIL,
    // Field IDs conocidos (no dependen de Metadata API)
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

function generateIdAsistente(idActividad) {
  return `${idActividad}${Math.floor(1000 + Math.random() * 9000)}`;
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
      String(rec.fields[ACTIVIDADES.fields.idActividad] || '').trim() === idActividad
    );
    offset = found ? '' : (data.offset || '');
  } while (!found && offset);

  if (!found) throw new Error(`Actividad no encontrada: ${idActividad}`);
  const f = found.fields;
  return {
    nombre:        f[ACTIVIDADES.fields.nombre]        || idActividad,
    cuota:         f[ACTIVIDADES.fields.cuota]         || '0',
    casa:          Array.isArray(f[ACTIVIDADES.fields.casa])
                     ? f[ACTIVIDADES.fields.casa][0]
                     : (f[ACTIVIDADES.fields.casa] || ''),
    fechaCompleta: f[ACTIVIDADES.fields.fechaCompleta] || '',
    seccion:       String(f[ACTIVIDADES.fields.seccion] || '').toUpperCase(),
  };
}

// ── Construir payload con field IDs ─────────────────────────────────
function buildPayload(formFields, fieldMap, cfg, idAsistente, genero) {
  const get = name => fieldMap[name];
  const result = {};

  // Campos comunes — resueltos via fieldMap
  const commonFields = [
    'Nombre', 'Apellidos', 'Email', 'WhatsApp',
    'Ciudad', 'ID Actividad', 'Pago',
    'T&C', 'PP', 'Aviso',
  ];
  for (const name of commonFields) {
    const id = get(name);
    if (id && formFields[name] !== undefined) result[id] = formFields[name];
  }

  // Método de Pago — field ID conocido para varonil, por mapa para femenil
  const metodoPagoId = cfg.ids.metodoPago || get('Método de Pago');
  if (metodoPagoId) result[metodoPagoId] = formFields['Método de Pago'];

  // Centro / Encargado — femenil usa ID directo
  const centroVal = formFields['Encargado, Centro, Institución'];
  if (genero === 'femenil' && cfg.ids.centro) {
    result[cfg.ids.centro] = centroVal;
  } else {
    const encId = get('Encargado, Centro, Institución');
    if (encId) result[encId] = centroVal;
  }

  // Código País — field ID directo
  if (formFields['Código País'] && cfg.ids.codigoPais) {
    result[cfg.ids.codigoPais] = formFields['Código País'];
  }

  // ID Asistente — field ID directo
  result[cfg.ids.idAsistente] = idAsistente;

  return result;
}

// ── Handler ──────────────────────────────────────────────────────────
const REQUIRED = [
  'Nombre', 'Apellidos', 'Email', 'WhatsApp',
  'Encargado, Centro, Institución', 'Ciudad', 'ID Actividad',
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fields, genero = 'varonil' } = req.body || {};
  if (!DESTINO[genero]) return res.status(400).json({ error: `Género inválido: ${genero}` });
  for (const f of REQUIRED) {
    if (!fields?.[f]) return res.status(400).json({ error: `Campo requerido: ${f}` });
  }

  try {
    const cfg = DESTINO[genero];
    const pat = cfg.pat();
    if (!pat) throw new Error(`AIRTABLE_PAT_${genero.toUpperCase()} no configurado`);

    // 1. Buscar actividad
    const actividad = await fetchActividad(fields['ID Actividad']);

    // 2. Validar sección
    if (actividad.seccion && actividad.seccion !== genero.toUpperCase()) {
      return res.status(400).json({
        error: `Esta actividad es ${actividad.seccion}, no ${genero.toUpperCase()}`,
      });
    }

    // 3. Metadata API → field map (requiere schema.bases:read en PAT)
    const fieldMap = await getFieldMap(pat, cfg.base, cfg.table);

    // 4. Generar ID Asistente
    const idAsistente = generateIdAsistente(fields['ID Actividad']);

    // 5. Construir payload con field IDs
    const payload = buildPayload(fields, fieldMap, cfg, idAsistente, genero);

    // 6. Escribir — usando returnFieldsByFieldId=true en la URL
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
