// api/_diag-schema.js — DIAGNÓSTICO TEMPORAL (borrar después de usar)
// GET /api/_diag-schema?genero=femenil
// Devuelve los campos link (multipleRecordLinks) de la tabla de asistentes
// para confirmar el field ID exacto del campo "Actividades V/F".
// Requiere el token secreto para no exponer el esquema públicamente.

const DESTINO = {
  varonil: { base: 'app38fvKJRzcjw6eG', table: 'tblJsudzO54IZxZBi', pat: () => process.env.AIRTABLE_PAT_VARONIL },
  femenil: { base: 'appsCGzy0VlF0JpTq', table: 'tbl8WVhn59QbGKig2', pat: () => process.env.AIRTABLE_PAT_FEMENIL },
};

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Protección: token simple para no exponer el esquema públicamente.
  if (req.query.k !== 'an-diag-2026-xY7q') {
    return res.status(403).json({ error: 'forbidden' });
  }

  const genero = String(req.query.genero || 'femenil').toLowerCase();
  const cfg = DESTINO[genero];
  if (!cfg) return res.status(400).json({ error: 'genero inválido' });

  const pat = cfg.pat();
  if (!pat) return res.status(500).json({ error: `AIRTABLE_PAT_${genero.toUpperCase()} no configurado` });

  try {
    const r = await fetch(`https://api.airtable.com/v0/meta/bases/${cfg.base}/tables`, {
      headers: { Authorization: `Bearer ${pat}` },
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: 'metadata', detail: data });

    const table = data.tables?.find(t => t.id === cfg.table);
    if (!table) return res.status(404).json({ error: 'tabla no encontrada', tabla: cfg.table });

    const campos = (table.fields || []).map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
      linkedTableId: f.type === 'multipleRecordLinks' ? f.options?.linkedTableId : undefined,
    }));
    const links = campos.filter(c => c.type === 'multipleRecordLinks');

    return res.status(200).json({
      tabla: table.name,
      tableId: cfg.table,
      campos_link: links,
      todos_los_campos: campos,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
