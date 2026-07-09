// api/_lib/lugares.js
// Normaliza el valor crudo del campo "Lugares" de Airtable.
// El campo puede traer: número, número como texto, o el texto "NO"
// cuando la actividad se llenó (flujo operativo de la base).
//
// Reglas:
//   - número              → ese número
//   - "12", "12 lugares"  → 12 (primer número que aparezca)
//   - "NO" / "no"         → 0  (llena: bloquea registro y pago, badge "No disponible")
//   - null / undefined / ""  → null (desconocido: cada endpoint conserva su semántica)
//   - cualquier otro texto   → null

function parseLugares(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isNaN(raw) ? null : raw;

  const s = String(raw).trim();
  if (!s) return null;

  const m = s.match(/-?\d+/);
  if (m) return parseInt(m[0], 10);

  if (/^no$/i.test(s)) return 0;

  return null;
}

module.exports = { parseLugares };
