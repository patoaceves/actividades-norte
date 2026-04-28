// api/payment-intent.js
// Crea un PaymentIntent para Stripe Elements embebido (Payment Element).
//
// — Lee la cuota desde Airtable (cliente NO puede manipular el monto)
// — Respeta metodoPago si viene en el body:
//     'OXXO en Efectivo' → solo OXXO (con expires_after_days = 2)
//     'Tarjeta' u otro   → solo card (con MSI activo)
//     null / undefined   → automatic_payment_methods (Stripe muestra todos)
// — Metadata DIRECTA en el PaymentIntent
// — Idempotency-Key contra dobles clicks
//
// Env vars:
//   STRIPE_SECRET_KEY_VARONIL
//   STRIPE_SECRET_KEY_FEMENIL
//   AIRTABLE_PAT_ACTIVIDADES

const ACTIVIDADES = {
  base:  'appxtlc0kwOVOI0lm',
  table: 'tbl2TeJgRtxbhWJMa',
  fields: {
    idActividad:   'fldzIa1RbjhIBivKF',
    nombre:        'fldvqjXPKFoQXgAMe',
    cuota:         'fldVePGXnIEkMWciI',
    casa:          'fldBg4qtC8fWw9I4n',
    fechaCompleta: 'fldSwY4v4Rhlf2iK3',
    seccion:       'fldXXEE93HzWeMoH1',
  },
};

function firstVal(v) { return Array.isArray(v) ? v[0] : v; }

function calcularMonto(cuotaRaw, tipoPago) {
  const n = parseInt(String(cuotaRaw || '0').replace(/MX\$|,|\s/g, ''), 10);
  if (!n || isNaN(n)) throw new Error('Cuota inválida en Airtable');
  if (tipoPago === 'Apartado') {
    const base       = n / 3;
    const feeStripe  = (base * 0.036 + 3) * 1.22;
    return Math.ceil((base + feeStripe) / 50) * 50 * 100;
  }
  return Math.round(n / 50) * 50 * 100;
}

async function fetchActividadServer(idActividad) {
  const pat = process.env.AIRTABLE_PAT_ACTIVIDADES;
  if (!pat) throw new Error('AIRTABLE_PAT_ACTIVIDADES no configurado');

  const fl = Object.values(ACTIVIDADES.fields).map(f => `fields[]=${f}`).join('&');
  let found = null, offset = '', pages = 0;
  do {
    const url = `https://api.airtable.com/v0/${ACTIVIDADES.base}/${ACTIVIDADES.table}`
      + `?returnFieldsByFieldId=true&${fl}&pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const r    = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
    const data = await r.json();
    if (!r.ok) throw new Error(`Airtable: ${JSON.stringify(data)}`);
    found = data.records?.find(rec =>
      String(firstVal(rec.fields[ACTIVIDADES.fields.idActividad]) || '')
        .trim().toUpperCase() === idActividad.toUpperCase()
    );
    offset = found ? '' : (data.offset || '');
    pages++;
  } while (!found && offset && pages < 20);

  if (!found) throw new Error(`Actividad no encontrada: ${idActividad}`);
  const f = found.fields;
  return {
    nombre:        String(firstVal(f[ACTIVIDADES.fields.nombre])        || idActividad).trim(),
    cuota:         String(firstVal(f[ACTIVIDADES.fields.cuota])         || '0').trim(),
    casa:          String(firstVal(f[ACTIVIDADES.fields.casa])          || '').trim(),
    fechaCompleta: String(firstVal(f[ACTIVIDADES.fields.fechaCompleta]) || '').trim(),
    seccion:       String(firstVal(f[ACTIVIDADES.fields.seccion])       || '').toUpperCase().trim(),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const {
    genero, tipoPago, metodoPago,
    idAsistente, idActividad,
    email, recordId,
  } = req.body || {};

  if (!idActividad || !tipoPago) {
    return res.status(400).json({ error: 'Faltan datos para crear el pago' });
  }

  const secretKey = genero === 'femenil'
    ? process.env.STRIPE_SECRET_KEY_FEMENIL
    : process.env.STRIPE_SECRET_KEY_VARONIL;

  if (!secretKey) {
    return res.status(500).json({
      error: `STRIPE_SECRET_KEY_${(genero || 'varonil').toUpperCase()} no configurado`,
    });
  }

  try {
    // 1. Releer actividad de Airtable (fuente de verdad)
    const actividad = await fetchActividadServer(idActividad);
    const amount    = calcularMonto(actividad.cuota, tipoPago);

    const body = new URLSearchParams();
    body.append('amount',   String(amount));
    body.append('currency', 'mxn');

    // ── Métodos de pago según lo que pre-seleccionó el user ─────────
    const isOXXO = metodoPago === 'OXXO en Efectivo';

    if (isOXXO) {
      body.append('payment_method_types[]', 'oxxo');
      body.append('payment_method_options[oxxo][expires_after_days]', '2');
    } else if (metodoPago) {
      // Cualquier valor distinto de OXXO → solo card
      body.append('payment_method_types[]', 'card');
      body.append('payment_method_options[card][installments][enabled]', 'true');
    } else {
      // Sin pre-selección → Stripe muestra todos los métodos habilitados
      body.append('automatic_payment_methods[enabled]', 'true');
      body.append('payment_method_options[card][installments][enabled]', 'true');
      body.append('payment_method_options[oxxo][expires_after_days]', '2');
    }

    if (email) body.append('receipt_email', email);
    body.append('description',
      `${idActividad} · ${idAsistente || ''} · ${tipoPago}`);

    // ── Metadata DIRECTA en el PaymentIntent ────────────────────────
    // (la automation de Airtable la lee con un solo fetch al PI)
    const meta = {
      id_asistente:   idAsistente || 'N/A',
      id_actividad:   idActividad,
      genero:         genero || 'N/A',
      tipo_pago:      tipoPago,
      metodo_pago:    metodoPago || 'auto',
      // Aliases retrocompat con automation antigua
      metodo_de_pago: metodoPago || `${tipoPago} - Pago con Tarjeta/OXXO`,
      actividades_v:  actividad.nombre,
      record_id:      recordId || 'N/A',
      casa:           actividad.casa,
      fecha:          actividad.fechaCompleta,
    };
    Object.entries(meta).forEach(([k, v]) => {
      body.append(`metadata[${k}]`, String(v || ''));
    });

    const idemKey = `pi-${idAsistente || recordId || idActividad}-${tipoPago}-${metodoPago || 'auto'}`;

    const r  = await fetch('https://api.stripe.com/v1/payment_intents', {
      method:  'POST',
      headers: {
        Authorization:    `Bearer ${secretKey}`,
        'Content-Type':   'application/x-www-form-urlencoded',
        'Idempotency-Key': idemKey,
      },
      body: body.toString(),
    });
    const pi = await r.json();
    if (pi.error) throw new Error(pi.error.message);

    return res.status(200).json({
      clientSecret:    pi.client_secret,
      paymentIntentId: pi.id,
      amount,
      tipoPago,
      metodoPago: metodoPago || 'auto',
      actividad: {
        nombre:        actividad.nombre,
        casa:          actividad.casa,
        fechaCompleta: actividad.fechaCompleta,
      },
    });

  } catch (err) {
    console.error('payment-intent error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
