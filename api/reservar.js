// api/reservar.js — POST /api/reservar
// Crea una solicitud de reservación en la tabla "+ Actividad".
// Body JSON: { seccion, nombreActividad, casas[], dirigidoA, quienCoordina,
//              fechaInicio, fechaFin, asistentes, sacerdotes, adicionales,
//              solicitante, email, whatsapp }

const BASE  = 'appxtlc0kwOVOI0lm';
const TABLE = 'tbljLylxugktHgIvT'; // + Actividad

const F = {
  nombreActividad: 'fldsB2SQxPoR4DDcB',
  seccion:         'fldePYgqGumeE6nqK',
  casas:           'fldS8o2KfV2eWtHN6', // multipleSelects
  dirigidoA:       'fld4HD2a8ZididbWX',
  quienCoordina:   'fldKTpvs0nNcmtZX2',
  fechaInicio:     'fldLStb6rjq3YNzV5',
  fechaFin:        'fldh52rwydw7PPPNq',
  asistentes:      'fldbH4mXzhfvHWJcW',
  sacerdotes:      'fldckzICIg6K3Y5jS',
  adicionales:     'fldPX6pDiZ0mMrmdG',
  solicitante:     'fldPr3jQdn6wRHZfC',
  email:           'fldHNQymMWIr8WiQi',
  whatsapp:        'fld7gwUzOcK58Gjx8',
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  const solicitante = String(b.solicitante || '').trim();
  const email       = String(b.email || '').trim();
  const fechaInicio = String(b.fechaInicio || '').trim();

  if (!solicitante || !email || !fechaInicio) {
    return res.status(400).json({ error: 'Faltan datos: nombre, correo y fecha de inicio son obligatorios.' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
  }

  const pat = process.env.AIRTABLE_PAT_ACTIVIDADES;
  if (!pat) return res.status(500).json({ error: 'AIRTABLE_PAT_ACTIVIDADES no configurado' });

  const casasArr = Array.isArray(b.casas) ? b.casas.filter(Boolean)
                 : (b.casas ? [b.casas] : []);

  const fields = {};
  const set = (id, val) => { if (val !== undefined && val !== '' && val !== null) fields[id] = val; };

  set(F.nombreActividad, String(b.nombreActividad || '').trim() || `Solicitud — ${solicitante}`);
  set(F.seccion,       b.seccion ? String(b.seccion).trim() : undefined);
  if (casasArr.length) fields[F.casas] = casasArr;
  set(F.dirigidoA,     b.dirigidoA ? String(b.dirigidoA).trim() : undefined);
  set(F.quienCoordina, String(b.quienCoordina || '').trim() || undefined);
  set(F.fechaInicio,   fechaInicio);
  set(F.fechaFin,      String(b.fechaFin || '').trim() || undefined);
  set(F.asistentes,    num(b.asistentes));
  set(F.sacerdotes,    num(b.sacerdotes));
  set(F.adicionales,   num(b.adicionales));
  set(F.solicitante,   solicitante);
  set(F.email,         email);
  set(F.whatsapp,      String(b.whatsapp || '').trim() || undefined);

  try {
    const r = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('reservar airtable error:', JSON.stringify(data));
      return res.status(502).json({ error: 'No se pudo guardar la solicitud. Intenta de nuevo.' });
    }
    return res.status(200).json({ ok: true, id: data.records && data.records[0] && data.records[0].id });
  } catch (err) {
    console.error('reservar error:', err.message);
    return res.status(500).json({ error: 'Error al guardar la solicitud.' });
  }
};
