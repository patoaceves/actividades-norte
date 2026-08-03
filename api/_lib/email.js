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

// ── Diseño del correo: identidad del sitio, estilos inline email-safe ──
// Opcion B "editorial crema": tarjeta blanca sobre crema, eyebrow mono dorado,
// ID protagonista entre lineas finas, footer verde con la info del sitio.
const C = {
  verde: '#2A4030', crema: '#F6F1E7', crema2: '#EFE8DA', dorado: '#A07840',
  amarillo: '#FBF3DC', tinta: '#1A1C18', muted: '#6B7066',
};

const LINK_FACTURA = 'https://airtable.com/appPMeHoVCbIFOVWB/pagQxESVY1iya2mrx/form';
const LINK_DATOS_BANCARIOS = 'https://tr4nsfer.me/los-pinos';
const BASE_SITIO = (process.env.PUBLIC_BASE_URL || 'https://www.actividadesnorte.com').replace(/\/+$/, '');
const WHATSAPP_SOPORTE = 'https://wa.me/528134025784?text=' +
  encodeURIComponent('Hola, quisiera pedir soporte para la Plataforma de Reserva de Actividades Norte');

function filaDato(label, valor, destacado) {
  const estilo = destacado
    ? `padding:7px 0;font-weight:bold;color:${C.verde};font-size:15px`
    : `padding:7px 0;color:${C.tinta}`;
  return `<tr><td style="padding:7px 0;color:${C.muted};width:110px;vertical-align:top">${label}</td><td style="${estilo}">${valor}</td></tr>`;
}

function tablaDatos(filas) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;font-family:Georgia,serif">${filas.join('')}</table>`;
}

function cajaId(idAsistente) {
  return `
    <div style="text-align:center;margin:24px 0;padding:18px 0;border-top:1px solid ${C.crema2};border-bottom:1px solid ${C.crema2}">
      <div style="font-family:Menlo,Consolas,'Courier New',monospace;font-size:11px;letter-spacing:2px;color:${C.dorado};text-transform:uppercase;margin-bottom:8px">ID de Asistente</div>
      <span style="font-family:Menlo,Consolas,'Courier New',monospace;font-size:30px;font-weight:bold;color:${C.verde};letter-spacing:2px">${idAsistente}</span>
      <div style="font-size:12px;color:${C.muted};margin-top:8px">Guarda esta clave, la necesitas para completar tu proceso de pago</div>
    </div>`;
}

function botonVerde(href, label) {
  return `
    <div style="text-align:center;margin:26px 0 8px">
      <a href="${href}" style="display:inline-block;background:${C.verde};color:${C.crema};font-family:Georgia,serif;font-size:15px;padding:14px 34px;border-radius:8px;text-decoration:none">${label}</a>
    </div>`;
}

function cajaAmarilla(html) {
  return `<div style="background:${C.amarillo};border:1px solid rgba(160,120,64,.35);border-radius:8px;padding:12px 16px;font-size:13px;color:${C.tinta};line-height:1.6;margin-top:16px;font-family:Georgia,serif">${html}</div>`;
}

// Boton para retomar el pago desde el correo. El endpoint /api/pagar valida
// que el asistente no tenga ya un pago completado antes de recrear el checkout.
function bloqueRetomarPago(idAsistente) {
  const url = `${BASE_SITIO}/registro?pagar=${encodeURIComponent(idAsistente)}`;
  return `
    <p style="font-size:14px;color:${C.tinta};line-height:1.7;margin:24px 0 0;font-family:Georgia,serif">¿No pudiste completar tu pago en el checkout?</p>
    ${botonVerde(url, 'Completar mi pago')}
    <div style="text-align:center;font-size:12px;color:${C.muted};margin-top:2px;font-family:Georgia,serif">Si tu pago ya se realizó, este enlace te lo confirmará y no se te cobrará de nuevo.</div>`;
}

function bloqueFactura() {
  return `<p style="font-size:12px;color:${C.muted};line-height:1.6;margin:20px 0 0;font-family:Georgia,serif">En caso de requerir factura, esta será emitida en el siguiente mes contable al que se realizó el pago. Por favor, llena tu solicitud <a href="${LINK_FACTURA}" style="color:${C.dorado}">aquí</a>.</p>`;
}

function footerVerde() {
  const lbl = `font-family:Menlo,Consolas,'Courier New',monospace;font-size:10px;letter-spacing:2px;color:${C.dorado};text-transform:uppercase;margin-bottom:8px`;
  const txt = `font-size:12px;color:rgba(246,241,231,.85);line-height:1.8`;
  return `
  <div style="background:${C.verde};border-radius:0 0 8px 8px;padding:28px 36px;font-family:Georgia,serif">
    <div style="margin-bottom:20px">
      <span style="font-size:17px;color:${C.crema}">Actividades Norte</span>
      <span style="font-family:Menlo,Consolas,'Courier New',monospace;font-size:10px;letter-spacing:3px;color:${C.dorado};text-transform:uppercase;margin-left:10px">Los Pinos</span>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="40%" style="vertical-align:top;padding-right:10px">
        <div style="${lbl}">Oficinas</div>
        <div style="${txt}">Níspero 211-A<br>Valle del Campestre<br>San Pedro Garza García, NL 66265</div>
      </td>
      <td width="25%" style="vertical-align:top;padding-right:10px">
        <div style="${lbl}">Horario</div>
        <div style="${txt}">Lun a Vie<br>10:00 a 18:00</div>
      </td>
      <td width="35%" style="vertical-align:top">
        <div style="${lbl}">Contacto</div>
        <div style="${txt}">
          <a href="${WHATSAPP_SOPORTE}" style="color:rgba(246,241,231,.85);text-decoration:none">+52 81 3402 5784</a><br>
          <a href="mailto:admin@actividadesnorte.com" style="color:rgba(246,241,231,.85);text-decoration:none">admin@actividadesnorte.com</a>
        </div>
      </td>
    </tr></table>
  </div>`;
}

// Envuelve el contenido en la tarjeta con eyebrow, titulo y footer verde.
function envolver({ eyebrow, saludo, inner }) {
  return `
<div style="background:${C.crema};padding:30px 12px;font-family:Georgia,serif">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid ${C.crema2}">
    <div style="padding:34px 36px 28px">
      <div style="font-family:Menlo,Consolas,'Courier New',monospace;font-size:10px;letter-spacing:3px;color:${C.dorado};text-transform:uppercase;margin-bottom:14px">${eyebrow}</div>
      <h1 style="font-size:26px;color:${C.verde};margin:0;font-weight:normal">Actividades <span style="color:${C.dorado};font-style:italic">Norte</span></h1>
      <p style="font-size:14px;color:${C.tinta};line-height:1.7;margin:14px 0 0">${saludo}</p>
      ${inner}
    </div>
    ${footerVerde()}
  </div>
</div>`;
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

  const filasBase = [
    filaDato('Actividad', `<strong>${actividad}</strong>`),
    filaDato('Fecha', fechaCompleta),
    filaDato('Casa', casa),
  ];

  // 1) SIN LUGARES: disculpa
  if (String(lugaresDisponibles).trim().toUpperCase() === 'NO') {
    return {
      subject: `Sin lugares disponibles - ${actividad}`,
      html: envolver({
        eyebrow: 'Sin lugares disponibles',
        saludo: 'Hola, gracias por tu interés en registrarte. Lamentablemente, <strong>ya no hay lugares disponibles</strong> para la siguiente actividad:',
        inner: `
          <div style="margin-top:20px">${tablaDatos(filasBase)}</div>
          <p style="font-size:14px;color:${C.tinta};line-height:1.7;margin:20px 0 0">Te pedimos una disculpa por los inconvenientes. Si tienes alguna duda o deseas que te avisemos de futuras fechas, no dudes en contactarnos.</p>`,
      }),
    };
  }

  const saludoExito = 'Hola, ¡tu registro se ha realizado con éxito! Aquí están los detalles de tu inscripción:';
  const subjectExito = `Registro confirmado - ${actividad}`;

  // 2) CONTADO con Tarjeta/OXXO
  if (metodoPago === 'Contado - Pago con Tarjeta/OXXO') {
    return {
      subject: subjectExito,
      html: envolver({
        eyebrow: 'Registro confirmado',
        saludo: saludoExito,
        inner: `${cajaId(idAsistente)}${tablaDatos([...filasBase, filaDato('Monto de contado (100%)', contado, true)])}${bloqueRetomarPago(idAsistente)}${bloqueFactura()}`,
      }),
    };
  }

  // 3) 3 MSI con Tarjeta
  if (metodoPago === '3MSI - Pago con Tarjeta') {
    return {
      subject: subjectExito,
      html: envolver({
        eyebrow: 'Registro confirmado',
        saludo: saludoExito,
        inner: `${cajaId(idAsistente)}${tablaDatos([...filasBase, filaDato('Monto total a 3 MSI', msi, true)])}${bloqueRetomarPago(idAsistente)}${bloqueFactura()}`,
      }),
    };
  }

  // 4) APARTADO con Tarjeta/OXXO
  if (metodoPago === 'Apartado - Pago con Tarjeta/OXXO') {
    return {
      subject: subjectExito,
      html: envolver({
        eyebrow: 'Registro confirmado',
        saludo: saludoExito,
        inner: `${cajaId(idAsistente)}${tablaDatos([...filasBase, filaDato('Monto de apartado (33%)', apartado, true)])}${bloqueRetomarPago(idAsistente)}${bloqueFactura()}`,
      }),
    };
  }

  // 5) CONTADO por Depósito Bancario: boton a los datos bancarios (tr4nsfer.me)
  if (metodoPago === 'Contado - Depósito Bancario') {
    return {
      subject: subjectExito,
      html: envolver({
        eyebrow: 'Completa tu pago por depósito',
        saludo: saludoExito,
        inner: `
          ${cajaId(idAsistente)}
          ${tablaDatos([...filasBase, filaDato('Monto de contado (100%)', contado, true)])}
          <p style="font-size:14px;color:${C.tinta};line-height:1.7;margin:20px 0 0">Para asegurar tu lugar, completa tu pago con una transferencia o depósito bancario:</p>
          ${botonVerde(LINK_DATOS_BANCARIOS, 'Consultar datos bancarios')}
          <div style="text-align:center;font-size:12px;color:${C.muted};margin-top:2px">Usa tu <strong>ID de Asistente</strong> como concepto o referencia del depósito</div>
          ${cajaAmarilla(`Envía tu comprobante de pago a <strong>operaciones@los-pinos.org</strong> para completar tu registro. <strong>Tu lugar no queda reservado</strong> hasta que el depósito se vea reflejado correctamente en la cuenta de Los Pinos.`)}
          ${bloqueFactura()}`,
      }),
    };
  }

  // Fallback: método inválido
  return {
    subject: subjectExito,
    html: envolver({
      eyebrow: 'Registro',
      saludo: 'Error: método de pago inválido. Contáctanos para completar tu registro.',
      inner: '',
    }),
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
