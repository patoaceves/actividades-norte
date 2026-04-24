// api/payment-intent.js
// Crea un PaymentIntent de Stripe (embebido, no redirect a checkout)
// Env vars: STRIPE_SECRET_KEY_VARONIL, STRIPE_SECRET_KEY_FEMENIL

function calcularMonto(cuotaRaw, tipoPago) {
  const n = parseInt(String(cuotaRaw || '0').replace(/MX\$|,|\s/g, ''), 10);
  if (tipoPago === 'Apartado') {
    const base = n / 3;
    const fee  = (base * 0.036 + 3) * 1.22;
    return Math.ceil((base + fee) / 50) * 50 * 100;
  }
  return Math.round(n / 50) * 50 * 100;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    genero, tipoPago, metodoPago,
    cuota, idAsistente, idActividad,
    email, nombre, recordId,
  } = req.body || {};

  const secretKey = genero === 'femenil'
    ? process.env.STRIPE_SECRET_KEY_FEMENIL
    : process.env.STRIPE_SECRET_KEY_VARONIL;

  if (!secretKey) return res.status(500).json({ error: `STRIPE_SECRET_KEY_${(genero||'varonil').toUpperCase()} no configurado` });

  try {
    const amount  = calcularMonto(cuota, tipoPago);
    const isOXXO  = metodoPago === 'OXXO en Efectivo';

    const body = new URLSearchParams();
    body.append('amount',   String(amount));
    body.append('currency', 'mxn');

    if (isOXXO) {
      body.append('payment_method_types[]', 'oxxo');
      body.append('payment_method_options[oxxo][expires_after_days]', '3');
    } else {
      body.append('payment_method_types[]', 'card');
    }

    if (email) body.append('receipt_email', email);
    body.append('description',          idActividad || 'Actividad Norte');
    body.append('metadata[id_asistente]', idAsistente || '');
    body.append('metadata[id_actividad]', idActividad || '');
    body.append('metadata[genero]',       genero      || '');
    body.append('metadata[tipo_pago]',    tipoPago    || '');
    body.append('metadata[metodo_pago]',  metodoPago  || '');
    body.append('metadata[record_id]',    recordId    || '');

    const r    = await fetch('https://api.stripe.com/v1/payment_intents', {
      method:  'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });
    const pi = await r.json();
    if (pi.error) throw new Error(pi.error.message);

    return res.status(200).json({ clientSecret: pi.client_secret, amount });

  } catch (err) {
    console.error('payment-intent error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
