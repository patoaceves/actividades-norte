// api/pagar.js — POST { idAsistente }
// Retomar el pago desde el correo ("Completar mi pago"):
//  1. Deriva la seccion del prefijo del ID (AV/AF) y usa SU cuenta de Stripe.
//  2. Busca los PaymentIntents del asistente (metadata id_asistente).
//  3. Si alguno esta succeeded -> yaPagado (no se permite pagar doble).
//     Si alguno esta processing -> enProceso (ej. guia OXXO acreditandose).
//     Si hay un intento previo -> regresa los datos para recrear el checkout
//     (el monto NUNCA viene de aqui: /api/payment-intent lo relee de Airtable).
//  4. Sin rastro -> 404 con contacto de soporte.

const KEYS = {
  varonil: () => process.env.STRIPE_SECRET_KEY_VARONIL,
  femenil: () => process.env.STRIPE_SECRET_KEY_FEMENIL,
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { idAsistente } = req.body || {};
    const id = String(idAsistente || '').trim().toUpperCase();
    if (!/^A[VF][A-Z0-9-]{2,40}$/.test(id)) {
      return res.status(400).json({ error: 'ID de Asistente inválido' });
    }
    const genero = id.startsWith('AF') ? 'femenil' : 'varonil';
    const secretKey = KEYS[genero]();
    if (!secretKey) {
      return res.status(500).json({ error: `Llave de Stripe (${genero}) no configurada` });
    }

    const query = `metadata['id_asistente']:'${id}'`;
    const r = await fetch(
      'https://api.stripe.com/v1/payment_intents/search?limit=20&query=' + encodeURIComponent(query),
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    const data = await r.json();
    if (!r.ok) {
      return res.status(400).json({ error: data.error?.message || 'No se pudo consultar el estado del pago' });
    }

    const pis = data.data || [];
    const pagado = pis.find(p => p.status === 'succeeded');
    if (pagado) {
      // Un apartado pagado NO es el fin del camino: falta el completado.
      const tipo = String(pagado.metadata?.tipo_pago || '');
      if (tipo === 'Apartado') {
        return res.status(200).json({ apartadoPagado: true, idAsistente: id });
      }
      return res.status(200).json({ yaPagado: true, idAsistente: id });
    }
    if (pis.some(p => p.status === 'processing')) {
      return res.status(200).json({ enProceso: true, idAsistente: id });
    }

    // El search regresa del mas reciente al mas viejo
    const prev = pis.find(p => p.metadata && p.metadata.id_actividad);
    if (!prev) {
      return res.status(404).json({
        error: 'No encontramos un pago pendiente para este ID de Asistente. Escríbenos a admin@actividadesnorte.com y con gusto te ayudamos.',
      });
    }

    const m = prev.metadata;
    return res.status(200).json({
      idAsistente: id,
      genero,
      recordId:    m.record_id && m.record_id !== 'N/A' ? m.record_id : null,
      idActividad: m.id_actividad,
      tipoPago:    m.tipo_pago || 'Contado',
      metodoPago:  m.metodo_pago && m.metodo_pago !== 'auto' ? m.metodo_pago : null,
      email:       prev.receipt_email || null,
      actividad: {
        nombre:        m.actividades_v || m.id_actividad,
        casa:          m.casa  || '',
        fechaCompleta: m.fecha || '',
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
