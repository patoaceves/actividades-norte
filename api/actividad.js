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
  menuInicio:     'fldAfRzp1icbT91jv',
  menuFin:        'fldVZ8wXIgwiw3AcM',
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

// Helper: primer valor si es array (campos lookup/link)
function firstVal(v) {
  return Array.isArray(v) ? v[0] : v;
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

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

    // Estrategia: priorizar match EXACTO por idActividad. Solo si no hay match
    // exacto en toda la paginación, usar fallback por prefijo del nombre.
    // CRÍTICO: NO matchear `nombre.startsWith(id + '-')` porque eso causa que
    // buscar "AV036" matchee accidentalmente "AV036-1 - ..." (Medex en vez de Kairós).
    let exactMatch    = null;
    let fallbackMatch = null;
    let offset        = '';
    let pages         = 0;
    const MAX_PAGES   = 20;

    do {
      const url = `https://api.airtable.com/v0/${BASE}/${TABLE}`
        + `?returnFieldsByFieldId=true&${fieldList}&pageSize=100`
        + (offset ? `&offset=${offset}` : '');

      const r    = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(data));

      for (const rec of (data.records || [])) {
        const recId = String(firstVal(rec.fields[FIELDS.idActividad]) || '').trim().toUpperCase();
        if (recId === id) { exactMatch = rec; break; }
        if (!fallbackMatch) {
          const nombre = String(firstVal(rec.fields[FIELDS.nombre]) || '').trim().toUpperCase();
          // Solo prefijo seguido de espacio o coincidencia exacta del nombre
          if (nombre.startsWith(id + ' ') || nombre === id) {
            fallbackMatch = rec;
          }
        }
      }
      if (exactMatch) break;
      offset = data.offset || '';
      pages++;
    } while (offset && pages < MAX_PAGES);

    const found = exactMatch || fallbackMatch;

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
      menuInicio:     String(firstVal(f[FIELDS.menuInicio])    || '').trim(),
      menuFin:        String(firstVal(f[FIELDS.menuFin])       || '').trim(),
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
