// js/cola-deseos.js — Cola de lectura y lista de deseos
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// ===== Cola =====
async function cargarCola() {
  if (!usuarioActual?.id) return;
 
  const info = document.getElementById('info-cola');
  const lista = document.getElementById('cola-lista');
  if (!info || !lista) return;
 
  const q = document.getElementById('cola-q')?.value?.trim() || '';
 
  info.textContent = 'Cargando...';
  lista.innerHTML = '';
 
  const params = new URLSearchParams();
  if (q) params.set('q', q);
 
  const res = await fetch(`${API_BASE}/api/usuarios/${usuarioActual.id}/cola?${params.toString()}`, {
    headers: getHeaders(false),
  });
  const data = await res.json();
 
  if (!res.ok) {
    info.textContent = data.error || 'Error cargando cola';
    return;
  }
 
  info.textContent = `En cola: ${data.length}`;
  lista.innerHTML = data.map(item => `
    <div class="deseo-item" data-id="${item.id}">
      <div>
        <div class="deseo-title">${escapeHtml(item.titulo || '—')}</div>
        <div class="deseo-meta">
          ${item.autores ? `<span>${escapeHtml(item.autores)}</span>` : ''}
          ${item.isbn ? `<span class="deseo-pill">ISBN: ${escapeHtml(item.isbn)}</span>` : ''}
          ${item.ubicacion ? `<span class="deseo-pill">${escapeHtml(item.ubicacion)}</span>` : ''}
        </div>
        ${item.notas ? `<div style="margin-top:6px; opacity:.85;">${escapeHtml(item.notas)}</div>` : ''}
      </div>
      <div class="deseo-actions">
  <button class="icon-btn cola-up" type="button" title="Subir">
    <span class="icon-circle"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-arriba"/></svg></span>
  </button>
  <button class="icon-btn cola-down" type="button" title="Bajar">
    <span class="icon-circle"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-abajo"/></svg></span>
  </button>
  <button class="icon-btn cola-del" type="button" title="Quitar">
    <span class="icon-circle">${icono('cerrar')}</span>
  </button>
</div>
    </div>
  `).join('');
}
async function addEjemplarToCola(ejemplarId) {
  const res = await fetch(`${API_BASE}/api/cola`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ ejemplar_id: Number(ejemplarId) })
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Error añadiendo a cola');
    return;
  }
  await cargarCola();
}
async function actualizarCola(id, patch) {
  const res = await fetch(`${API_BASE}/api/cola/${id}`, {
    method: 'PATCH',
    headers: getHeaders(true),
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error actualizando cola (HTTP ${res.status})`);
  return data;
}
async function moverColaSwap(id, dir) {
  // dir = -1 (subir), +1 (bajar)
  const q = document.getElementById('cola-q')?.value?.trim() || '';
  const params = new URLSearchParams();
  if (q) params.set('q', q);
 
  // Importante: para reordenar, mejor usar el orden "posicion asc"
  const res = await fetch(`${API_BASE}/api/usuarios/${usuarioActual.id}/cola?${params.toString()}`, {
    headers: getHeaders(false),
  });
  const items = await res.json();
  if (!res.ok) throw new Error(items.error || 'No se pudo cargar la cola');
 
  const idx = items.findIndex(x => Number(x.id) === Number(id));
  if (idx === -1) return;
 
  const j = idx + dir;
  if (j < 0 || j >= items.length) return; // ya está arriba/abajo
 
  const a = items[idx];
  const b = items[j];
 
  // swap posiciones
  const posA = Number(a.posicion ?? 999999);
  const posB = Number(b.posicion ?? 999999);
 
  // Si por lo que sea vinieran iguales, primero normalizamos
  if (posA === posB) {
    await normalizarPosicionesCola(items);
    return moverColaSwap(id, dir);
  }
 
  await Promise.all([
    actualizarCola(a.id, { posicion: posB }),
    actualizarCola(b.id, { posicion: posA }),
  ]);
 
  await cargarCola();
}
async function normalizarPosicionesCola(items) {
  // deja posiciones 10,20,30… para evitar colisiones
  const updates = items.map((it, k) => {
    const nueva = (k + 1) * 10;
    return actualizarCola(it.id, { posicion: nueva });
  });
  await Promise.all(updates);
  await cargarCola();
}
 
async function borrarDeCola(id) {
  const res = await fetch(`${API_BASE}/api/cola/${id}`, {
    method: 'DELETE',
    headers: getHeaders(false),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Error quitando de cola');
    return;
  }
  await cargarCola();
}
function renderColaPickList() {
  const list = document.getElementById('cola-pick-lista');
  if (!list) return;
 
  const q = (document.getElementById('cola-pick-q')?.value || '').toLowerCase().trim();
  const items = (ejemplaresCache || []).filter(e => {
    const blob = [e.titulo, e.autores, e.isbn, e.ubicacion, e.notas].filter(Boolean).join(' ').toLowerCase();
    return !q || blob.includes(q);
  });
 
  list.innerHTML = items.map(e => `
    <div class="deseo-item" data-ejemplar-id="${e.ejemplar_id}">
      <div>
        <div class="deseo-title">${escapeHtml(e.titulo || '—')}</div>
        <div class="deseo-meta">
          ${e.autores ? `<span>${escapeHtml(e.autores)}</span>` : ''}
          ${e.isbn ? `<span class="deseo-pill">ISBN: ${escapeHtml(e.isbn)}</span>` : ''}
          ${e.ubicacion ? `<span class="deseo-pill">${escapeHtml(e.ubicacion)}</span>` : ''}
        </div>
      </div>
      <div class="deseo-actions">
        <button class="btn btn-secondary btn-sm cola-add" type="button">Añadir</button>
      </div>
    </div>
  `).join('');
}
function wireColaUI() {
  document.getElementById('btn-open-cola')?.addEventListener('click', () => {
    abrirOverlay('cola-overlay');
    cargarCola();
  });
 
  document.getElementById('btn-cerrar-cola')?.addEventListener('click', () => cerrarOverlay('cola-overlay'));
  document.getElementById('cola-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'cola-overlay') cerrarOverlay('cola-overlay');
  });
 
  let t = null;
  document.getElementById('cola-q')?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(cargarCola, 200);
  });
 
  // abrir selector
  document.getElementById('btn-add-cola')?.addEventListener('click', () => {
    abrirOverlay('cola-pick-overlay');
    renderColaPickList();
  });
 
  // cerrar selector
  document.getElementById('btn-cerrar-cola-pick')?.addEventListener('click', () => cerrarOverlay('cola-pick-overlay'));
  document.getElementById('cola-pick-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'cola-pick-overlay') cerrarOverlay('cola-pick-overlay');
  });
  document.getElementById('cola-pick-q')?.addEventListener('input', () => renderColaPickList());
 
  // delegación: añadir
  document.getElementById('cola-pick-lista')?.addEventListener('click', async (e) => {
    const card = e.target.closest('.deseo-item');
    if (!card) return;
    if (!e.target.closest('.cola-add')) return;
 
    const ejId = Number(card.dataset.ejemplarId);
    await addEjemplarToCola(ejId);
    cerrarOverlay('cola-pick-overlay');
  });
}
 
// ===== Deseos (Wishlist) =====
let deseosKeyHandler = null;
 
function abrirOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'flex';
  document.documentElement.style.overflow = 'hidden';
}
 
function cerrarOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'none';
  document.documentElement.style.overflow = '';
}
 
// ---------- Lista de deseos ----------
const PRIORIDADES = { 1: 'Alta', 2: 'Media', 3: 'Baja' };
let deseosCache = new Map();      // id -> deseo (para editar sin volver a pedirlo)
let deseoEditandoId = null;       // null = nuevo deseo

async function cargarDeseos() {
  if (!usuarioActual?.id) return;
 
  const info = document.getElementById('info-deseos');
  const lista = document.getElementById('deseos-lista');
  if (!info || !lista) return;
 
  const q = document.getElementById('deseos-q')?.value?.trim() || '';
  const tipo = document.getElementById('deseos-tipo')?.value || '';
  const order = document.getElementById('deseos-orden')?.value || 'prioridad';
 
  if (!lista.children.length) info.textContent = 'Cargando...';
 
  const params = new URLSearchParams({ order });
  if (q) params.set('q', q);
  if (tipo) params.set('tipo', tipo);
 
  const res = await fetch(`${API_BASE}/api/usuarios/${usuarioActual.id}/deseos?${params.toString()}`, {
    headers: getHeaders(false),
  });
  const data = await res.json();
 
  if (!res.ok) {
    info.textContent = data.error || 'Error cargando deseos';
    return;
  }
 
  deseosCache = new Map(data.map((d) => [Number(d.id), d]));
  const filtrando = q || tipo;
  info.textContent = data.length
    ? `${data.length} deseo${data.length === 1 ? '' : 's'}`
    : (filtrando ? 'Ningún deseo coincide con la búsqueda.' : 'Tu lista está vacía. Pulsa «Añadir deseo» para buscar libros en internet.');
  lista.innerHTML = data.map((d) => {
    const prio = [1, 2, 3].includes(Number(d.prioridad)) ? Number(d.prioridad) : 2;
    return `
    <div class="deseo-item deseo-item--portada deseo-prio-${prio}" data-id="${d.id}">
      <div class="deseo-portada">${imgPortada(d.url_portada, d.titulo, d.autores, 'deseo-portada-img', 'mini')}</div>
      <div class="deseo-cuerpo">
        <button type="button" class="deseo-title deseo-editar" title="Editar deseo">${escapeHtml(d.titulo || '—')}</button>
        <div class="deseo-meta">
          ${d.autores ? `<span>${escapeHtml(d.autores)}</span>` : ''}
          ${d.tipo && d.tipo !== 'libro' ? `<span class="deseo-pill">${escapeHtml(d.tipo)}</span>` : ''}
        </div>
        ${d.notas ? `<div class="deseo-notas">${escapeHtml(d.notas)}</div>` : ''}
      </div>
      <div class="deseo-actions">
        <select class="deseo-prio-sel" aria-label="Prioridad de ${escapeHtml(d.titulo || '')}" title="Prioridad">
          ${[1, 2, 3].map((p) => `<option value="${p}" ${p === prio ? 'selected' : ''}>${PRIORIDADES[p]}</option>`).join('')}
        </select>
        <button class="icon-btn deseo-editar" type="button" title="Editar" aria-label="Editar"><span class="icon-circle">${icono('editar')}</span></button>
        <button class="icon-btn deseo-del" type="button" title="Eliminar" aria-label="Eliminar"><span class="icon-circle">${icono('cerrar')}</span></button>
      </div>
    </div>`;
  }).join('');
}

async function cambiarPrioridadDeseo(id, prioridad, item) {
  const res = await fetch(`${API_BASE}/api/deseos/${id}`, {
    method: 'PATCH',
    headers: getHeaders(true),
    body: JSON.stringify({ prioridad }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error || 'No se pudo cambiar la prioridad'); return cargarDeseos(); }
  deseosCache.set(id, data);
  item?.classList.remove('deseo-prio-1', 'deseo-prio-2', 'deseo-prio-3');
  item?.classList.add(`deseo-prio-${prioridad}`);
  // Ordenada por prioridad: recolocar
  if ((document.getElementById('deseos-orden')?.value || 'prioridad') === 'prioridad') cargarDeseos();
}

// Abre el formulario: sin deseo = nuevo (con buscador de internet); con deseo = editar
function abrirFormDeseo(d = null) {
  deseoEditandoId = d?.id ?? null;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  set('deseo-titulo', d?.titulo);
  set('deseo-autores', d?.autores);
  set('deseo-isbn', d?.isbn);
  set('deseo-notas', d?.notas);
  set('deseo-portada', d?.url_portada);
  set('deseo-prioridad', String(d?.prioridad || 2));
  set('deseo-tipo', d?.tipo || 'libro');

  const editar = Boolean(d);
  const titulo = document.getElementById('deseo-form-titulo');
  if (titulo) titulo.textContent = editar ? 'Editar deseo' : 'Nuevo deseo';
  document.querySelector('#deseo-form-overlay .deseo-buscar')?.toggleAttribute('hidden', editar);
  document.querySelector('#deseo-form-overlay .deseo-sep')?.toggleAttribute('hidden', editar);
  const guardar = document.getElementById('btn-guardar-deseo');
  if (guardar) guardar.textContent = editar ? 'Guardar cambios' : 'Guardar';

  limpiarBuscadorDeseos();
  cerrarOverlay('deseos-overlay');
  abrirOverlay('deseo-form-overlay');
  document.querySelector('#deseo-form-overlay .deseo-form')?.scrollTo(0, 0);
  document.getElementById(editar ? 'deseo-titulo' : 'deseo-buscar-q')?.focus();
}

function setScanButtonState(isOn) {
  const btn = document.getElementById('btn-escanear');
  if (!btn) return;
 
  btn.dataset.scanning = isOn ? '1' : '0';
  btn.textContent = isOn ? 'Detener' : 'Escanear';
  btn.classList.toggle('btn-danger', isOn);      // si tienes esta clase
  btn.classList.toggle('btn-secondary', !isOn);  // o la que uses
}
 
async function crearDeseoDesdeForm() {
  const val = (id) => document.getElementById(id)?.value?.trim() || '';
  const titulo = val('deseo-titulo');
  if (!titulo) {
    alert('El título es obligatorio.');
    document.getElementById('deseo-titulo')?.focus();
    return;
  }
  const prioridad = Number(val('deseo-prioridad') || 2);
  const cuerpo = {
    titulo,
    autores: val('deseo-autores'),
    isbn: val('deseo-isbn'),
    tipo: val('deseo-tipo') || 'libro',
    prioridad: [1, 2, 3].includes(prioridad) ? prioridad : 2,
    notas: val('deseo-notas'),
    url_portada: val('deseo-portada'),
  };
  const editando = deseoEditandoId != null;
  if (!editando) Object.keys(cuerpo).forEach((k) => { if (cuerpo[k] === '') cuerpo[k] = null; });

  const res = await fetch(`${API_BASE}/api/deseos${editando ? `/${deseoEditandoId}` : ''}`, {
    method: editando ? 'PATCH' : 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(cuerpo),
  });
 
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error || 'Error guardando el deseo');
    return;
  }
 
  deseoEditandoId = null;
  cerrarOverlay('deseo-form-overlay');
  abrirOverlay('deseos-overlay');
  await cargarDeseos();
}
 
async function borrarDeseo(id) {
  const res = await fetch(`${API_BASE}/api/deseos/${id}`, {
    method: 'DELETE',
    headers: getHeaders(false),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Error eliminando deseo');
    return;
  }
  await cargarDeseos();
}
 
// ---------- Buscar libros en internet para la lista de deseos ----------
let resultadosDeseos = [];
let busquedaDeseosId = 0;

function limpiarBuscadorDeseos() {
  busquedaDeseosId++;
  resultadosDeseos = [];
  const q = document.getElementById('deseo-buscar-q'); if (q) q.value = '';
  const r = document.getElementById('deseo-resultados'); if (r) r.innerHTML = '';
  const info = document.getElementById('deseo-buscar-info');
  if (info) info.innerHTML = 'Busca el libro y pulsa <strong>+</strong> para añadirlo, o tócalo para revisar los datos antes de guardar.';
}

function pintarResultadosDeseos() {
  const cont = document.getElementById('deseo-resultados');
  if (!cont) return;
  cont.innerHTML = resultadosDeseos.map((r, i) => {
    const meta = [r.autores, r.anio, r.editorial].filter(Boolean).map(escapeHtml).join(' · ');
    let estado = '';
    if (r.anadido) estado = `<span class="deseo-pill deseo-pill--ok">${icono('check')} Añadido</span>`;
    else if (r.ya_deseado) estado = '<span class="deseo-pill">Ya en deseos</span>';
    else if (r.ya_tengo) estado = '<span class="deseo-pill deseo-pill--warn">Ya lo tienes</span>';
    const bloqueado = r.anadido || r.ya_deseado;
    return `
      <div class="deseo-res" data-i="${i}" role="button" tabindex="0" title="Revisar datos antes de guardar">
        <div class="deseo-res-portada">${imgPortada(r.url_portada, r.titulo, r.autores, 'deseo-res-img', 'mini')}</div>
        <div class="deseo-res-info">
          <div class="deseo-res-titulo">${escapeHtml(r.titulo)}</div>
          ${meta ? `<div class="deseo-res-meta">${meta}</div>` : ''}
          ${estado ? `<div class="deseo-res-estado">${estado}</div>` : ''}
        </div>
        <button type="button" class="icon-btn deseo-res-add" data-i="${i}" ${bloqueado ? 'disabled' : ''}
          title="Añadir a la lista de deseos" aria-label="Añadir ${escapeHtml(r.titulo)} a la lista de deseos">
          <span class="icon-circle">${r.anadido ? icono('check') : '+'}</span>
        </button>
      </div>`;
  }).join('');
}

async function buscarDeseosEnInternet() {
  const q = document.getElementById('deseo-buscar-q')?.value?.trim() || '';
  const info = document.getElementById('deseo-buscar-info');
  const cont = document.getElementById('deseo-resultados');
  if (q.length < 2) { if (info) info.textContent = 'Escribe al menos 2 letras.'; return; }

  const id = ++busquedaDeseosId;
  if (info) info.textContent = 'Buscando…';
  if (cont) cont.classList.add('is-cargando');
  try {
    const res = await fetch(`${API_BASE}/api/deseos/buscar-internet?q=${encodeURIComponent(q)}`, { headers: getHeaders(false) });
    const data = await res.json();
    if (id !== busquedaDeseosId) return; // llegó otra búsqueda más nueva
    if (!res.ok) { if (info) info.textContent = data.error || 'No se pudo buscar.'; return; }
    resultadosDeseos = data;
    if (info) info.textContent = data.length
      ? `${data.length} resultado${data.length === 1 ? '' : 's'}. Pulsa + para añadir o toca un libro para revisar sus datos.`
      : 'No se ha encontrado nada. Prueba con otras palabras o escribe los datos a mano.';
    pintarResultadosDeseos();
  } catch {
    if (id === busquedaDeseosId && info) info.textContent = 'Sin conexión: no se puede buscar ahora.';
  } finally {
    if (id === busquedaDeseosId) cont?.classList.remove('is-cargando');
  }
}

// Rellena el formulario con un resultado (para revisar tipo, prioridad, notas…)
function rellenarFormDeseo(r) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('deseo-titulo', r.titulo);
  set('deseo-autores', r.autores);
  set('deseo-isbn', r.isbn);
  set('deseo-portada', r.url_portada);
  const t = document.getElementById('deseo-titulo');
  t?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  t?.focus({ preventScroll: true });
}

// Añade directamente con la prioridad y el tipo elegidos en el formulario
async function anadirDeseoRapido(i) {
  const r = resultadosDeseos[i];
  if (!r || r.anadido) return;
  const res = await fetch(`${API_BASE}/api/deseos`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({
      titulo: r.titulo,
      autores: r.autores || null,
      isbn: r.isbn || null,
      tipo: document.getElementById('deseo-tipo')?.value || 'libro',
      prioridad: Number(document.getElementById('deseo-prioridad')?.value || 2),
      url_portada: r.url_portada || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 400 && /ISBN/i.test(data.error || '')) { r.ya_deseado = true; pintarResultadosDeseos(); return; }
    alert(data.error || 'Error añadiendo el deseo');
    return;
  }
  r.anadido = true;
  pintarResultadosDeseos();
}

function wireBuscadorDeseos() {
  document.getElementById('deseo-buscar-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    buscarDeseosEnInternet();
  });
  let t = null;
  document.getElementById('deseo-buscar-q')?.addEventListener('input', (e) => {
    clearTimeout(t);
    if (e.target.value.trim().length >= 3) t = setTimeout(buscarDeseosEnInternet, 600);
  });
  const cont = document.getElementById('deseo-resultados');
  cont?.addEventListener('click', (e) => {
    const add = e.target.closest('.deseo-res-add');
    if (add) { e.stopPropagation(); anadirDeseoRapido(Number(add.dataset.i)); return; }
    const fila = e.target.closest('.deseo-res');
    if (fila) rellenarFormDeseo(resultadosDeseos[Number(fila.dataset.i)]);
  });
  cont?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList.contains('deseo-res')) return;
    e.preventDefault();
    rellenarFormDeseo(resultadosDeseos[Number(e.target.dataset.i)]);
  });
}

function wireDeseosUI() {
  // Abrir desde herramientas
  document.getElementById('btn-open-deseos')?.addEventListener('click', () => {
    abrirOverlay('deseos-overlay');
    cargarDeseos();
  });
 
  // Cerrar overlay lista
  document.getElementById('btn-cerrar-deseos')?.addEventListener('click', () => cerrarOverlay('deseos-overlay'));
 
  // Click fuera para cerrar
  document.getElementById('deseos-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'deseos-overlay') cerrarOverlay('deseos-overlay');
  });
 
  // Buscar/filtros (debounce simple)
  let t = null;
  ['deseos-q'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(cargarDeseos, 200);
    });
  });
  document.getElementById('deseos-tipo')?.addEventListener('change', cargarDeseos);
  document.getElementById('deseos-orden')?.addEventListener('change', cargarDeseos);
 
  // Abrir formulario nuevo deseo
  document.getElementById('btn-nuevo-deseo')?.addEventListener('click', () => abrirFormDeseo());
 
  // Cerrar formulario
  // (al cerrar el formulario se vuelve a la lista, ya con lo añadido desde la búsqueda)
  const volverALista = () => {
    deseoEditandoId = null;
    cerrarOverlay('deseo-form-overlay');
    abrirOverlay('deseos-overlay');
    cargarDeseos();
  };
  document.getElementById('btn-cerrar-deseo-form')?.addEventListener('click', volverALista);
  document.getElementById('btn-cancelar-deseo')?.addEventListener('click', volverALista);
 
  // Click fuera en form
  document.getElementById('deseo-form-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'deseo-form-overlay') volverALista();
  });

  wireBuscadorDeseos();
 
  // Guardar
  document.getElementById('btn-guardar-deseo')?.addEventListener('click', crearDeseoDesdeForm);
 
  // Delegación eliminar
  const listaDeseos = document.getElementById('deseos-lista');
  listaDeseos?.addEventListener('click', (e) => {
    const item = e.target.closest('.deseo-item');
    const id = Number(item?.dataset?.id);
    if (!id) return;
    if (e.target.closest('.deseo-del')) {
      if (confirm('¿Eliminar este deseo?')) borrarDeseo(id);
      return;
    }
    if (e.target.closest('.deseo-editar')) abrirFormDeseo(deseosCache.get(id));
  });
  listaDeseos?.addEventListener('change', (e) => {
    const sel = e.target.closest('.deseo-prio-sel');
    if (!sel) return;
    const item = sel.closest('.deseo-item');
    cambiarPrioridadDeseo(Number(item?.dataset?.id), Number(sel.value), item);
  });
 
  // ESC para cerrar overlays
  if (!deseosKeyHandler) {
    deseosKeyHandler = (e) => {
      if (e.key !== 'Escape') return;
      cerrarOverlay('deseo-form-overlay');
      cerrarOverlay('deseos-overlay');
    };
    document.addEventListener('keydown', deseosKeyHandler);
  }
}
function renderEjemplaresGrid(lista) {
  const grid = document.getElementById('ejemplares-grid');
  const tablaWrap = document.querySelector('#tabla-ejemplares')?.closest('.table-wrapper');
  const mobileList = document.getElementById('ejemplares-list'); // tu lista móvil (si existe)
 
  // Marca la card contenedora para estilos específicos en móvil
  grid.closest('.card')?.classList.add('card-ejemplares');
 
  if (!grid || !tablaWrap) return;
 
  const showGrid = vistaEjemplares === 'grid';
 
  // ✅ Estado global para CSS (móvil): evita que se vean lista + grid a la vez
  // Ocultar estantería cuando no corresponde
  const estanteriaEl = document.getElementById('ejemplares-estanteria');
  if (estanteriaEl) estanteriaEl.style.display = (vistaEjemplares === 'estanteria') ? '' : 'none';
 
    document.body.classList.toggle('vista-ej-grid', showGrid);
 
 
  grid.style.display = showGrid ? 'grid' : 'none';
 
  // Gestión de visibilidad según vista activa
  if (showGrid) {
    tablaWrap.style.display = 'none';
    if (mobileList) mobileList.style.display = 'none';
  } else if (vistaEjemplares === 'estanteria') {
    // En estantería no mostrar tabla ni lista
    tablaWrap.style.display = 'none';
    if (mobileList) mobileList.style.display = 'none';
    return; // No rellenar el grid
  } else {
    tablaWrap.style.display = '';
    if (mobileList) mobileList.style.display = '';
  }
 
  if (!showGrid) return;
 
  // Cuadrícula de portadas grandes: la portada manda; debajo, título y autor
  grid.innerHTML = (lista || []).map(e => `
      <div class="ej-grid-item" data-libro-id="${e.libro_id}" data-ejemplar-id="${e.ejemplar_id}" role="button" tabindex="0">
        <div class="ej-grid-cover-wrap" data-badge-libro="${e.libro_id}">
          ${imgPortada(e.url_portada, e.titulo, e.autores, 'ej-grid-cover', 'grid')}
          <span class="badge badge-fav" aria-hidden="true"></span>
          <span class="badge badge-notes" aria-hidden="true"></span>
        </div>
        <div class="ej-grid-title">${escapeHtml(e.titulo || 'Sin título')}</div>
        ${e.autores ? `<div class="ej-grid-autor">${escapeHtml(autorCorto(e.autores))}</div>` : ''}
      </div>
    `).join('');
  
}
