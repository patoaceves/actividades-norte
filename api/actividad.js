// api/actividad.js — GET /api/actividad?id=AV026
// Busca una actividad específica por ID.
// Nunca usa nombres de campo en filterByFormula — filtra en JS.

const BASE  = 'appxtlc0kwOVOI0lm';
const TABLE = 'tbl2TeJgRtxbhWJMa';

const FIELDS = {
  idActividad:    'fldzIa1RbjhIBivKF',
  nombre:         'fldvqjXPKFoQXgAMe',
  cuota:          'fldVePGXnIEkMWciI',
  casa:           'fldBg4qtC8fWw9I4n',
  fechaCompleta:  'fldSwY4v4Rhlf2iK3',
  fechaInicio:    'fldu09zPOwDLytAcm',
  fechaFin:       'fld0dIPfVqJPpvQ4H',
  seccion:        'fldXXEE93HzWeMoH1',
  direccion:      'fldUBbL4v6HKXGU1z',
  googleMapsUrl:  'fldjydLIKiXOxvyQE',
  lugaresV:       'fldSZapFVdBE7vooa',
  lugaresF:       'fld8OQ8NitjT2sHEA',
  coordNombre:    'fldZHaRin61NSuHSM',
  coordWhatsapp:  'fld0zWc2reFz5IkmN',
  coordEmail:     'fldXjfW9suvjTiJ8I',
};

// Helper: primer valor si es array (campos lookup/link)
function firstVal(v) {
  return Array.isArray(v) ? v[0] : v;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = (req.query.id || '').trim().toUpperCase();
  if (!id) {
    return res.status(400).json({ error: 'Falta parámetro id' });
  }

  const pat = process.env.AIRTABLE_PAT_ACTIVIDADES;
  if (!pat) {
    return res.status(500).json({ error: 'AIRTABLE_PAT_ACTIVIDADES no configurado' });
  }

  try {
    const fieldList = Object.values(FIELDS).map(f => `fields[]=${f}`).join('&');

    // Lista registros paginados y busca el ID
    let found  = null;
    let offset = '';
    let pages  = 0;
    const MAX_PAGES = 20;

    do {
      const url = `https://api.airtable.com/v0/${BASE}/${TABLE}`
        + `?returnFieldsByFieldId=true&${fieldList}&pageSize=100`
        + (offset ? `&offset=${offset}` : '');

      const r    = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(data));

      found = (data.records || []).find(rec => {
        const fields = rec.fields;
        // Match directo por idActividad
        const recId = String(firstVal(fields[FIELDS.idActividad]) || '').trim().toUpperCase();
        if (recId === id) return true;
        // Fallback: match por prefijo del nombre "AF027 - ..." o "AF027-1 - ..."
        const nombre = String(firstVal(fields[FIELDS.nombre]) || '').trim().toUpperCase();
        if (nombre.startsWith(id + ' ') || nombre.startsWith(id + '-') || nombre === id) return true;
        return false;
      });

      offset = found ? '' : (data.offset || '');
      pages++;
    } while (!found && offset && pages < MAX_PAGES);

    if (!found) {
      return res.status(404).json({ error: `Actividad no encontrada: ${id}` });
    }

    const f = found.fields;

    // Casa como array (multi-select en Airtable)
    let casas = [];
    const casaVal = f[FIELDS.casa];
    if (Array.isArray(casaVal)) {
      casas = casaVal.map(x => String(x || '').trim()).filter(Boolean);
    } else if (typeof casaVal === 'string' && casaVal.trim()) {
      casas = casaVal.split(/[,;]\s*/).map(x => x.trim()).filter(Boolean);
    }

    // Sección y lugares
    const seccion = String(firstVal(f[FIELDS.seccion]) || '').trim().toUpperCase();
    const lugaresRaw = seccion === 'FEMENIL'
      ? firstVal(f[FIELDS.lugaresF])
      : firstVal(f[FIELDS.lugaresV]);
    const lugares = lugaresRaw != null ? Number(lugaresRaw) : null;

    return res.status(200).json({
      id,
      nombre:         String(firstVal(f[FIELDS.nombre])        || id).trim(),
      cuota:          String(firstVal(f[FIELDS.cuota])         || '').trim(),
      casa:           casas,
      casaPrincipal:  casas[0] || '',
      fechaCompleta:  String(firstVal(f[FIELDS.fechaCompleta]) || '').trim(),
      fechaInicio:    String(firstVal(f[FIELDS.fechaInicio])   || '').trim(),
      fechaFin:       String(firstVal(f[FIELDS.fechaFin])      || '').trim(),
      seccion,
      lugares,
      direccion:      String(firstVal(f[FIELDS.direccion])     || '').trim(),
      googleMapsUrl:  String(firstVal(f[FIELDS.googleMapsUrl]) || '').trim(),
      coordinador: {
        nombre:   String(firstVal(f[FIELDS.coordNombre])   || '').trim(),
        whatsapp: String(firstVal(f[FIELDS.coordWhatsapp]) || '').trim(),
        email:    String(firstVal(f[FIELDS.coordEmail])    || '').trim(),
      },
    });

  } catch (err) {
    console.error('actividad error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
