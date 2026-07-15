// api/recuperar-id.js — POST /api/recuperar-id  { nombre, email }
// Busca el/los ID de Asistente de una persona por nombre + correo,
// en las dos bases de asistentes (Varonil y Femenil).
// Filtra por correo en Airtable (campo limpio) y el nombre en JS.

const SOURCES = [
  {
    seccion: 'Varonil',
    base:  'app38fvKJRzcjw6eG',
    table: 'tblJsudzO54IZxZBi',
    pat:   () => process.env.AIRTABLE_PAT_VARONIL,
    f: {
      email:     'fld94J65PEEoOKbve',
      id:        'fldOihfiaa06buyO5',
      nombre:    'fldXADTpkNh5b3niL',
      apellidos: 'fldyAHXAo78jROVCc',
      completo:  'fldnc6AsjReu5EPy5',
      actividad: 'fldAULA1vebCtZP4a',
    },
  },
  {
    seccion: 'Femenil',
    base:  'appsCGzy0VlF0JpTq',
    table: 'tbl8WVhn59QbGKig2',
    pat:   () => process.env.AIRTABLE_PAT_FEMENIL,
    f: {
      email:     'fldyyaaT6IqRvXuaY',
      id:        'flddMIj6reMzSHRtP',
      nombre:    'fldm44XdBR3ySgGXv',
      apellidos: 'fldX481oFbUMy1ehW',
      completo:  'fldMGxEgAV0XMR8dP',
      actividad: 'fldMU8h5VqSo30sQv',
    },
  },
];

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

// normaliza: minúsculas, sin acentos, espacios colapsados
function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

// ¿el nombre buscado coincide con el nombre completo del registro?
function nombreCoincide(buscado, completo) {
  const b = norm(buscado), c = norm(completo);
  if (!b || !c) return false;
  if (c.includes(b) || b.includes(c)) return true;
  // todos los tokens del nombre buscado están en el nombre completo
  const ct = new Set(c.split(' '));
  return b.split(' ').every(t => ct.has(t));
}

async function buscarEnFuente(src, email, nombre) {
  const pat = src.pat();
  if (!pat) return [];

  const f = src.f;
  // filtro por correo (campo "Email", nombre limpio) — el nombre se filtra en JS
  const formula = `LOWER({Email})="${email.replace(/"/g, '\\"')}"`;
  const fields = [f.email, f.id, f.nombre, f.apellidos, f.completo, f.actividad]
    .map(x => `fields[]=${x}`).join('&');

  const url = `https://api.airtable.com/v0/${src.base}/${src.table}`
    + `?returnFieldsByFieldId=true&${fields}&pageSize=100`
    + `&filterByFormula=${encodeURIComponent(formula)}`;

  const r = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));

  const out = [];
  for (const rec of (data.records || [])) {
    const fl = rec.fields;
    const completo = String(firstVal(fl[f.completo]) || '').trim()
      || `${firstVal(fl[f.nombre]) || ''} ${firstVal(fl[f.apellidos]) || ''}`.trim();
    if (!nombreCoincide(nombre, completo)) continue;
    const id = String(firstVal(fl[f.id]) || '').trim();
    if (!id) continue;
    out.push({
      id,
      nombre: completo,
      actividad: String(firstVal(fl[f.actividad]) || '').trim(),
      seccion: src.seccion,
    });
  }
  return out;
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const nombre = String((body && body.nombre) || '').trim();
  const email  = String((body && body.email) || '').trim().toLowerCase();

  if (!nombre || !email) {
    return res.status(400).json({ error: 'Escribe tu nombre completo y tu correo.' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
  }

  try {
    const listas = await Promise.all(SOURCES.map(s => buscarEnFuente(s, email, nombre)));
    const resultados = listas.flat();
    // dedup por id + actividad
    const vistos = new Set();
    const unicos = resultados.filter(r => {
      const k = r.id + '|' + r.actividad;
      if (vistos.has(k)) return false;
      vistos.add(k); return true;
    });
    return res.status(200).json({ count: unicos.length, resultados: unicos });
  } catch (err) {
    console.error('recuperar-id error:', err.message);
    return res.status(500).json({ error: 'Ocurrió un error al buscar. Intenta de nuevo.' });
  }
};
