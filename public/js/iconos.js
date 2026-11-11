// js/iconos.js — Iconos de línea propios (SVG), monocromos: toman el color del texto.
// Sustituyen a los emojis de colores en toda la app.
// Uso: icono('check')  →  '<svg class="ico" …><use href="#i-check"/></svg>'
// Los dibujos están en el <svg> oculto al principio de index.html (id="i-…").
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

window.icono = function icono(nombre, clase = '') {
  return `<svg class="ico${clase ? ' ' + clase : ''}" aria-hidden="true" focusable="false"><use href="#i-${nombre}"/></svg>`;
};
