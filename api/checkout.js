// api/checkout.js
// Env vars en Vercel:
//   STRIPE_SECRET_KEY_VARONIL
//   STRIPE_SECRET_KEY_FEMENIL

function calcularMonto(cuotaRaw, tipoPago) {
  const cuotaNum = parseInt(
    String(cuotaRaw || '0').replace(/MX\$|,|\s/g, ''), 10
  );
  if (tipoPago === 'Contado') {
    return Math.round(cuotaNum / 50) * 50 * 100;
  }
  if (tipoPago === 'Apartado') {
    const base       = cuotaNum / 3;
    const feeStripe  = (base * 0.036 + 3) * 1.22;
    const redondeado = Math.ceil((base + feeStripe) / 50) * 50;
    return redondeado * 100;
  }
  return Math.round(cuotaNum / 50) * 50 * 100;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    email, recordId, idAsistente, idActividad,
    tipoPago, metodoPago, genero, actividad,
  } = req.body || {};

  const stripeKey = genero === 'femenil'
    ? process.env.STRIPE_SECRET_KEY_FEMENIL
    : process.env.STRIPE_SECRET_KEY_VARONIL;

  if (!stripeKey) {
    return res.status(500).json({ error: `STRIPE_SECRET_KEY_${(genero || 'varonil').toUpperCase()} no configurado` });
  }
  if (!email || !tipoPago || !metodoPago || !actividad?.cuota) {
    return res.status(400).json({ error: 'Faltan datos para crear la sesión de pago' });
  }

  try {
    const montoCentavos = calcularMonto(actividad.cuota, tipoPago);
    const esOXXO        = metodoPago === 'OXXO en Efectivo';
    const baseUrl       = 'https://registro.actividadesnorte.com';

    const body = new URLSearchParams();
    body.append('payment_method_types[]', 'card');
    if (esOXXO) body.append('payment_method_types[]', 'oxxo');

    body.append('mode', 'payment');
    body.append('customer_email', email);
    body.append('success_url', `${baseUrl}/pages/success?id=${encodeURIComponent(idAsistente || '')}`);
    body.append('cancel_url',  `${baseUrl}/pages/registro?id=${encodeURIComponent(idActividad || '')}`);

    const descripcion = [actividad.casa, actividad.fechaCompleta].filter(Boolean).join(' · ');
    body.append('line_items[0][price_data][currency]',                  'mxn');
    body.append('line_items[0][price_data][product_data][name]',        actividad.nombre || 'Actividad');
    body.append('line_items[0][price_data][product_data][description]', descripcion);
    body.append('line_items[0][price_data][unit_amount]',               String(montoCentavos));
    body.append('line_items[0][quantity]',                              '1');

    body.append('metadata[id_asistente]', idAsistente  || 'N/A');
    body.append('metadata[id_actividad]', idActividad  || 'N/A');
    body.append('metadata[genero]',       genero       || 'N/A');
    body.append('metadata[tipo_pago]',    tipoPago);
    body.append('metadata[metodo_pago]',  metodoPago);
    body.append('metadata[record_id]',    recordId     || 'N/A');

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    const session = await stripeRes.json();
    if (session.error) throw new Error(session.error.message);

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('checkout error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
