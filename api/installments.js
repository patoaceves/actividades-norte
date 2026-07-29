// api/installments.js
// Flujo custom de pago con tarjeta (API directa de Stripe) para poder mostrar
// nuestra propia UI de mensualidades (sin la leyenda nativa del Payment
// Element). Dos acciones:
//
//   action: 'plans'   → adjunta el PaymentMethod al PaymentIntent y regresa
//                       los planes de mensualidades disponibles para esa
//                       tarjeta (available_plans). Lista vacia = solo contado.
//   action: 'confirm' → confirma el PaymentIntent, con plan de mensualidades
//                       si el usuario eligio uno, o de contado si no.
//
// El monto NUNCA viene del cliente: quedo fijado al crear el PI en
// payment-intent.js (leido de Airtable). Aqui solo se adjunta tarjeta,
// se consultan planes y se confirma. Un paymentIntentId ajeno no puede
// cruzarse de cuenta: cada secret key solo ve sus propios PIs.
//
// Env vars: STRIPE_SECRET_KEY_VARONIL, STRIPE_SECRET_KEY_FEMENIL

const { montoPlanCentavos } = require('./_lib/precios');

const GENEROS_VALIDOS = ['varonil', 'femenil'];

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

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { action, genero, paymentIntentId, paymentMethodId, plan } = req.body || {};

  if (!genero || !GENEROS_VALIDOS.includes(genero)) {
    return res.status(400).json({ error: `Género inválido o faltante: ${genero || '(vacío)'}` });
  }
  if (!/^pi_[A-Za-z0-9]+$/.test(String(paymentIntentId || ''))) {
    return res.status(400).json({ error: 'paymentIntentId inválido' });
  }

  const secretKey = genero === 'femenil'
    ? process.env.STRIPE_SECRET_KEY_FEMENIL
    : process.env.STRIPE_SECRET_KEY_VARONIL;
  if (!secretKey) {
    return res.status(500).json({ error: `STRIPE_SECRET_KEY_${genero.toUpperCase()} no configurado` });
  }

  const headers = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  try {
    if (action === 'plans') {
      if (!/^pm_[A-Za-z0-9]+$/.test(String(paymentMethodId || ''))) {
        return res.status(400).json({ error: 'paymentMethodId inválido' });
      }
      // Adjuntar la tarjeta al PI: la respuesta ya trae available_plans
      const body = new URLSearchParams({ payment_method: paymentMethodId });
      const r    = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
        method: 'POST', headers, body,
      });
      const data = await r.json();
      if (!r.ok) {
        return res.status(400).json({ error: data.error?.message || 'No se pudo verificar la tarjeta' });
      }
      const plans = data.payment_method_options?.card?.installments?.available_plans || [];
      // Solo mensualidades fijas, y NUNCA mas de 3 meses (politica del sitio):
      // aunque la cuenta de Stripe o la tarjeta ofrezcan 6/9/12, aqui se capan.
      // El total de cada plan lleva el recargo que iguala el neto al de contado.
      const MAX_MESES = 3;
      const base = parseInt(data.metadata?.base_amount_centavos, 10) || data.amount;
      return res.status(200).json({
        base,
        plans: plans
          .filter(p => p.type === 'fixed_count' && p.count && p.count <= MAX_MESES)
          .map(p => {
            const total = montoPlanCentavos(base, p.count);
            return total ? {
              count:    p.count,
              interval: p.interval || 'month',
              total,
              perMonth: Math.round(total / p.count),
            } : null;
          })
          .filter(Boolean),
      });
    }

    if (action === 'confirm') {
      // Leer el PI para conocer el monto base (contado). Si en un intento
      // anterior ya se ajusto el monto, el base quedo guardado en metadata,
      // asi que los reintentos y el cambio de plan nunca componen recargos.
      const rGet = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, { headers });
      const pi   = await rGet.json();
      if (!rGet.ok) {
        return res.status(400).json({ error: pi.error?.message || 'No se pudo leer el pago' });
      }
      const base = parseInt(pi.metadata?.base_amount_centavos, 10) || pi.amount;

      const quierePlan = plan && Number.isInteger(plan.count) && plan.count > 0;
      let montoDeseado = base;
      if (quierePlan) {
        montoDeseado = montoPlanCentavos(base, plan.count);
        if (!montoDeseado) {
          return res.status(400).json({ error: 'Solo se aceptan planes de hasta 3 meses' });
        }
      }

      // Ajustar el monto si no coincide (eligio meses, o regreso a contado)
      if (pi.amount !== montoDeseado) {
        const upd = new URLSearchParams({
          amount: String(montoDeseado),
          'metadata[base_amount_centavos]': String(base),
        });
        const rUpd = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
          method: 'POST', headers, body: upd,
        });
        const dUpd = await rUpd.json();
        if (!rUpd.ok) {
          return res.status(400).json({ error: dUpd.error?.message || 'No se pudo ajustar el monto del plan' });
        }
      }

      const body = new URLSearchParams();
      if (paymentMethodId) {
        if (!/^pm_[A-Za-z0-9]+$/.test(String(paymentMethodId))) {
          return res.status(400).json({ error: 'paymentMethodId inválido' });
        }
        body.append('payment_method', paymentMethodId);
      }
      if (quierePlan) {
        body.append('payment_method_options[card][installments][plan][count]', String(plan.count));
        body.append('payment_method_options[card][installments][plan][interval]', 'month');
        body.append('payment_method_options[card][installments][plan][type]', 'fixed_count');
      }
      const r    = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}/confirm`, {
        method: 'POST', headers, body,
      });
      const data = await r.json();
      if (!r.ok) {
        return res.status(400).json({ error: data.error?.message || 'No se pudo confirmar el pago' });
      }
      return res.status(200).json({
        status:         data.status,
        clientSecret:   data.client_secret,
        requiresAction: data.status === 'requires_action',
      });
    }

    return res.status(400).json({ error: `Acción desconocida: ${action || '(vacía)'}` });
  } catch (err) {
    console.error('installments:', err.message);
    return res.status(500).json({ error: 'Error interno al procesar el pago' });
  }
};
