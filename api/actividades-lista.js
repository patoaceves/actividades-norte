// api/actividades-lista.js — GET /api/actividades-lista
// Retorna todas las actividades con Estatus = "Activo"
// de ambas secciones (VARONIL y FEMENIL).
// Filtro hecho en JS, sin filterByFormula.

const BASE  = 'appxtlc0kwOVOI0lm';
const TABLE = 'tbl2TeJgRtxbhWJMa';

const FIELDS = {
  idActividad:   'fldzIa1RbjhIBivKF',
  nombreCompleto: 'fldvqjXPKFoQXgAMe',  // "AV024 - Curso de Retiro Agregados"
  casa:          'fldBg4qtC8fWw9I4n',
  fechaCompleta: 'fldSwY4v4Rhlf2iK3',
  fechaInicio:   'fldu09zPOwDLytAcm',
  fechaFin:      'fld0dIPfVqJPpvQ4H',
  seccion:       'fldXXEE93HzWeMoH1',
  estatus:       'fldiVU5kOK5onLxa9',
  lugaresV:      'fldSZapFVdBE7vooa',
  lugaresF:      'fld8OQ8NitjT2sHEA',
  cuota:         'fldVePGXnIEkMWciI',
};

// Helper: primer valor si es array (campos lookup/link)
function firstVal(v) {
  return Array.isArray(v) ? v[0] : v;
}

// Helper: devuelve array de strings para casa (maneja: array, string con comas, string simple)
function toCasasArray(v) {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) {
    return v.map(x => String(x || '').trim()).filter(Boolean);
  }
  const s = String(v).trim();
  if (!s) return [];
  // Separar por coma o punto y coma
  if (/[,;]/.test(s)) {
    return s.split(/[,;]\s*/).map(x => x.trim()).filter(Boolean);
  }
  return [s];
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pat = process.env.AIRTABLE_PAT_ACTIVIDADES;
  if (!pat) {
    return res.status(500).json({ error: 'AIRTABLE_PAT_ACTIVIDADES no configurado' });
  }

  try {
    const fieldList = Object.values(FIELDS).map(f => `fields[]=${f}`).join('&');

    // Recorre todas las páginas
    const all = [];
    let offset = '';
    let pages = 0;
    const MAX_PAGES = 20; // seguridad

    do {
      const url = `https://api.airtable.com/v0/${BASE}/${TABLE}`
        + `?returnFieldsByFieldId=true&${fieldList}&pageSize=100`
        + (offset ? `&offset=${offset}` : '');

      const r    = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(data));

      (data.records || []).forEach(rec => all.push(rec));
      offset = data.offset || '';
      pages++;
    } while (offset && pages < MAX_PAGES);

    // Filtra activos y mapea
    const activas = all
      .filter(rec => {
        const estatus = String(firstVal(rec.fields[FIELDS.estatus]) || '').toLowerCase().trim();
        const seccion = String(firstVal(rec.fields[FIELDS.seccion]) || '').toUpperCase().trim();
        return estatus === 'activo' && (seccion === 'VARONIL' || seccion === 'FEMENIL');
      })
      .map(rec => {
        const f = rec.fields;
        const seccion = String(firstVal(f[FIELDS.seccion]) || '').toUpperCase().trim();
        const lugares = seccion === 'FEMENIL'
          ? firstVal(f[FIELDS.lugaresF])
          : firstVal(f[FIELDS.lugaresV]);
        const casas = toCasasArray(f[FIELDS.casa]);
        const nombreRaw = String(firstVal(f[FIELDS.nombreCompleto]) || '').trim();
        // Intenta idActividad, si falla extrae del prefijo del nombre: "AF027 - Título"
        let id = String(firstVal(f[FIELDS.idActividad]) || '').trim().toUpperCase();
        if (!id && nombreRaw) {
          const m = nombreRaw.match(/^([A-Z]{2}\d+(?:-\d+)?)/);
          if (m) id = m[1];
        }
        return {
          id,
          nombre:         nombreRaw,
          casa:           casas,                // ahora siempre array
          casaPrincipal:  casas[0] || '',       // para retrocompatibilidad
          fechaCompleta:  String(firstVal(f[FIELDS.fechaCompleta]) || '').trim(),
          fechaInicio:    String(firstVal(f[FIELDS.fechaInicio]) || '').trim(),
          fechaFin:       String(firstVal(f[FIELDS.fechaFin]) || '').trim(),
          seccion,
          lugares:        lugares != null ? Number(lugares) : null,
          cuota:          String(firstVal(f[FIELDS.cuota]) || '').trim(),
        };
      })
      .filter(a => a.id) // descarta sin ID
      .sort((a, b) => {
        // ordena por fechaInicio ascendente; si no hay, deja como vienen
        if (!a.fechaInicio) return 1;
        if (!b.fechaInicio) return -1;
        return a.fechaInicio.localeCompare(b.fechaInicio);
      });

    return res.status(200).json({
      count: activas.length,
      actividades: activas,
    });

  } catch (err) {
    console.error('actividades-lista error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
