// api/apartado.js — POST { idAsistente, email }
// Reemplaza el motor de la automation "Forma Completado" de Airtable.
// Antes: formulario de Airtable -> script -> Checkout Session -> is.gd ->
// correo con link que expira en 24h. Ahora: se valida aqui y la persona paga
// en el sitio, en el momento, con el mismo checkout del registro.
//
// Valida que el ID exista con Estatus "Apartado" y que el correo coincida,
// y devuelve los datos + el monto que falta por pagar (66% + comision).
// El monto es informativo: /api/payment-intent lo recalcula server-side.

const { montoCompletadoMXN, parseCuota } = require('./_lib/precios');
const { construirEmailCompletado, enviarEmail } = require('./_lib/email');

const BASE = 'appxtlc0kwOVOI0lm';

const TABLAS = {
  varonil: {
    tableId: 'tbl4GG7YODrvw8pIv',
    f: {
      id:      'fldmuxpnOa02zfK7W',
      email:   'fldyqVSnLu8KXPyUu',
      estatus: 'fldbJFVZR7xxjTLtj',
      nombre:  'flddMlguiTjVE9hU8',
      actividad: 'fldidFGuSBEz01GG1',
      fecha:   'fldhvG4LG0WZm7cfO',
      casa:    'flds8YnuqzHuGkLvj',
      cuota:   'fldqGbXEagpSIvE7H',
    },
  },
  femenil: {
    tableId: 'tblLKeKqNpF1AWg5b',
    f: {
      id:      'fld3y52PNWeyD3BuC',
      email:   'fldfutvPKgmg1Dpha',
      estatus: 'fldSNdyrQTL3nHCQZ',
      nombre:  'fldUQTTWhFxrIX8hO',
      actividad: 'fldzLvCjW5FhQP5TD',
      fecha:   'fldYzeHdFMavqV3Cu',
      casa:    'fldzGrpSiBetxIriP',
      cuota:   'fldt2TcxfsdR4anxA',
    },
  },
};

function first(v) { return Array.isArray(v) ? v[0] : v; }
function txt(v) { return String(first(v) ?? '').trim(); }
function normEmail(e) { return String(e || '').trim().toLowerCase(); }

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { idAsistente, email } = req.body || {};
    const id = String(idAsistente || '').trim().toUpperCase();
    const mail = normEmail(email);

    if (!/^A[VF][A-Z0-9-]{2,40}$/.test(id)) {
      return res.status(400).json({ error: 'El ID de Asistente no tiene un formato válido. Revisa el correo que recibiste al hacer tu apartado.' });
    }
    if (!mail || !mail.includes('@')) {
      return res.status(400).json({ error: 'Ingresa el correo con el que te registraste.' });
    }

    const genero = id.startsWith('AF') ? 'femenil' : 'varonil';
    const cfg = TABLAS[genero];
    const pat = process.env.AIRTABLE_PAT_ACTIVIDADES;
    if (!pat) return res.status(500).json({ error: 'AIRTABLE_PAT_ACTIVIDADES no configurado' });

    // Buscar el asistente (paginado; filtramos en JS para no depender de
    // nombres de campo en filterByFormula)
    let rec = null, offset = '';
    for (let page = 0; page < 25 && !rec; page++) {
      const url = `https://api.airtable.com/v0/${BASE}/${cfg.tableId}`
        + `?pageSize=100&returnFieldsByFieldId=true`
        + (offset ? `&offset=${encodeURIComponent(offset)}` : '');
      const r = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
      const d = await r.json();
      if (!r.ok) return res.status(400).json({ error: d.error?.message || 'No se pudo consultar tu registro' });
      rec = (d.records || []).find(x => txt(x.fields[cfg.f.id]).toUpperCase() === id) || null;
      offset = d.offset || '';
      if (!offset) break;
    }

    if (!rec) {
      return res.status(404).json({
        error: 'No encontramos un registro con ese ID de Asistente. Verifica el ID que recibiste en tu correo de confirmación.',
      });
    }

    const f = rec.fields;
    const estatus = txt(f[cfg.f.estatus]);

    // El correo debe coincidir con el del registro (evita que cualquiera
    // consulte los datos de otra persona con solo saber su ID)
    if (normEmail(txt(f[cfg.f.email])) !== mail) {
      return res.status(403).json({
        error: 'El correo no coincide con el del registro. Usa el mismo correo con el que hiciste tu apartado.',
      });
    }

    if (estatus !== 'Apartado') {
      const msg = estatus === 'Pagado'
        ? 'Este registro ya tiene su pago completo. No es necesario pagar de nuevo.'
        : `Este registro está en estatus "${estatus || 'Pendiente'}", no en "Apartado". Si crees que es un error, escríbenos a admin@actividadesnorte.com.`;
      return res.status(200).json({ noAplica: true, estatus, mensaje: msg, idAsistente: id });
    }

    const nombreActividad = txt(f[cfg.f.actividad]);
    const idActividad = (nombreActividad.match(/^A[VF]\d+/) || [])[0] || '';
    const cuota = txt(f[cfg.f.cuota]);
    const completado = montoCompletadoMXN(cuota);

    if (!idActividad || !parseCuota(cuota)) {
      return res.status(409).json({
        error: 'No pudimos calcular tu monto pendiente. Escríbenos a admin@actividadesnorte.com y lo resolvemos.',
      });
    }

    // Correo de respaldo con el link al checkout (equivale al que mandaba la
    // automation vieja, pero sin vigencia de 24h). Best-effort: si falla, la
    // persona igual puede pagar en la pantalla que ya tiene enfrente.
    try {
      const { subject, html } = construirEmailCompletado({
        idAsistente:   id,
        nombre:        txt(f[cfg.f.nombre]),
        actividad:     nombreActividad,
        fechaCompleta: txt(f[cfg.f.fecha]),
        casa:          txt(f[cfg.f.casa]),
        completadoMxn: completado,
      });
      const envio = await enviarEmail({ to: txt(f[cfg.f.email]), subject, html });
      if (!envio.ok) console.warn('No se pudo enviar el correo de completado:', envio.error);
    } catch (e) {
      console.warn('Error enviando el correo de completado:', e.message);
    }

    return res.status(200).json({
      idAsistente: id,
      genero,
      recordId: rec.id,
      idActividad,
      nombre: txt(f[cfg.f.nombre]),
      email: txt(f[cfg.f.email]),
      actividad: {
        nombre:        nombreActividad,
        casa:          txt(f[cfg.f.casa]),
        fechaCompleta: txt(f[cfg.f.fecha]),
      },
      completadoMxn: completado,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
