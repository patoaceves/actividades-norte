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
    }

    function close() {
      btn.classList.remove('open');
      panel.classList.remove('open');
      backdrop.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
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
