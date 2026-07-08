// api/_lib/precios.js
// ÚNICA FUENTE DE VERDAD para el cálculo de montos.
// Usada por /api/payment-intent.js (cobro real en Stripe) y por
// /api/actividad.js (montos que se muestran en /registro).
// El prefijo "_lib" evita que Vercel la exponga como endpoint.

// Parsea la cuota cruda de Airtable: "MX$4,500", "4500", etc.
function parseCuota(cuotaRaw) {
  const n = parseInt(String(cuotaRaw || '0').replace(/MX\$|,|\s/g, ''), 10);
  return (!n || isNaN(n)) ? 0 : n;
}

// Monto Contado en PESOS: cuota redondeada al múltiplo de 50 más cercano.
function montoContadoMXN(cuotaRaw) {
  const n = parseCuota(cuotaRaw);
  if (!n) return 0;
  return Math.round(n / 50) * 50;
}

// Monto Apartado en PESOS: un tercio de la cuota + fee de Stripe
// (3.6% + $3, con IVA 22%), redondeado HACIA ARRIBA al múltiplo de 50.
function montoApartadoMXN(cuotaRaw) {
  const n = parseCuota(cuotaRaw);
  if (!n) return 0;
  const base      = n / 3;
  const feeStripe = (base * 0.036 + 3) * 1.22;
  return Math.ceil((base + feeStripe) / 50) * 50;
}

// Monto en CENTAVOS para Stripe según tipo de pago.
// Lanza error si la cuota es inválida (misma semántica que el
// calcularMonto original de payment-intent.js).
function montoCentavos(cuotaRaw, tipoPago) {
  const n = parseCuota(cuotaRaw);
  if (!n) throw new Error('Cuota inválida en Airtable');
  const pesos = tipoPago === 'Apartado'
    ? montoApartadoMXN(cuotaRaw)
    : montoContadoMXN(cuotaRaw);
  return pesos * 100;
}

module.exports = { parseCuota, montoContadoMXN, montoApartadoMXN, montoCentavos };
