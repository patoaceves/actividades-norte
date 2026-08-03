/* ───────────────────────────────────────────
   MOBILE NAV — hamburger menu for all pages
─────────────────────────────────────────── */
(function() {
  function initMobileNav() {
    const nav = document.getElementById('nav');
    if (!nav) return;
    const btn = nav.querySelector('.nav-menu-btn');
    if (!btn) return;

    // Crea el panel mobile si no existe
    let panel = document.querySelector('.nav-mobile-panel');
    let backdrop = document.querySelector('.nav-mobile-backdrop');

    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'nav-mobile-panel';
      panel.setAttribute('aria-hidden', 'true');

      // Copia los links del nav-links al panel
      const links = nav.querySelectorAll('.nav-links a');
      links.forEach(link => {
        const clone = link.cloneNode(true);
        panel.appendChild(clone);
      });

      // Agrega link de inicio al final
      const inicio = document.createElement('a');
      inicio.href = '/';
      inicio.textContent = 'Inicio';
      panel.appendChild(inicio);

      document.body.appendChild(panel);
    }

    // Boton de cerrar DENTRO del panel: el hamburguesa vive dentro del nav
    // (z-index 100) y no puede pintarse encima del panel (z-index 120).
    // Va fuera del if de arriba para que exista aunque el panel ya estuviera.
    if (!panel.querySelector('.nav-mobile-close')) {
      const cerrar = document.createElement('button');
      cerrar.type = 'button';
      cerrar.className = 'nav-mobile-close';
      cerrar.setAttribute('aria-label', 'Cerrar menú');
      cerrar.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      cerrar.addEventListener('click', function(){ close(); });
      panel.insertBefore(cerrar, panel.firstChild);
    }

    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'nav-mobile-backdrop';
      document.body.appendChild(backdrop);
    }

    function toggle() {
      const isOpen = btn.classList.toggle('open');
      panel.classList.toggle('open', isOpen);
      backdrop.classList.toggle('open', isOpen);
      panel.setAttribute('aria-hidden', String(!isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
      document.body.classList.toggle('nav-open', isOpen);
    }

    function close() {
      btn.classList.remove('open');
      panel.classList.remove('open');
      backdrop.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      document.body.classList.remove('nav-open');
    }

    btn.addEventListener('click', toggle);
    backdrop.addEventListener('click', close);
    // Cierra al dar click en un link
    panel.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
    // Cierra al redimensionar a desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 880) close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }
})();
