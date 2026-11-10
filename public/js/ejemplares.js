// js/ejemplares.js — Listado de ejemplares: ordenación, pintado (tabla/lista/cuadrícula), carga y alta
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// ---------- Ordenación: cabeceras como botones ----------
function initOrdenacionEjemplares() {
  const table = document.getElementById('tabla-ejemplares');
  if (!table) return;
 
  const map = {
    0: null, // Portada
    1: 'titulo',
    2: 'autores',
    3: 'isbn',
    4: 'estado',
    5: 'ubicacion',
    6: 'notas',
    7: null, // Acciones
  };
 
  const ths = table.querySelectorAll('thead th');
  ths.forEach((th, i) => {
    const key = map[i];
    if (!key) return;
 
    const label = th.textContent.trim();
    th.textContent = '';
 
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'th-sort';
    btn.dataset.key = key;
    btn.innerHTML = `<span>${label}</span><span class="th-sort-icon"></span>`;
    btn.addEventListener('click', () => {
      if (sortEjemplares.key === key) {
        sortEjemplares.dir = sortEjemplares.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortEjemplares.key = key;
        sortEjemplares.dir = 'asc';
      }
      guardarSortEjemplares();            // ✅ AÑADIR
      actualizarIconosOrden(table);
      renderEjemplares();
    });
    th.appendChild(btn);
  });
  actualizarIconosOrden(table);
}
 
function actualizarIconosOrden(table) {
  table.querySelectorAll('.th-sort').forEach((btn) => {
    const icon = btn.querySelector('.th-sort-icon');
    const key = btn.dataset.key;
    if (!icon) return;
 
    if (key === sortEjemplares.key) {
      icon.textContent = sortEjemplares.dir === 'asc' ? '☑' : '☒';
    } else {
      icon.textContent = '';
    }
  });
  guardarSortEjemplares();
}
async function importarEjemplaresCSV(file) {
  if (!token || !usuarioActual) {
    setUserStatusErr('Debes iniciar sesión para importar CSV');
    return;
  }
 
  const texto = await file.text();
  const lineas = texto.split(/\r?\n/).filter(l => l.trim());
 
  if (lineas.length < 2) {
    setUserStatusErr('CSV vacío o inválido');
    return;
  }
 
  const cabeceras = lineas[0].split(',').map(h => h.trim());
  const idx = (c) => cabeceras.indexOf(c);
 
  if (idx('isbn') === -1) {
    setUserStatusErr('El CSV debe tener la columna "isbn"');
    return;
  }
 
  let creados = 0;
  let errores = 0;
  let duplicados = 0;
 
  for (let i = 1; i < lineas.length; i++) {
    const valores = lineas[i]
      .match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)
      ?.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"')) || [];
 
    const isbn = valores[idx('isbn')]?.trim();
    if (!isbn) {
      errores++;
      continue;
    }
 
    try {
      const res = await fetch(`${API_BASE}/api/ejemplares`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          isbn,
          estado: valores[idx('estado')] || 'propio',
          ubicacion: valores[idx('ubicacion')] || null,
          notas: valores[idx('notas')] || null,
        })
      });
 
      if (res.ok) creados++;
      else if (res.status === 409) duplicados++;
      else errores++;
    } catch {
      errores++;
    }
  }
 
  setUserStatusOk(`Importación terminada: ${creados} creados, ${duplicados} ya los tenías, ${errores} errores`);
  await cargarEjemplares(usuarioActual.id);
}
 
// ---------- Tabla ejemplares: render (con ordenación + buscador) ----------
function renderEjemplares() {
  const tbody = document.querySelector('#tabla-ejemplares tbody');
  if (!tbody) return;
 
  const q = (ejemplaresQuery || '').toLowerCase().trim();
 
  const ordenados = [...ejemplaresCache].sort((a, b) =>
    compare(a, b, sortEjemplares.key, sortEjemplares.dir)
  );
 
  const filtrados = !q ? ordenados : ordenados.filter((e) => {
    const blob = [
      e.titulo, e.autores, e.isbn, e.estado, e.ubicacion, e.notas,
      e.libro_id, e.ejemplar_id, e.creado_en
    ].filter(Boolean).join(' ').toLowerCase();
    return blob.includes(q);
  });
 
  tbody.innerHTML = '';
  const esMovil = window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
  // En móvil la tabla está oculta por CSS: no la rellenamos (ahorra DOM y descargas)
  const filasTabla = (esMovil || vistaEjemplares !== 'lista') ? [] : filtrados;
  const frag = document.createDocumentFragment();
 
  for (const e of filasTabla) {
    const tr = document.createElement('tr');
    tr.dataset.libroId = e.libro_id;
    tr.dataset.ejemplarId = e.ejemplar_id;
    tr.dataset.creadoEn = e.creado_en || '';
 
   tr.innerHTML = `
  <td>
    ${imgPortada(e.url_portada, e.titulo, e.autores, 'portada-mini-img', 'mini', 'width="40" height="60"')}
  </td>
  <td class="cell-title">
     <!-- título -->
  <div class="title-text">
    ${escapeHtml(e.titulo || 'Libro desconocido')}
  </div>
  <!-- fila de iconos -->
  <div class="title-icons" data-badge-libro="${e.libro_id}">
    <span class="badge badge-fav"></span>
    <span class="badge badge-notes"></span>
  </div>
</td>
 
 
    <td class="cell-author">${escapeHtml(e.autores || '')}</td>
  <td>${escapeHtml(e.editorial || '')}</td>
  <td>${escapeHtml(e.isbn || '')}</td>
  <td>${escapeHtml(e.ubicacion || '')}</td>
    `;
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
    // ✅ PRO MAX: también pinta la lista móvil (con los mismos filtrados/orden)
  renderEjemplaresMobileList(filtrados);
  renderEjemplaresGrid(filtrados);
  // Siempre aplicar la vista correcta al final — evita solapamientos
  aplicarVistaContenedor();
  if (vistaEjemplares === 'estanteria' && window.renderEstanteria) {
    window.renderEstanteria(filtrados);
  }
if (token && usuarioActual?.id) {
  const ids = filtrados.map(e => e.libro_id);
  // Las insignias ya vienen en el listado; esto solo pinta (y pide lo que falte)
  requestAnimationFrame(() => {
    ids.forEach(applyBadgesForLibro);
    ensureReaderMetaFor(ids);
  });
}
 
}
 
function renderEjemplaresMobileList(filtrados){
  const list = document.getElementById('ejemplares-list');
  if (!list) return;
 
  const isMobile = window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
  if (!isMobile || vistaEjemplares !== 'lista') { list.innerHTML = ''; return; }
 
  // Tarjeta limpia: portada, título, autor y solo los datos que existen.
  // (El ISBN y el borrado están en la ficha; toda la tarjeta abre la ficha.)
  list.innerHTML = (filtrados || []).map(e => {
    const pills = [e.ubicacion, e.estado && e.estado !== 'disponible' ? e.estado : '']
      .filter(Boolean)
      .map(v => `<span class="ej-pill">${escapeHtml(v)}</span>`)
      .join('');
 
    return `
      <div class="ej-card" data-libro-id="${e.libro_id}" data-ejemplar-id="${e.ejemplar_id}" role="button" tabindex="0">
        ${imgPortada(e.url_portada, e.titulo, e.autores, 'ej-cover', 'card')}
        <div class="ej-main">
          <div class="ej-title" data-badge-libro="${e.libro_id}">
            <span class="badge badge-fav" aria-hidden="true"></span>
            <span class="badge badge-notes" aria-hidden="true"></span>
            ${escapeHtml(e.titulo || 'Sin título')}
          </div>
          ${e.autores ? `<div class="ej-author">${escapeHtml(e.autores)}</div>` : ''}
          ${pills ? `<div class="ej-meta">${pills}</div>` : ''}
        </div>
        <span class="ej-chevron" aria-hidden="true">›</span>
      </div>
    `;
  }).join('');
}
 
// ---------- Cargar ejemplares (rellena caché y renderiza) ----------
async function cargarEjemplares(usuarioId) {
  const info = document.getElementById('info-ejemplares');
  if (!usuarioId) {
    if (info) info.textContent = 'Inicia sesión para ver tus ejemplares.';
    ejemplaresCache = [];
    renderEjemplares();
    return;
  }
 
  if (info) info.textContent = 'Cargando ejemplares...';
 
  try {
    const res = await fetch(`${API_BASE}/api/usuarios/${usuarioId}/ejemplares`, {
      headers: getHeaders(false),
    });
    
    if (res.status === 401) {
      handleUnauthorized();
      return;
    }
          
    const ejemplares = await res.json();
 
    if (!Array.isArray(ejemplares) || ejemplares.length === 0) {
      if (info) info.textContent = 'No tienes ejemplares todavía.';
      ejemplaresCache = [];
      renderEjemplares();
      return;
    }
 
    if (info) info.textContent = `Total ejemplares: ${ejemplares.length}`;
    // El servidor ya devuelve favorito/nº notas/audios/etiquetas en el listado
    for (const e of ejemplares) {
      if (e.rm_favorito === undefined) continue;
      readerMetaCache.set(Number(e.libro_id), {
        favorite: Boolean(e.rm_favorito),
        notesCount: Number(e.rm_notas || 0),
        audiosCount: Number(e.rm_audios || 0),
        tagsCount: Number(e.rm_tags || 0),
      });
    }
    ejemplaresCache = ejemplares;
    window._ejemplaresCache = ejemplares;
    renderEjemplares();
  } catch (err) {
    console.error(err);
    if (info) info.textContent = 'Error al cargar los ejemplares.';
  }
}
function resolverEjemplarIdDesdeCache(libroId) {
  const fila = (ejemplaresCache || []).find(e => Number(e.libro_id) === Number(libroId));
  return fila ? Number(fila.ejemplar_id) : null;
}
 
// ---------- Crear ejemplar ----------
async function crearEjemplar(duplicar = false) {
  setUserStatus('');
 
  if (!token || !usuarioActual) {
    setUserStatusErr('Debes iniciar sesión para crear ejemplares.');
    return;
  }
 
  const isbn = document.getElementById('isbn')?.value.trim();
  const ubicacion = document.getElementById('ubicacion')?.value.trim();
  const notas = document.getElementById('notas')?.value.trim();
 
  if (!isbn) {
    setUserStatusErr('Introduce un ISBN (o escanéalo).');
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/ejemplares`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        isbn,
        estado: 'propio',
        ubicacion: ubicacion || null,
        notas: notas || null,
        duplicar,
      }),
    });
 
    const data = await res.json();
    // Ya lo tienes: pedir confirmación y reintentar
    if (res.status === 409 && data.duplicado) {
      const donde = (data.mios || []).map(m => m.ubicacion || 'sin ubicación').join(', ');
      const ok = confirm(`Ya tienes «${data.libro?.titulo || isbn}» (${data.mios.length} ejemplar${data.mios.length > 1 ? 'es' : ''}: ${donde}).\n\n¿Añadir otro ejemplar igualmente?`);
      if (ok) return crearEjemplar(true);
      setUserStatus('No se ha añadido: ya lo tenías.');
      return;
    }
    if (res.status === 401) {
      setUserStatusErr('El servidor ha respondido 401 (no autorizado). Probablemente el token haya caducado; vuelve a iniciar sesión.');
      return;
    }
    if (!res.ok) {
      setUserStatusErr(data.error || 'Error creando ejemplar.');
      return;
    }
 
    setUserStatusOk(`Añadido: ${data.libro?.titulo || 'ejemplar'}`);
    const isbnEl = document.getElementById('isbn');
    if (isbnEl) isbnEl.value = '';
    window.VistaPreviaISBN?.invalidar();
    window.VistaPreviaISBN?.limpiar();
 
    await cargarEjemplares(usuarioActual.id);
    await refrescarHome();
 
    // cerrar panel alta en móvil (si existe)
    document.body.classList.remove('alta-visible');
    const fab = document.getElementById('btn-toggle-alta');
    if (fab) fab.textContent = '+';
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al crear el ejemplar.');
  }
}

// ---------- Cerrar sesión: borrar de pantalla los datos del usuario ----------
// La llama actualizarUIAutenticacion() (auth-ui.js) cuando no hay sesión, para que
// no quede nada de la biblioteca anterior pintado ni en memoria.
window.limpiarDatosUsuario = function limpiarDatosUsuario() {
  ejemplaresCache = [];
  window._ejemplaresCache = [];
  ejemplaresQuery = '';
  libroSeleccionadoId = null;
  ejemplarSeleccionadoId = null;
  usuariosPrestamo = [];
  readerMetaCache.clear();
  readerMetaInflight.clear();

  const buscador = document.getElementById('buscador-ejemplares');
  if (buscador) buscador.value = '';
  ['isbn', 'ubicacion', 'notas'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  window.VistaPreviaISBN?.invalidar();
  window.VistaPreviaISBN?.limpiar();

  ['ejemplares-list', 'ejemplares-grid', 'ejemplares-estanteria', 'cola-lista', 'deseos-lista']
    .forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  document.querySelectorAll('#tabla-ejemplares tbody, #tabla-lecturas-abiertas tbody, #tabla-prestamos-activos tbody')
    .forEach((tb) => { tb.innerHTML = ''; });
};
