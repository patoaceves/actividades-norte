/* ───────────────────────────────────────────
   REVEAL — entry animations via IntersectionObserver
   Uses classes defined in site.css: .reveal + .reveal.in
─────────────────────────────────────────── */
(function() {
  function initReveal() {
    if (!('IntersectionObserver' in window)) {
      // Fallback: mostrar todo si no hay soporte
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  }

  // Corre inmediato si DOM ya está listo, si no espera
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReveal);
  } else {
    initReveal();
  }

  // Expone por si se agregan elementos dinámicamente
  window.initReveal = initReveal;
})();
