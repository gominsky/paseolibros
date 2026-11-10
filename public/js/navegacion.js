// js/navegacion.js — Pestañas inferiores en móvil y buscador en la cabecera en escritorio
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

(function () {
  const PESTANA_KEY = 'paseolibros_pestana';
  const PESTANAS = ['biblioteca', 'leyendo', 'prestamos', 'estadisticas'];
  const mqMovil = window.matchMedia('(max-width: 820px)');

  // ---------- Pestañas (solo afectan al diseño móvil, ver css/nuevo-look.css) ----------
  function irA(pestana, { scroll = true } = {}) {
    if (!PESTANAS.includes(pestana)) pestana = 'biblioteca';
    document.body.dataset.pestana = pestana;
    document.querySelectorAll('.tabbar-btn').forEach((b) => {
      const activa = b.dataset.pestana === pestana;
      b.classList.toggle('is-active', activa);
      b.setAttribute('aria-current', activa ? 'page' : 'false');
    });
    try { sessionStorage.setItem(PESTANA_KEY, pestana); } catch {}
    if (scroll && mqMovil.matches) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    // Chart.js necesita redimensionarse al hacerse visible
    if (pestana === 'estadisticas') setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
  }
  window.irAPestana = irA;

  // Número de lecturas en curso / préstamos activos en las pestañas
  function contarFilas(tbodySel, clave) {
    const tbody = document.querySelector(tbodySel);
    const badge = document.querySelector(`.tabbar-num[data-num="${clave}"]`);
    if (!tbody || !badge) return;
    const actualizar = () => {
      const n = [...tbody.querySelectorAll('tr')].filter((tr) => tr.children.length > 1 || !tr.querySelector('td[colspan]')).length;
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.hidden = n === 0;
      // Sin filas: fuera la cabecera de tabla vacía (queda solo el mensaje)
      const wrap = tbody.closest('.table-wrapper');
      if (wrap) wrap.hidden = n === 0;
    };
    new MutationObserver(actualizar).observe(tbody, { childList: true });
    actualizar();
  }

  // ---------- Escritorio: el buscador sube a la cabecera ----------
  function colocarBuscador() {
    const buscador = document.querySelector('.card-ejemplares .table-search, .app-header .table-search');
    const cabecera = document.querySelector('.app-header');
    const origen = document.querySelector('.card-ejemplares .card-header');
    if (!buscador || !cabecera || !origen) return;
    if (!mqMovil.matches) {
      if (!cabecera.contains(buscador)) {
        buscador.classList.add('header-search');
        cabecera.insertBefore(buscador, cabecera.querySelector('.header-right'));
      }
    } else if (cabecera.contains(buscador)) {
      buscador.classList.remove('header-search');
      origen.insertBefore(buscador, origen.querySelector('.sort-mini'));
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    let inicial = 'biblioteca';
    try { inicial = sessionStorage.getItem(PESTANA_KEY) || 'biblioteca'; } catch {}
    irA(inicial, { scroll: false });

    document.getElementById('tabbar')?.addEventListener('click', (e) => {
      const b = e.target.closest('.tabbar-btn');
      if (b) irA(b.dataset.pestana);
    });

    contarFilas('#tabla-lecturas-abiertas tbody', 'leyendo');
    contarFilas('#tabla-prestamos-activos tbody', 'prestamos');

    colocarBuscador();
    mqMovil.addEventListener?.('change', colocarBuscador);
  });
})();
