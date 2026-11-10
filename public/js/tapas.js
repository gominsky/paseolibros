// js/tapas.js — Portadas tipográficas generadas
// Cuando un libro no tiene portada (o la imagen no carga) se dibuja una "tapa"
// de tela con el título y el autor en Fraunces. El color sale del título, así que
// el mismo libro tiene siempre el mismo color.
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// Colores de tela de encuadernación (todos con buen contraste con texto claro)
const COLORES_TAPA = [
  '#2f5d50', // verde tinta
  '#7a2e3a', // burdeos
  '#1f3a5f', // azul marino
  '#9a5f22', // cuero
  '#5b3a6b', // ciruela
  '#2c6670', // petróleo
  '#8a3f2b', // teja
  '#3d4f3a', // musgo
  '#4a4f6b', // pizarra
  '#6b4c2e', // nogal
];

function colorTapa(texto) {
  let h = 0;
  const s = String(texto || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLORES_TAPA[h % COLORES_TAPA.length];
}

// Primer autor, sin la lista completa (para que quepa en la tapa)
function autorCorto(autores) {
  return String(autores || '').split(/[,;]| y /)[0].trim();
}

// HTML de una tapa generada. `variante`: mini | card | grid | ficha | preview
function tapaGenerada(titulo, autores, variante = 'grid') {
  const t = String(titulo || 'Sin título').replace(/^Libro desconocido \((\d+)\)$/, 'Sin datos · $1');
  const a = autorCorto(autores);
  return `<div class="tapa tapa--${variante}" style="--tapa:${colorTapa(t)}" role="img" aria-label="${escapeHtml(t)}">
    <span class="tapa-titulo">${escapeHtml(t)}</span>${a ? `<span class="tapa-autor">${escapeHtml(a)}</span>` : ''}
  </div>`;
}

// <img> de portada que, si no carga, se sustituye sola por la tapa generada
function imgPortada(url, titulo, autores, claseImg, variante, extra = '') {
  if (!url) return tapaGenerada(titulo, autores, variante);
  return `<img class="${claseImg}" src="${escapeHtml(srcPortada(url))}" alt="Portada de ${escapeHtml(titulo || '')}"
    loading="lazy" decoding="async" data-tapa="${variante}" data-titulo="${escapeHtml(titulo || '')}"
    data-autor="${escapeHtml(autores || '')}" ${extra} />`;
}

// Un solo vigilante para todas las imágenes rotas (el evento error no burbujea: fase de captura)
document.addEventListener('error', (ev) => {
  const img = ev.target;
  if (!(img instanceof HTMLImageElement) || img.dataset.tapa === undefined) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = tapaGenerada(img.dataset.titulo, img.dataset.autor, img.dataset.tapa);
  img.replaceWith(tmp.firstElementChild);
}, true);

// Ficha del libro: muestra la tapa generada mientras la imagen esté en modo "sin portada"
document.addEventListener('DOMContentLoaded', () => {
  const img = document.getElementById('ficha-portada-img');
  if (!img) return;
  const wrap = img.parentElement;
  const sync = () => {
    let tapa = wrap.querySelector('.tapa--ficha');
    const sinPortada = img.classList.contains('is-placeholder') || !img.getAttribute('src');
    if (!sinPortada) { tapa?.remove(); img.hidden = false; return; }
    const titulo = document.getElementById('ficha-titulo')?.textContent || '';
    const autor = document.getElementById('ficha-autores')?.textContent || '';
    const html = tapaGenerada(titulo, autor === 'Autor desconocido' ? '' : autor, 'ficha');
    if (!tapa || tapa.dataset.clave !== titulo + '|' + autor) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const nueva = tmp.firstElementChild;
      nueva.dataset.clave = titulo + '|' + autor;
      tapa ? tapa.replaceWith(nueva) : img.insertAdjacentElement('afterend', nueva);
    }
    img.hidden = true;
  };
  new MutationObserver(sync).observe(img, { attributes: true, attributeFilter: ['class', 'src'] });
  const t = document.getElementById('ficha-titulo');
  if (t) new MutationObserver(sync).observe(t, { childList: true, characterData: true, subtree: true });
  img.addEventListener('error', () => { img.classList.add('is-placeholder'); sync(); });
});
