// api/disponibilidad.js — GET /api/disponibilidad?seccion=femenil|varonil|admin
// Devuelve, por fecha, cuántas casas (Casa Grande, Bosque I, Bosque II) están
// disponibles para la sección pedida. Solo esas 3 casas (nada de Dique/Estero).

const BASE  = 'appxtlc0kwOVOI0lm';
const TABLE = 'tblh3DBfMV1vylyKY'; // Disponibilidad

const F = {
  fecha:   'fldIVZHV9vARyUgyL',
  casas: [
    { nombre: 'Casa Grande',        disp: 'fldVie7zxrTobiEiL', sec: 'fld3dNaaRfBGp25ii' },
    { nombre: 'Casa del Bosque I',  disp: 'fldG1UoDwUHzFj00m', sec: 'fld0JOnlAegLUjmG6' },
    { nombre: 'Casa del Bosque II', disp: 'fldkL7fmBYD2aGalA', sec: 'fld5RKQObPgfsgrJN' },
  ],
};

const ALLOWED_ORIGINS = [
  'https://actividades-norte.vercel.app',
  'https://registro.actividadesnorte.com',
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

function firstVal(v) { return Array.isArray(v) ? v[0] : v; }
function selName(v) { const x = firstVal(v); return (x && typeof x === 'object') ? x.name : x; }
function selNames(v) {
  if (!Array.isArray(v)) v = v ? [v] : [];
  return v.map(x => (x && typeof x === 'object') ? x.name : x).filter(Boolean);
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const seccion = String(req.query.seccion || 'admin').toLowerCase();
  const secSel  = seccion === 'femenil' ? 'FEMENIL' : seccion === 'varonil' ? 'VARONIL' : null; // null = admin (todas)

  const pat = process.env.AIRTABLE_PAT_ACTIVIDADES;
  if (!pat) return res.status(500).json({ error: 'AIRTABLE_PAT_ACTIVIDADES no configurado' });

  try {
    const fieldIds = [F.fecha, ...F.casas.flatMap(c => [c.disp, c.sec])];
    const fieldsQ  = fieldIds.map(f => `fields[]=${f}`).join('&');

    const dias = {};
    let offset = '', pages = 0;
    do {
      const url = `https://api.airtable.com/v0/${BASE}/${TABLE}`
        + `?returnFieldsByFieldId=true&${fieldsQ}&pageSize=100`
        + (offset ? `&offset=${offset}` : '');
      const r = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(data));

      for (const rec of (data.records || [])) {
        const f = rec.fields;
        const fecha = firstVal(f[F.fecha]);
        if (!fecha) continue;

        const casas = F.casas.map(c => {
          const disponible = String(selName(f[c.disp]) || '').toLowerCase() === 'disponible';
          const secs = selNames(f[c.sec]);
          const aplicaSeccion = secSel ? secs.includes(secSel) : true;
          return { nombre: c.nombre, disponible: disponible && aplicaSeccion };
        });
        const count = casas.filter(c => c.disponible).length;

        dias[fecha] = { count, casas };
      }
      offset = data.offset || '';
      pages++;
    } while (offset && pages < 10);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ seccion, dias });
  } catch (err) {
    console.error('disponibilidad error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
