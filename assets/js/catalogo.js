// catalogo.js — shared by /varonil y /femenil
// La sección viene del atributo data-seccion en el <script>

(() => {
  const currentScript = document.currentScript || document.querySelector('script[src*="catalogo.js"]');
  const SECCION = (currentScript?.dataset?.seccion || 'VARONIL').toUpperCase();

  // Mapa casa → slug para fotos hero
  const CASA_HERO = {
    'casa grande':        '/assets/png/casa-grande/casa-grande-hero.png',
    'casa del bosque i':  '/assets/png/casa-del-bosque-i/casa-del-bosque-i-hero.jpg',
    'casa del bosque ii': '/assets/png/casa-del-bosque-ii/casa-del-bosque-ii-hero.jpg',
    'el molino':          '/assets/png/el-molino/el-molino-hero.png',
    'el dique':           '/assets/png/el-dique/el-dique-hero.jpeg',
    'el estero':          '/assets/png/el-estero/el-estero-hero.png',
  };
  const FALLBACK = '/assets/png/registro-background.jpg';

  const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  // Estado
  let ACTIVIDADES = [];
  let FILTRADAS   = [];

  // DOM refs
  const $search = document.getElementById('f-search');
  const $casa   = document.getElementById('f-casa');
  const $mes    = document.getElementById('f-mes');
  const $reset  = document.getElementById('f-reset');
  const $cards  = document.getElementById('cards');
  const $empty  = document.getElementById('cards-empty');
  const $loading= document.getElementById('cards-loading');
  const $sugg   = document.getElementById('f-suggestions');

  // ────────────── fetch ──────────────
  fetch('/api/actividades-lista')
    .then(r => r.json())
    .then(data => {
      const arr = (data && Array.isArray(data.actividades)) ? data.actividades : [];
      ACTIVIDADES = arr.filter(a => a.seccion === SECCION);
      populateFilters();
      applyUrlFilters();
      applyFilters();
      $loading.style.display = 'none';
    })
    .catch(err => {
      console.error('Error cargando actividades', err);
      $loading.innerHTML = '<span style="color: var(--error);">Error al cargar actividades. Intenta recargar la página.</span>';
    });

  // Lee ?casa=X&mes=N de la URL y preselecciona los filtros
  function applyUrlFilters() {
    const url = new URLSearchParams(window.location.search);
    const casaParam = url.get('casa');
    const mesParam  = url.get('mes');
    if (casaParam) {
      // Match case-insensitive contra las opciones del select
      const want = normalize(casaParam);
      const match = Array.from($casa.options).find(o => normalize(o.value) === want);
      if (match) $casa.value = match.value;
    }
    if (mesParam !== null && mesParam !== '') {
      $mes.value = String(mesParam);
    }
  }

  // ────────────── helpers ──────────────
  function normalize(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function getHero(casa) {
    const key = normalize(casa || '');
    for (const k in CASA_HERO) {
      if (key.includes(normalize(k))) return CASA_HERO[k];
    }
    return FALLBACK;
  }
  function getMes(fechaInicio) {
    if (!fechaInicio) return null;
    const m = fechaInicio.match(/\d{4}-(\d{2})/);
    if (m) {
      const idx = parseInt(m[1], 10) - 1;
      return { idx, nombre: MESES_ES[idx] };
    }
    return null;
  }

  // Helper: siempre devuelve casas como array de strings
  function getCasas(a) {
    if (Array.isArray(a.casa)) return a.casa.filter(Boolean);
    if (typeof a.casa === 'string' && a.casa.trim()) {
      return a.casa.split(/[,;]\s*/).map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  // ────────────── populate filters ──────────────
  function populateFilters() {
    // Todas las casas únicas (aplanando arrays)
    const casasSet = new Set();
    ACTIVIDADES.forEach(a => {
      getCasas(a).forEach(c => casasSet.add(c));
    });
    const casas = [...casasSet].sort();
    casas.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      $casa.appendChild(opt);
    });

    const mesesSet = new Map();
    ACTIVIDADES.forEach(a => {
      const m = getMes(a.fechaInicio);
      if (m && !mesesSet.has(m.idx)) mesesSet.set(m.idx, m.nombre);
    });
    [...mesesSet.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([idx, nombre]) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = nombre.charAt(0).toUpperCase() + nombre.slice(1);
        $mes.appendChild(opt);
      });
  }

  // ────────────── filter logic ──────────────
  function applyFilters() {
    const q      = normalize($search.value.trim());
    const casa   = $casa.value;
    const mesIdx = $mes.value;

    FILTRADAS = ACTIVIDADES.filter(a => {
      const casasArr = getCasas(a);
      if (q) {
        const hay = normalize(a.id) + ' ' + normalize(a.nombre) + ' ' + normalize(casasArr.join(' '));
        if (!hay.includes(q)) return false;
      }
      // Match si la actividad tiene esa casa en su array
      if (casa && !casasArr.includes(casa)) return false;
      if (mesIdx !== '') {
        const m = getMes(a.fechaInicio);
        if (!m || String(m.idx) !== mesIdx) return false;
      }
      return true;
    });

    render();
  }

  // ────────────── render ──────────────
  function render() {
    if (!FILTRADAS.length) {
      $cards.innerHTML = '';
      $empty.hidden = false;
      return;
    }
    $empty.hidden = true;

    $cards.innerHTML = FILTRADAS.map(a => {
      // Casas: puede venir como string "Casa 1, Casa 2" o array
      let casas = [];
      if (Array.isArray(a.casa)) {
        casas = a.casa.filter(Boolean);
      } else if (typeof a.casa === 'string' && a.casa.trim()) {
        // Separa por coma o punto y coma si viene múltiple
        casas = a.casa.split(/[,;]\s*/).map(s => s.trim()).filter(Boolean);
      }

      // El hero usa la primera casa
      const primeraCasa = casas[0] || '';
      const hero    = getHero(primeraCasa);
      const lugares = a.lugares;
      const seccion = a.seccion;
      const href    = '/v?id=' + encodeURIComponent(a.id);

      let lugState = 'ok', lugText = 'Lugares disponibles';
      let notAvailable = false;
      if (lugares === null || lugares === undefined) {
        lugState = 'full'; lugText = 'No disponible'; notAvailable = true;
      } else if (lugares <= 0) {
        lugState = 'full'; lugText = 'No disponible'; notAvailable = true;
      } else if (lugares <= 3) {
        lugState = 'low'; lugText = lugares === 1 ? '1 último lugar' : `${lugares} últimos lugares`;
      } else {
        lugState = 'ok'; lugText = lugares === 1 ? '1 lugar' : `${lugares} lugares`;
      }

      const ctaLabel = 'Ir a Actividad';

      // Nombre sin el prefijo "AVxxx - " si viene incluido
      let nombreLimpio = a.nombre || '';
      const prefixMatch = nombreLimpio.match(/^[A-Z]{2}\d+(?:-\d+)?\s*[-·:]\s*(.+)$/);
      if (prefixMatch) nombreLimpio = prefixMatch[1];

      // Badges de casas (1 o múltiples)
      const casasBadgesHtml = casas.length
        ? `<div class="card-casas-badges">${
            casas.map(c => `<div class="card-casa-badge">${escapeHtml(c)}</div>`).join('')
          }</div>`
        : '';

      // La card SIEMPRE es clickeable — aunque no haya cupo se puede ver el detalle
      return `
        <a class="card" href="${escapeHtml(href)}">
          <div class="card-img-wrap">
            <img class="card-img" src="${escapeHtml(hero)}" alt="${escapeHtml(primeraCasa)}" loading="lazy">
            ${casasBadgesHtml}
            <div class="card-seccion-badge">${escapeHtml(seccion)}</div>
          </div>
          <div class="card-body">
            ${a.fechaCompleta ? `<div class="card-fecha">${escapeHtml(a.fechaCompleta)}</div>` : ''}
            <div class="card-rule"></div>
            <div class="card-id">${escapeHtml(a.id)}</div>
            <h2 class="card-nombre">${escapeHtml(nombreLimpio || a.id)}</h2>
            <div class="card-footer">
              <div class="card-lugares ${lugState}">
                <span class="card-lugares-dot"></span>
                <span>${escapeHtml(lugText)}</span>
              </div>
              <span class="card-cta">
                ${escapeHtml(ctaLabel)}
                <svg class="card-cta-arrow" width="14" height="10" viewBox="0 0 18 12" fill="none" aria-hidden="true"><path d="M1 6h15m0 0l-5-5m5 5l-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              </span>
            </div>
          </div>
        </a>
      `;
    }).join('');
  }

  // ────────────── suggestions dropdown ──────────────
  function renderSuggestions(query) {
    if (!$sugg) return;
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      $sugg.hidden = true;
      $sugg.innerHTML = '';
      return;
    }

    const matches = ACTIVIDADES.filter(a => {
      const id = (a.id || '').toLowerCase();
      const nombre = (a.nombre || '').toLowerCase();
      const casaStr = Array.isArray(a.casa) ? a.casa.join(' ') : (a.casa || '');
      const casa = String(casaStr).toLowerCase();
      return id.includes(q) || nombre.includes(q) || casa.includes(q);
    }).slice(0, 8);

    if (!matches.length) {
      $sugg.innerHTML = '<div class="suggestion-empty">Sin coincidencias</div>';
      $sugg.hidden = false;
      return;
    }

    $sugg.innerHTML = matches.map(a => {
      const titulo = cleanNombre(a.nombre, a.id);
      const casaDisplay = Array.isArray(a.casa) ? a.casa.join(', ') : (a.casa || '—');
      return `
        <a class="suggestion" href="/v?id=${encodeURIComponent(a.id)}">
          <span class="suggestion-id">${escapeHtml(a.id)}</span>
          <div class="suggestion-body">
            <div class="suggestion-title">${escapeHtml(titulo)}</div>
            <div class="suggestion-meta">${escapeHtml(casaDisplay)}</div>
          </div>
        </a>
      `;
    }).join('');
    $sugg.hidden = false;
  }

  function cleanNombre(nombre, id) {
    if (!nombre) return id || '';
    const m = nombre.match(/^[A-Z]{2}\d+(?:-\d+)?\s*[-·:]\s*(.+)$/);
    return m ? m[1] : nombre;
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!$sugg) return;
    if (e.target === $search) return;
    if ($sugg.contains(e.target)) return;
    $sugg.hidden = true;
  });

  // Re-open on focus if there's text
  $search.addEventListener('focus', () => {
    if ($search.value.trim()) renderSuggestions($search.value);
  });

  // ────────────── events ──────────────
  let searchDebounce;
  $search.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      applyFilters();
      renderSuggestions($search.value);
    }, 140);
  });
  $casa.addEventListener('change', applyFilters);
  $mes.addEventListener('change', applyFilters);
  $reset.addEventListener('click', () => {
    $search.value = '';
    $casa.value = '';
    $mes.value = '';
    if ($sugg) { $sugg.hidden = true; $sugg.innerHTML = ''; }
    applyFilters();
  });
})();
