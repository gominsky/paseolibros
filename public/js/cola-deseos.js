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
    <span class="icon-circle">☑</span>
  </button>
  <button class="icon-btn cola-down" type="button" title="Bajar">
    <span class="icon-circle">☒</span>
  </button>
  <button class="icon-btn cola-del" type="button" title="Quitar">
    <span class="icon-circle">✕</span>
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
 
async function cargarDeseos() {
  if (!usuarioActual?.id) return;
 
  const info = document.getElementById('info-deseos');
  const lista = document.getElementById('deseos-lista');
  if (!info || !lista) return;
 
  const q = document.getElementById('deseos-q')?.value?.trim() || '';
  const tipo = document.getElementById('deseos-tipo')?.value || '';
  const ubicacion = document.getElementById('deseos-ubicacion')?.value?.trim() || '';
 
  info.textContent = 'Cargando...';
  lista.innerHTML = '';
 
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (tipo) params.set('tipo', tipo);
  if (ubicacion) params.set('ubicacion', ubicacion);
 
  const res = await fetch(`${API_BASE}/api/usuarios/${usuarioActual.id}/deseos?${params.toString()}`, {
    headers: getHeaders(false),
  });
  const data = await res.json();
 
  if (!res.ok) {
    info.textContent = data.error || 'Error cargando deseos';
    return;
  }
 
  info.textContent = `Deseos: ${data.length}`;
  lista.innerHTML = data.map(d => `
    <div class="deseo-item" data-id="${d.id}">
      <div>
        <div class="deseo-title">${escapeHtml(d.titulo || '—')}</div>
        <div class="deseo-meta">
          ${d.autores ? `<span>${escapeHtml(d.autores)}</span>` : ''}
          ${d.tipo ? `<span class="deseo-pill">${escapeHtml(d.tipo)}</span>` : ''}
          ${d.ubicacion ? `<span class="deseo-pill">${escapeHtml(d.ubicacion)}</span>` : ''}
          <span class="deseo-pill">Prioridad: ${d.prioridad ?? 2}</span>
        </div>
        ${d.notas ? `<div style="margin-top:6px; opacity:.85;">${escapeHtml(d.notas)}</div>` : ''}
      </div>
      <div class="deseo-actions">
        <button class="icon-btn deseo-del" type="button" title="Eliminar"><span class="icon-circle">✕</span></button>
      </div>
    </div>
  `).join('');
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
  const titulo = document.getElementById('deseo-titulo')?.value?.trim() || '';
  const autores = document.getElementById('deseo-autores')?.value?.trim() || '';
  const isbn = document.getElementById('deseo-isbn')?.value?.trim() || '';
  const tipo = document.getElementById('deseo-tipo')?.value || 'libro';
  const ubicacion = document.getElementById('deseo-ubicacion')?.value?.trim() || '';
  const prioridad = Number(document.getElementById('deseo-prioridad')?.value || 2);
  const notas = document.getElementById('deseo-notas')?.value?.trim() || '';
  const url_portada = document.getElementById('deseo-portada')?.value?.trim() || '';
 
  if (!titulo) {
    alert('El título es obligatorio.');
    return;
  }
 
  const res = await fetch(`${API_BASE}/api/deseos`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({
      titulo,
      autores: autores || null,
      isbn: isbn || null,
      tipo: tipo || 'libro',
      ubicacion: ubicacion || null,
      prioridad: Number.isFinite(prioridad) ? prioridad : 2,
      notas: notas || null,
      url_portada: url_portada || null
    })
  });
 
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Error creando deseo');
    return;
  }
 
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
  ['deseos-q', 'deseos-ubicacion'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(cargarDeseos, 200);
    });
  });
  document.getElementById('deseos-tipo')?.addEventListener('change', cargarDeseos);
 
  // Abrir formulario nuevo deseo
  document.getElementById('btn-nuevo-deseo')?.addEventListener('click', () => {
    // limpiar
    ['deseo-titulo','deseo-autores','deseo-isbn','deseo-ubicacion','deseo-notas','deseo-portada'].forEach(id=>{
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const pr = document.getElementById('deseo-prioridad'); if (pr) pr.value = '2';
    const tp = document.getElementById('deseo-tipo'); if (tp) tp.value = 'libro';
 
    cerrarOverlay('deseos-overlay');
    abrirOverlay('deseo-form-overlay');
    document.getElementById('deseo-titulo')?.focus();
  });
 
  // Cerrar formulario
  document.getElementById('btn-cerrar-deseo-form')?.addEventListener('click', () => cerrarOverlay('deseo-form-overlay'));
  document.getElementById('btn-cancelar-deseo')?.addEventListener('click', () => cerrarOverlay('deseo-form-overlay'));
 
  // Click fuera en form
  document.getElementById('deseo-form-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'deseo-form-overlay') cerrarOverlay('deseo-form-overlay');
  });
 
  // Guardar
  document.getElementById('btn-guardar-deseo')?.addEventListener('click', crearDeseoDesdeForm);
 
  // Delegación eliminar
  document.getElementById('deseos-lista')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.deseo-del');
    if (!btn) return;
    const item = e.target.closest('.deseo-item');
    const id = Number(item?.dataset?.id);
    if (!id) return;
    if (confirm('¿Eliminar este deseo?')) borrarDeseo(id);
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
 
  grid.innerHTML = (lista || []).map(e => {
    const portada = e.url_portada ? srcPortada(e.url_portada) : '';
    return `
      <div class="ej-grid-item" data-libro-id="${e.libro_id}" data-ejemplar-id="${e.ejemplar_id}">
        ${portada
          ? `<img class="ej-grid-cover" src="${portada}" alt="Portada" loading="lazy" decoding="async"
               onerror="this.onerror=null;this.outerHTML='<div class=&quot;portada-placeholder-grid&quot; aria-hidden=&quot;true&quot;><span class=&quot;ph-logo&quot;>Pdl</span><span class=&quot;ph-sub&quot;>Sin portada</span></div>';">`
          : `<div class="portada-placeholder-grid" aria-hidden="true">
               <span class="ph-logo">Pdl</span>
               <span class="ph-sub">Sin portada</span>
             </div>`
        }
        <div class="ej-grid-title">${escapeHtml(e.titulo || '—')}</div>
        <div class="ej-grid-meta">
          ${e.autores ? `<span class="ej-grid-pill">${escapeHtml(e.autores)}</span>` : ''}
          ${e.tipo ? `<span class="ej-grid-pill">${escapeHtml(e.tipo)}</span>` : ''}
          ${e.ubicacion ? `<span class="ej-grid-pill">${escapeHtml(e.ubicacion)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
  
}
