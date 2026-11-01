// js/vista-previa.js — Vista previa del libro al escribir o escanear un ISBN
// Muestra portada, título, autor y editorial antes de darlo de alta,
// y avisa si ya tienes ese libro (y dónde está).
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

window.VistaPreviaISBN = (function () {
  const cache = new Map();   // isbn -> respuesta del servidor
  let temporizador = null;
  let peticionActual = 0;

  const $ = (id) => document.getElementById(id);

  function isbnLimpio(v) {
    return String(v || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  }

  // Dígito de control (ISBN-10 y EAN-13) para no consultar números mal tecleados
  function isbnValido(c) {
    if (/^\d{13}$/.test(c)) {
      let s = 0;
      for (let i = 0; i < 12; i++) s += Number(c[i]) * (i % 2 ? 3 : 1);
      return (10 - (s % 10)) % 10 === Number(c[12]);
    }
    if (/^\d{9}[\dX]$/.test(c)) {
      let s = 0;
      for (let i = 0; i < 10; i++) s += (c[i] === 'X' ? 10 : Number(c[i])) * (10 - i);
      return s % 11 === 0;
    }
    return false;
  }

  function contenedor() {
    let el = $('isbn-preview');
    if (!el) {
      const grupo = $('isbn')?.closest('.form-group');
      if (!grupo) return null;
      el = document.createElement('div');
      el.id = 'isbn-preview';
      el.className = 'isbn-preview';
      el.setAttribute('aria-live', 'polite');
      el.hidden = true;
      grupo.insertAdjacentElement('afterend', el);
    }
    return el;
  }

  function limpiar() {
    clearTimeout(temporizador);
    peticionActual++;
    const el = contenedor();
    if (el) { el.hidden = true; el.innerHTML = ''; el.className = 'isbn-preview'; }
  }

  function pintarCargando(isbn) {
    const el = contenedor();
    if (!el) return;
    el.hidden = false;
    el.className = 'isbn-preview is-cargando';
    el.innerHTML = `<div class="isbn-preview-cover isbn-preview-cover--vacia"></div>
      <div class="isbn-preview-info"><div class="isbn-preview-titulo">Buscando ${escapeHtml(isbn)}…</div></div>`;
  }

  function pintarError(texto) {
    const el = contenedor();
    if (!el) return;
    el.hidden = false;
    el.className = 'isbn-preview is-aviso';
    el.innerHTML = `<div class="isbn-preview-info"><div class="isbn-preview-meta">${escapeHtml(texto)}</div></div>`;
  }

  function pintar(d) {
    const el = contenedor();
    if (!el) return;
    el.hidden = false;

    if (!d.encontrado) {
      el.className = 'isbn-preview is-aviso';
      el.innerHTML = `<div class="isbn-preview-cover isbn-preview-cover--vacia"><span class="ph-logo">?</span></div>
        <div class="isbn-preview-info">
          <div class="isbn-preview-titulo">ISBN ${escapeHtml(d.isbn)} no encontrado</div>
          <div class="isbn-preview-meta">No aparece en Google Books ni en Open Library. Si lo añades se creará como
          «Libro desconocido» y podrás editar los datos en su ficha. Comprueba que el número es correcto.</div>
        </div>`;
      return;
    }

    const l = d.libro;
    const anio = l.fecha_publicacion ? String(l.fecha_publicacion).slice(0, 4) : '';
    const meta = [l.editorial, anio, l.numero_paginas ? `${l.numero_paginas} págs.` : ''].filter(Boolean).join(' · ');
    const portada = l.url_portada
      ? `<img class="isbn-preview-cover" src="${escapeHtml(srcPortada(l.url_portada))}" alt="" loading="lazy"
           onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'isbn-preview-cover isbn-preview-cover--vacia'}))">`
      : `<div class="isbn-preview-cover isbn-preview-cover--vacia"><span class="ph-logo">Pdl</span></div>`;

    let aviso = '';
    if (d.mios?.length) {
      const donde = d.mios.map((m) => m.ubicacion ? escapeHtml(m.ubicacion) : 'sin ubicación').join(', ');
      aviso = `<div class="isbn-preview-duplicado">⚠️ Ya lo tienes${d.mios.length > 1 ? ` (${d.mios.length} ejemplares)` : ''}: ${donde}
        <button type="button" class="isbn-preview-ver" data-libro-id="${l.id}" data-ejemplar-id="${d.mios[0].ejemplar_id}">Ver ficha</button></div>`;
    }

    el.className = 'isbn-preview' + (d.mios?.length ? ' is-duplicado' : ' is-ok');
    el.innerHTML = `${portada}
      <div class="isbn-preview-info">
        <div class="isbn-preview-titulo">${escapeHtml(l.titulo || 'Sin título')}</div>
        ${l.autores ? `<div class="isbn-preview-autor">${escapeHtml(l.autores)}</div>` : ''}
        ${meta ? `<div class="isbn-preview-meta">${escapeHtml(meta)}</div>` : ''}
        ${aviso}
      </div>`;
  }

  async function consultar(isbn) {
    if (cache.has(isbn)) return pintar(cache.get(isbn));
    const id = ++peticionActual;
    pintarCargando(isbn);
    try {
      const res = await fetch(`${API_BASE}/api/ejemplares/consulta/${encodeURIComponent(isbn)}`, {
        headers: getHeaders(false),
      });
      if (id !== peticionActual) return; // el usuario ya escribió otra cosa
      if (res.status === 401) return limpiar();
      const data = await res.json();
      if (!res.ok) return pintarError(data.error || 'No se pudo consultar el ISBN.');
      cache.set(isbn, data);
      pintar(data);
    } catch {
      if (id === peticionActual) pintarError('Sin conexión: no se puede mostrar la vista previa.');
    }
  }

  function alCambiar() {
    clearTimeout(temporizador);
    const isbn = isbnLimpio($('isbn')?.value);
    if (!token || !(isbn.length === 10 || isbn.length === 13)) return limpiar();
    if (!isbnValido(isbn)) {
      peticionActual++;
      return pintarError('El ISBN no es válido (el dígito de control no cuadra). Revisa el número.');
    }
    // Escaneado o pegado: consulta inmediata; tecleando: espera un poco
    temporizador = setTimeout(() => consultar(isbn), 350);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const input = $('isbn');
    if (!input) return;
    input.addEventListener('input', alCambiar);
    input.addEventListener('change', alCambiar);
    contenedor()?.addEventListener('click', (e) => {
      const b = e.target.closest('.isbn-preview-ver');
      if (!b) return;
      if (typeof mostrarFicha === 'function') mostrarFicha(Number(b.dataset.libroId), Number(b.dataset.ejemplarId));
    });
  });

  // Tras crear o borrar un ejemplar, la información de "ya lo tienes" cambia
  function invalidar() { cache.clear(); }

  return { limpiar, invalidar, consultar };
})();
