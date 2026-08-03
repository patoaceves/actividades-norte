// api/og-page.js — Sirve /v y /registro con los meta tags de la actividad
// inyectados, para que los previews de WhatsApp/redes muestren la info real
// (el crawler no ejecuta JS, asi que titulo y descripcion van en el HTML).
// La pagina la decide el rewrite de vercel.json via ?page=v|registro.
//
// Formato aprobado del preview (sin seccion, sin imagen):
//   Titulo:      AF039 | Convivencia de Consejos Locales San Rafael
//   Descripcion: Jueves, 6 ago - Domingo, 9 ago | Casa del Bosque I
//
// Sin og:image a proposito: sin imagen, WhatsApp muestra la tarjeta compacta
// de texto en lugar del cuadro gigante con el favicon.

const BASE  = 'appxtlc0kwOVOI0lm';
const TABLE = 'tbl2TeJgRtxbhWJMa';
const F = {
  idActividad:   'fldzIa1RbjhIBivKF',
  nombre:        'fldvqjXPKFoQXgAMe', // Full ID: "AF039 - Titulo"
  casa:          'fldBg4qtC8fWw9I4n',
  fechaCompleta: 'fldSwY4v4Rhlf2iK3',
};

const PAGES = {
  v:        { path: '/pages/v/',        tituloBase: 'Actividad - Actividades Norte' },
  registro: { path: '/pages/registro/', tituloBase: 'Registro - Actividades Norte' },
};

const htmlCache = {}; // por pagina; la plantilla estatica no cambia entre requests

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function first(v) { return Array.isArray(v) ? v[0] : v; }

function conTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

async function fetchHtml(host, page) {
  if (htmlCache[page.path]) return htmlCache[page.path];
  const r = await fetch(`https://${host}${page.path}`);
  if (!r.ok) throw new Error('No se pudo leer la plantilla');
  htmlCache[page.path] = await r.text();
  return htmlCache[page.path];
}

async function fetchActividad(id) {
  const pat = process.env.AIRTABLE_PAT_ACTIVIDADES;
  if (!pat) return null;
  let offset = '';
  for (let page = 0; page < 20; page++) {
    const url = `https://api.airtable.com/v0/${BASE}/${TABLE}`
      + `?pageSize=100&returnFieldsByFieldId=true`
      + (offset ? `&offset=${encodeURIComponent(offset)}` : '');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
    const d = await r.json();
    if (!r.ok) return null;
    const rec = (d.records || []).find(x =>
      String(first(x.fields[F.idActividad]) || '').trim().toUpperCase() === id
    );
    if (rec) {
      return {
        nombre:        String(first(rec.fields[F.nombre]) || '').trim(),
        casa:          String(first(rec.fields[F.casa]) || '').trim(),
        fechaCompleta: String(first(rec.fields[F.fechaCompleta]) || '').trim(),
      };
    }
    offset = d.offset || '';
    if (!offset) break;
  }
  return null;
}

module.exports = async (req, res) => {
  const host = req.headers.host || 'www.actividadesnorte.com';
  const page = PAGES[String((req.query && req.query.page) || 'v')] || PAGES.v;

  let html;
  try {
    html = await conTimeout(fetchHtml(host, page), 6000);
  } catch (e) {
    return res.status(500).send('Error cargando la página');
  }

  const id = String((req.query && req.query.id) || '').trim().toUpperCase();
  let title = page.tituloBase;
  let desc  = 'Consulta los detalles y regístrate a la actividad.';

  if (/^A[VF][A-Z0-9-]{1,30}$/.test(id)) {
    try {
      const act = await conTimeout(fetchActividad(id), 7000);
      if (act && act.nombre) {
        // "AF039 - Titulo" -> "AF039 | Titulo" (si el nombre ya trae el ID)
        let resto = act.nombre;
        if (resto.toUpperCase().startsWith(id)) {
          resto = resto.slice(id.length).replace(/^\s*[-\u2013\u2014|:]\s*/, '');
        }
        title = `${id} | ${resto || act.nombre}`;
        desc = [act.fechaCompleta, act.casa].filter(Boolean).join(' | ') || desc;
      }
    } catch (e) { /* preview generico si Airtable no responde a tiempo */ }
  }

  const metas = `<title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Actividades Norte">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="https://${host}/${page === PAGES.registro ? 'registro' : 'v'}${id ? '?id=' + encodeURIComponent(id) : ''}">
  <meta name="twitter:card" content="summary">`;

  const out = html.replace(`<title>${page.tituloBase}</title>`, metas);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Cache en el edge: 5 min frescos, hasta 1h sirviendo stale mientras revalida
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  return res.status(200).send(out);
};
