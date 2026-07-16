// api/actividades-lista.js — GET /api/actividades-lista
// Retorna todas las actividades con Estatus = "Activo"
// de ambas secciones (VARONIL y FEMENIL).
// Filtro hecho en JS, sin filterByFormula.

const BASE  = 'appxtlc0kwOVOI0lm';
const TABLE = 'tbl2TeJgRtxbhWJMa';

const FIELDS = {
  idActividad:   'fldzIa1RbjhIBivKF',
  nombreCompleto: 'fldvqjXPKFoQXgAMe',  // "AV024 - Curso de Retiro Agregados"
  casa:          'fldBg4qtC8fWw9I4n',
  fechaCompleta: 'fldSwY4v4Rhlf2iK3',
  fechaInicio:   'fldu09zPOwDLytAcm',
  fechaFin:      'fld0dIPfVqJPpvQ4H',
  seccion:       'fldXXEE93HzWeMoH1',
  estatus:       'fldiVU5kOK5onLxa9',
  lugaresV:      'fldSZapFVdBE7vooa',
  lugaresF:      'fld8OQ8NitjT2sHEA',
  cuota:         'fldVePGXnIEkMWciI',
  // control (antes ignorados)
  estatusCuota:  'fldIR9pYBqEv801Rt', // Aprobada / En revisión
  privado:       'fldQ7jrATbHqtam6L', // checkbox
  sitioWeb:      'fldxJHVBlDZvB99UF', // checkbox
  registro:      'fld1z0mmnzign2JBL', // checkbox
  dirigidoA:     'fldNPjqTvcvVSTcde', // singleSelect
};

function asBool(v) { return v === true || v === 1 || v === 'true'; }

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
function firstScalar(v) { return Array.isArray(v) ? v[0] : v; }
const { parseLugares } = require('./_lib/lugares');

// Helper: devuelve array de strings para casa (maneja: array, string con comas, string simple)
function toCasasArray(v) {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) {
    return v.map(x => String(x || '').trim()).filter(Boolean);
  }
  const s = String(v).trim();
  if (!s) return [];
  // Separar por coma o punto y coma
  if (/[,;]/.test(s)) {
    return s.split(/[,;]\s*/).map(x => x.trim()).filter(Boolean);
  }
  return [s];
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pat = process.env.AIRTABLE_PAT_ACTIVIDADES;
  if (!pat) {
    return res.status(500).json({ error: 'AIRTABLE_PAT_ACTIVIDADES no configurado' });
  }

  try {
    const fieldList = Object.values(FIELDS).map(f => `fields[]=${f}`).join('&');

    // Recorre todas las páginas
    const all = [];
    let offset = '';
    let pages = 0;
    const MAX_PAGES = 20; // seguridad

    do {
      const url = `https://api.airtable.com/v0/${BASE}/${TABLE}`
        + `?returnFieldsByFieldId=true&${fieldList}&pageSize=100`
        + (offset ? `&offset=${offset}` : '');

      const r    = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(data));

      (data.records || []).forEach(rec => all.push(rec));
      offset = data.offset || '';
      pages++;
    } while (offset && pages < MAX_PAGES);

    // Filtra activos y mapea
    const activas = all
      .filter(rec => {
        const estatus = String(firstScalar(rec.fields[FIELDS.estatus]) || '').toLowerCase().trim();
        const seccion = String(firstScalar(rec.fields[FIELDS.seccion]) || '').toUpperCase().trim();
        const privado = asBool(firstScalar(rec.fields[FIELDS.privado]));
        // Activa, de una sección pública, y NO marcada como privada
        return estatus === 'activo' && (seccion === 'VARONIL' || seccion === 'FEMENIL') && !privado;
      })
      .map(rec => {
        const f = rec.fields;
        const seccion = String(firstScalar(f[FIELDS.seccion]) || '').toUpperCase().trim();
        const lugares = seccion === 'FEMENIL'
          ? firstScalar(f[FIELDS.lugaresF])
          : firstScalar(f[FIELDS.lugaresV]);
        const casas = toCasasArray(f[FIELDS.casa]);
        const nombreRaw = String(firstScalar(f[FIELDS.nombreCompleto]) || '').trim();
        // Intenta idActividad, si falla extrae del prefijo del nombre: "AF027 - Título"
        let id = String(firstScalar(f[FIELDS.idActividad]) || '').trim().toUpperCase();
        if (!id && nombreRaw) {
          const m = nombreRaw.match(/^([A-Z]{2}\d+(?:-\d+)?)/);
          if (m) id = m[1];
        }
        // La cuota SOLO se expone si Estatus Cuota = Aprobada.
        // Institucionales / SM / cualquier "En revisión" salen sin precio
        // (el front las marca "No disponible" y no permite registro).
        const estatusCta = String(firstScalar(f[FIELDS.estatusCuota]) || '').toLowerCase().trim();
        const registroChk = asBool(firstScalar(f[FIELDS.registro]));
        const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        const DIRIGIDO_EXCLUIDOS = ['icami', 'ipade', 'liceo blueridge', 'ciudad de los ninos'];
        const dirigidoExcluido = DIRIGIDO_EXCLUIDOS.includes(norm(firstScalar(f[FIELDS.dirigidoA])));
        // Cuota visible solo si aprobada + Registro ✓ + no es dirigido excluido
        const cuotaAprobada = estatusCta === 'aprobada' && registroChk && !dirigidoExcluido;
        const cuotaRaw = String(firstScalar(f[FIELDS.cuota]) || '').trim();
        return {
          id,
          nombre:         nombreRaw,
          casa:           casas,                // ahora siempre array
          casaPrincipal:  casas[0] || '',       // para retrocompatibilidad
          fechaCompleta:  String(firstScalar(f[FIELDS.fechaCompleta]) || '').trim(),
          fechaInicio:    String(firstScalar(f[FIELDS.fechaInicio]) || '').trim(),
          fechaFin:       String(firstScalar(f[FIELDS.fechaFin]) || '').trim(),
          seccion,
          lugares:        parseLugares(lugares),
          cuota:          cuotaAprobada ? cuotaRaw : '',
          cuotaAprobada,
        };
      })
      .filter(a => a.id) // descarta sin ID
      .sort((a, b) => {
        // ordena por fechaInicio ascendente; si no hay, deja como vienen
        if (!a.fechaInicio) return 1;
        if (!b.fechaInicio) return -1;
        return a.fechaInicio.localeCompare(b.fechaInicio);
      });

    return res.status(200).json({
      count: activas.length,
      actividades: activas,
    });

  } catch (err) {
    console.error('actividades-lista error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
