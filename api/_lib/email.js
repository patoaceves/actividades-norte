// api/_lib/email.js
// Plantillas del correo de confirmación de registro, portadas 1:1 desde la
// automation de Airtable. Un solo punto de verdad para el HTML del correo.
//
// Uso:
//   const { construirEmailBody, formatMXN } = require('./_lib/email');
//   const html = construirEmailBody({ idAsistente, actividad, fechaCompleta,
//                                     casa, metodoPago, lugaresDisponibles,
//                                     contadoMxn, apartadoMxn, msiMxn });

// Formatea un número o string a "MX$X,XXX". Acepta ya-formateado, número, o
// "Pendiente" (fallback igual que el script original).
function formatMXN(v) {
  if (v === null || v === undefined || v === '') return 'Pendiente';
  if (typeof v === 'number') {
    return 'MX$' + v.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  const s = String(v).trim();
  // Si ya viene con formato (MX$, $), respétalo.
  if (/mx\$|\$/i.test(s)) return s;
  const n = parseInt(s.replace(/[^\d]/g, ''), 10);
  if (isNaN(n)) return s || 'Pendiente';
  return 'MX$' + n.toLocaleString('es-MX');
}

const LINK_FACTURA = 'https://airtable.com/appPMeHoVCbIFOVWB/pagQxESVY1iya2mrx/form';

function bloqueFactura() {
  return `<p>En caso de requerir factura, esta será emitida en el siguiente mes contable al que se realizó el pago. Por favor, llena tu solicitud <a href="${LINK_FACTURA}">aquí</a>.</p>`;
}

// Cabecera común: saludo + ID + actividad + fecha + casa
function cabeceraExito({ idAsistente, actividad, fechaCompleta, casa }) {
  return `
    <p>Hola, ¡tu registro se ha realizado con éxito!</p>
    <p>Aquí están los detalles de tu inscripción:</p>
    <p style="font-size: 22px;"><strong><span style="color: black;">ID de Asistente:</span></strong> <strong><span style="color: red;">${idAsistente}</span></strong></p>
    <br>
    <p style="font-size: 22px;"><strong>${actividad}</strong></p>
    <p><strong>Fecha:</strong> ${fechaCompleta}<br>
    <strong>Casa:</strong> ${casa}</p>
    <br>`;
}

// Construye el cuerpo HTML del correo según método de pago y disponibilidad.
// Devuelve { subject, html }. Si no hay lugares, subject/flow de disculpa.
function construirEmailBody({
  idAsistente, actividad, fechaCompleta, casa,
  metodoPago, lugaresDisponibles,
  contadoMxn, apartadoMxn, msiMxn,
}) {
  const contado  = formatMXN(contadoMxn);
  const apartado = formatMXN(apartadoMxn);
  const msi      = formatMXN(msiMxn);

  // 1) SIN LUGARES — disculpa
  if (String(lugaresDisponibles).trim().toUpperCase() === 'NO') {
    const html = `
    <p>Hola, gracias por tu interés en registrarte.</p>
    <p>Lamentablemente, <strong>ya no hay lugares disponibles</strong> para la siguiente actividad:</p>
    <p style="font-size: 22px;"><strong>${actividad}</strong></p>
    <p><strong>Fecha:</strong> ${fechaCompleta}<br>
    <strong>Casa:</strong> ${casa}</p>
    <br>
    <p>Te pedimos una disculpa por los inconvenientes. Si tienes alguna duda o deseas que te avisemos de futuras fechas, no dudes en contactarnos.</p>`;
    return { subject: `Sin lugares disponibles - ${actividad}`, html };
  }

  const cab = cabeceraExito({ idAsistente, actividad, fechaCompleta, casa });
  const subjectExito = `Registro confirmado - ${actividad}`;

  // 2) CONTADO con Tarjeta/OXXO
  if (metodoPago === 'Contado - Pago con Tarjeta/OXXO') {
    return {
      subject: subjectExito,
      html: `${cab}
    <p><strong style="color: black;">Monto de Contado (100%):</strong> <strong style="color: red;">${contado}</strong></p>
    <br>
    ${bloqueFactura()}`,
    };
  }

  // 3) 3 MSI con Tarjeta
  if (metodoPago === '3MSI - Pago con Tarjeta') {
    return {
      subject: subjectExito,
      html: `${cab}
    <p><strong style="color: black;">Monto Total a 3 MSI:</strong> <strong style="color: red;">${msi}</strong></p>
    <br>
    ${bloqueFactura()}`,
    };
  }

  // 4) APARTADO con Tarjeta/OXXO
  if (metodoPago === 'Apartado - Pago con Tarjeta/OXXO') {
    return {
      subject: subjectExito,
      html: `${cab}
    <p><strong style="color: black;">Monto de Apartado (33%):</strong> <strong style="color: red;">${apartado}</strong></p>
    <br>
    ${bloqueFactura()}`,
    };
  }

  // 5) CONTADO por Depósito Bancario
  if (metodoPago === 'Contado - Depósito Bancario') {
    return {
      subject: subjectExito,
      html: `${cab}
    <p><strong style="color: black;">Monto de Contado (100%):</strong> <strong style="color: red;">${contado}</strong></p>
    <p>Para asegurar tu lugar, completa tu pago realizando una transferencia o depósito bancario a la siguiente cuenta:</p>
    <br>
    <p><strong style="color: red;">Acción Cultural y Social de Monterrey AC</strong></p>
    <p><strong>RFC:</strong> ACS610310B97</p>
    <p><strong>Banco:</strong> Banorte</p>
    <p><strong>Cuenta:</strong> 0559848339</p>
    <p><strong>CLABE:</strong> 072 078 005 598 483 398</p>
    <p style="font-size: 22px;"><strong><span style="color: black;">Concepto o Referencia:</span></strong> <strong><span style="color: red;">${idAsistente}</span></strong></p>
    <br>
    <p><strong>Por favor, envía tu comprobante de pago a <span style="color: red;">operaciones@los-pinos.org</span> para completar tu registro.</strong></p>
    <p><strong style="color: red;">No olvides incluir el Concepto o Referencia en tu ficha de depósito.</strong></p>
    <br>
    <p><strong style="color: red;">Importante:</strong> <strong style="color: black;">Tu lugar no queda reservado hasta que el depósito se vea reflejado correctamente en la cuenta de Los Pinos.</strong></p>
    <br>
    ${bloqueFactura()}`,
    };
  }

  // Fallback: método inválido
  return {
    subject: subjectExito,
    html: `<p><strong style="color: red;">Error: Método de pago inválido.</strong></p>`,
  };
}

// Envía el correo vía Resend. Best-effort: nunca lanza; devuelve
// { ok, id?, error? }. Requiere RESEND_API_KEY y EMAIL_FROM en el entorno.
async function enviarEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.EMAIL_FROM; // ej "Actividades Norte <registro@actividadesnorte.com>"
  if (!apiKey || !from) {
    return { ok: false, error: 'RESEND_API_KEY o EMAIL_FROM no configurado' };
  }
  if (!to) return { ok: false, error: 'destinatario vacío' };

  try {
    const payload = { from, to: [to], subject, html };
    if (process.env.EMAIL_BCC) payload.bcc = [process.env.EMAIL_BCC];
    if (process.env.EMAIL_REPLY_TO) payload.reply_to = [process.env.EMAIL_REPLY_TO];

    const r = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) return { ok: false, error: JSON.stringify(data) };
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { construirEmailBody, enviarEmail, formatMXN };
