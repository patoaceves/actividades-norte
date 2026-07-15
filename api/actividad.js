// api/actividad.js — GET /api/actividad?id=AV026
// Busca una actividad específica por ID.
// Nunca usa nombres de campo en filterByFormula — filtra en JS.
//
// v2 (merge): ahora LEE los campos de control que la versión anterior ignoraba
// (Sitio web, Registro, Privado, Estatus Cuota) y expone prorrateo, las 4
// variantes de cuota y los extras. El campo que dispara el COBRO real en Stripe
// (Cuota Stripe MX$) queda intacto: no se cambia lógica de dinero aquí.

const BASE  = 'appxtlc0kwOVOI0lm';
const TABLE = 'tbl2TeJgRtxbhWJMa';

const FIELDS = {
  idActividad:    'fldzIa1RbjhIBivKF',
  nombre:         'fldvqjXPKFoQXgAMe', // Full ID: "AF035-1 - Título"
  cuota:          'fldVePGXnIEkMWciI', // Cuota Stripe MX$  (FUENTE DEL COBRO — no tocar)
  casa:           'fldBg4qtC8fWw9I4n',
  fechaCompleta:  'fldSwY4v4Rhlf2iK3',
  fechaInicio:    'fldu09zPOwDLytAcm',
  fechaFin:       'fld0dIPfVqJPpvQ4H',
  seccion:        'fldXXEE93HzWeMoH1', // VARONIL / FEMENIL / Actividad Personal del Sacerdote
  dirigidoA:      'fldNPjqTvcvVSTcde',
  direccion:      'fldUBbL4v6HKXGU1z',
  googleMapsUrl:  'fldjydLIKiXOxvyQE',
  lugaresV:       'fldSZapFVdBE7vooa',
  lugaresF:       'fld8OQ8NitjT2sHEA',
  coordNombre:    'fldZHaRin61NSuHSM',
  coordWhatsapp:  'fld0zWc2reFz5IkmN',
  coordEmail:     'fldXjfW9suvjTiJ8I',
  menuInicio:     'fldAfRzp1icbT91jv',
  menuFin:        'fldVZ8wXIgwiw3AcM',
  // ── control (antes ignorados) ──
  estatus:        'fldiVU5kOK5onLxa9', // Activo / Finalizado / Descartado
  estatusCuota:   'fldIR9pYBqEv801Rt', // Aprobada / En revisión
  sitioWeb:       'fldxJHVBlDZvB99UF', // checkbox
  registro:       'fld1z0mmnzign2JBL', // checkbox
  privado:        'fldQ7jrATbHqtam6L', // checkbox
  // ── 4 variantes de cuota (display) ──
  cuotaSinExtras:        'fldV4YZ75rJT2EDUM',
  cuotaSinExtrasStripe:  'fldkqJC5jvnmKMTjn',
  cuotaConExtras:        'fldkgbouFt7lVcoP2',
  cuotaConExtrasStripe:  'fldanpSmM75q8Sz4q',
};

// Extras: [etiqueta, fieldId del costo unitario ($)]. El endpoint solo expone
// los extras que tengan costo > 0 en esta actividad.
const EXTRAS = [
  ['Media Mañana',                                        'fldf6pP3p4JvykFtQ'],
  ['Media Tarde',                                         'fldjlethELxxQCWz0'],
  ['Barras de Chocolate, Galletas y Bombón para Fogata',  'fldlrYXuJ6pMoU7oC'],
  ['Pegote para Fogata',                                  'fldjUkFW4QeKKNHhD'],
  ['Aperitivo A',                                         'fld3m0B2YcolY76aK'],
  ['Aperitivo B',                                         'fldHc8xqstoAYB5pN'],
  ['Carne Asada',                                         'fldcUUjZs3e2hilOx'],
  ['Hamburguesa',                                         'fldL7BuVjrSfmiT9u'],
  ['Cerveza',                                             'fldZl4tZDpTZzcLJu'],
  ['Botella de Vino',                                     'fld99H43bb9UDRUKt'],
];

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

function firstVal(v) { return Array.isArray(v) ? v[0] : v; }
function asBool(v)   { return v === true || v === 1 || v === 'true'; }
function num(v)      { const n = Number(v); return Number.isNaN(n) ? 0 : n; }

const { montoContadoMXN, montoApartadoMXN } = require('./_lib/precios');
const { parseLugares } = require('./_lib/lugares');

// Cuota válida = numérica y > 0
function isCuotaValida(c) {
  if (c === null || c === undefined || c === '') return false;
  const n = parseInt(String(c).replace(/MX\$|,|\s/g, ''), 10);
  return !isNaN(n) && n > 0;
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = (req.query.id || '').trim().toUpperCase();
  if (!id) return res.status(400).json({ error: 'Falta parámetro id' });

  const pat = process.env.AIRTABLE_PAT_ACTIVIDADES;
  if (!pat) return res.status(500).json({ error: 'AIRTABLE_PAT_ACTIVIDADES no configurado' });

  try {
    // Traemos todos los campos definidos + los de extras
    const allFieldIds = [...Object.values(FIELDS), ...EXTRAS.map(e => e[1])];
    const fieldList = allFieldIds.map(f => `fields[]=${f}`).join('&');

    let exactMatch = null, fallbackMatch = null, offset = '', pages = 0;
    const MAX_PAGES = 20;

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
          if (nombre.startsWith(id + ' ') || nombre === id) fallbackMatch = rec;
        }
      }
      if (exactMatch) break;
      offset = data.offset || '';
      pages++;
    } while (offset && pages < MAX_PAGES);

    const found = exactMatch || fallbackMatch;
    if (!found) return res.status(404).json({ error: `Actividad no encontrada: ${id}` });

    const f = found.fields;

    // Casa como array
    let casas = [];
    const casaVal = f[FIELDS.casa];
    if (Array.isArray(casaVal)) casas = casaVal.map(x => String(x || '').trim()).filter(Boolean);
    else if (typeof casaVal === 'string' && casaVal.trim()) casas = casaVal.split(/[,;]\s*/).map(x => x.trim()).filter(Boolean);

    // Sección → prorrateo (FEMENIL prorratea; VARONIL no)
    const seccion   = String(firstVal(f[FIELDS.seccion]) || '').trim().toUpperCase();
    const prorrateo = seccion === 'FEMENIL';

    const lugaresRaw = seccion === 'FEMENIL' ? firstVal(f[FIELDS.lugaresF]) : firstVal(f[FIELDS.lugaresV]);
    const lugares = parseLugares(lugaresRaw);

    // ── Campos de control ──
    const estatus     = String(firstVal(f[FIELDS.estatus]) || '').trim();
    const estatusCta  = String(firstVal(f[FIELDS.estatusCuota]) || '').trim().toLowerCase();
    const sitioWeb    = asBool(firstVal(f[FIELDS.sitioWeb]));
    const privado     = asBool(firstVal(f[FIELDS.privado]));
    const registroChk = asBool(firstVal(f[FIELDS.registro]));

    const cuotaRaw      = String(firstVal(f[FIELDS.cuota]) || '').trim();
    const cuotaValida   = isCuotaValida(cuotaRaw);
    const cuotaAprobada = estatusCta === 'aprobada';
    // La cuota SOLO se muestra si está aprobada Y es numérica válida.
    const cuotaVisible  = cuotaAprobada && cuotaValida;

    const hayLugares = (lugares !== null && lugares !== undefined && !Number.isNaN(lugares) && lugares > 0);

    // Registro habilitado = checkbox Registro ✓ + hay lugares + cuota visible + activa
    const registroHabilitado = registroChk && hayLugares && cuotaVisible && estatus === 'Activo';

    // Extras disponibles (costo unitario > 0)
    const extras = EXTRAS
      .map(([nombre, fid]) => ({ nombre, costoUnitario: num(firstVal(f[fid])) }))
      .filter(e => e.costoUnitario > 0);

    return res.status(200).json({
      id,
      nombre:         String(firstVal(f[FIELDS.nombre]) || id).trim(),
      casa:           casas,
      casaPrincipal:  casas[0] || '',
      seccion,
      prorrateo,
      dirigidoA:      String(firstVal(f[FIELDS.dirigidoA]) || '').trim(),
      fechaCompleta:  String(firstVal(f[FIELDS.fechaCompleta]) || '').trim(),
      fechaInicio:    String(firstVal(f[FIELDS.fechaInicio]) || '').trim(),
      fechaFin:       String(firstVal(f[FIELDS.fechaFin]) || '').trim(),
      lugares,

      // ── flags de control (para que el front deje de adivinar) ──
      estatus,
      sitioWeb,
      privado,
      cuotaAprobada,
      cuotaVisible,
      registroHabilitado,

      // ── cuota (cobro real INTACTO) ──
      cuota:          cuotaVisible ? cuotaRaw : '',
      montoContado:   cuotaVisible ? montoContadoMXN(cuotaRaw)  : 0,
      montoApartado:  cuotaVisible ? montoApartadoMXN(cuotaRaw) : 0,

      // ── 4 variantes de cuota (display; solo si aprobada) ──
      cuotas: cuotaAprobada ? {
        sinExtras:        String(firstVal(f[FIELDS.cuotaSinExtras])        || '').trim(),
        sinExtrasStripe:  String(firstVal(f[FIELDS.cuotaSinExtrasStripe])  || '').trim(),
        conExtras:        String(firstVal(f[FIELDS.cuotaConExtras])        || '').trim(),
        conExtrasStripe:  String(firstVal(f[FIELDS.cuotaConExtrasStripe])  || '').trim(),
      } : null,

      // ── extras disponibles ──
      extras,

      direccion:      String(firstVal(f[FIELDS.direccion]) || '').trim(),
      googleMapsUrl:  String(firstVal(f[FIELDS.googleMapsUrl]) || '').trim(),
      menuInicio:     String(firstVal(f[FIELDS.menuInicio]) || '').trim(),
      menuFin:        String(firstVal(f[FIELDS.menuFin]) || '').trim(),
      coordinador: {
        nombre:   String(firstVal(f[FIELDS.coordNombre]) || '').trim(),
        whatsapp: String(firstVal(f[FIELDS.coordWhatsapp]) || '').trim(),
        email:    String(firstVal(f[FIELDS.coordEmail]) || '').trim(),
      },
    });

  } catch (err) {
    console.error('actividad error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
