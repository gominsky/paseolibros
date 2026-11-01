// js/ayuda.js — Ayuda / manual
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// ══════════════════════════════════════════════════════════
// AYUDA / MANUAL
// ══════════════════════════════════════════════════════════
(function () {
 
  function abrir() {
    document.getElementById('ayuda-overlay').style.display = 'flex';
    document.documentElement.style.overflow = 'hidden';
  }
  function cerrar() {
    document.getElementById('ayuda-overlay').style.display = 'none';
    document.documentElement.style.overflow = '';
  }
 
  function initTabs() {
    document.querySelectorAll('.ayuda-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.ayuda-tab').forEach(t =>
          t.classList.toggle('is-active', t === tab));
        document.querySelectorAll('.ayuda-panel').forEach(p =>
          p.classList.toggle('is-active', p.id === 'ayuda-panel-' + tab.dataset.ayudaTab));
      });
    });
  }
 
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    document.getElementById('btn-ayuda')?.addEventListener('click', abrir);
    document.getElementById('ayuda-cerrar')?.addEventListener('click', cerrar);
    document.getElementById('ayuda-overlay')?.addEventListener('click', e => {
      if (e.target.id === 'ayuda-overlay') cerrar();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' &&
          document.getElementById('ayuda-overlay')?.style.display !== 'none') cerrar();
    });
  });
 
})();
