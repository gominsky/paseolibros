// js/core.js — Estado global, temas, utilidades, modal e insignias del lector
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

const API_BASE = window.API_BASE;
 
// estabilidad de lectura (EAN)
let vistaEjemplares = 'lista';
 
// Preferencias UI (persisten en el navegador)
// v2: con el nuevo diseño, en móvil se empieza en cuadrícula aunque antes se guardara 'lista'
const VISTA_EJ_KEY = 'paseolibros_vista_ejemplares_v2';   // 'lista' | 'grid' | 'estanteria'
const SORT_EJ_KEY  = 'paseolibros_sort_ejemplares';    // { key, dir }
 
const SORT_EJ_KEYS_VALIDAS = new Set([
  'creado_en', 'titulo', 'autores', 'isbn', 'estado', 'ubicacion', 'notas'
]);
 
function guardarVistaEjemplares() {
  try { localStorage.setItem(VISTA_EJ_KEY, vistaEjemplares); } catch {}
}
 
function guardarSortEjemplares() {
  try { localStorage.setItem(SORT_EJ_KEY, JSON.stringify(sortEjemplares)); } catch {}
}
 
function restaurarPreferenciasUI() {
  // Vista
  try {
    const v = localStorage.getItem(VISTA_EJ_KEY);
    if (v === 'lista' || v === 'grid' || v === 'estanteria') vistaEjemplares = v;
    else if (window.matchMedia?.('(max-width: 820px)').matches) vistaEjemplares = 'grid'; // móvil: portadas grandes
  } catch {}
 
  // Ordenación
  try {
    const raw = localStorage.getItem(SORT_EJ_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    const keyOk = s && typeof s.key === 'string' && SORT_EJ_KEYS_VALIDAS.has(s.key);
    const dirOk = s && (s.dir === 'asc' || s.dir === 'desc');
    if (keyOk && dirOk) sortEjemplares = { key: s.key, dir: s.dir };
  } catch {}
  // Aplicar clase al body para evitar flash de vista incorrecta
  document.body.classList.toggle('vista-estanteria', vistaEjemplares === 'estanteria');
}
 
function aplicarVistaContenedor() {
  // Seleccionar SOLO el wrapper de la tabla de ejemplares (no las de lecturas/préstamos)
  var cardEj     = document.querySelector('.card-ejemplares');
  var tabla      = cardEj ? cardEj.querySelector('.table-wrapper') : null;
  var listaMovil = document.getElementById('ejemplares-list');
  var grid       = document.getElementById('ejemplares-grid');
  var estanteria = document.getElementById('ejemplares-estanteria');
 
  [tabla, listaMovil, grid, estanteria].forEach(function(el) { if (el) el.style.display = 'none'; });
 
  if (vistaEjemplares === 'lista') {
    if (tabla)      tabla.style.display      = '';
    if (listaMovil) listaMovil.style.display = '';
  } else if (vistaEjemplares === 'grid') {
    if (grid) grid.style.display = '';
  } else if (vistaEjemplares === 'estanteria') {
    if (estanteria) estanteria.style.display = '';
  }
}
 
function actualizarBotonesVistaEjemplares() {
  const bLista = document.getElementById('ej-vista-lista');
  const bGrid  = document.getElementById('ej-vista-grid');
  const bEst   = document.getElementById('ej-vista-estanteria');
 
  [bLista, bGrid, bEst].forEach(function(b) { if (b) b.classList.remove('is-active'); });
 
  if (vistaEjemplares === 'lista') { if (bLista) bLista.classList.add('is-active'); }
  else if (vistaEjemplares === 'grid') { if (bGrid) bGrid.classList.add('is-active'); }
  else if (vistaEjemplares === 'estanteria') { if (bEst) bEst.classList.add('is-active'); }
 
  if (bLista) bLista.setAttribute('aria-pressed', String(vistaEjemplares === 'lista'));
  if (bGrid)  bGrid.setAttribute('aria-pressed', String(vistaEjemplares === 'grid'));
  if (bEst)   bEst.setAttribute('aria-pressed', String(vistaEjemplares === 'estanteria'));
}
 
// selección actual en la tabla
let libroSeleccionadoId = null;
let ejemplarSeleccionadoId = null;
 
let usuariosPrestamo = [];
let prestamoContexto = null;
 
// ---------- Estado tabla ejemplares (buscador + ordenación) ----------
let ejemplaresCache = [];
let ejemplaresQuery = '';
let sortEjemplares = { key: 'creado_en', dir: 'desc' }; // por defecto: más nuevos primero
// ---------- Themes ----------
const THEMES = ['rose', 'dark'];
 
function aplicarTema(nombre) {
  const body = document.body;
  // Limpia todas las clases de theme
  THEMES.forEach((t) => body.classList.remove(`theme-${t}`));
 
  // 'rose' lo aplicamos también por clase para que sea simétrico
  const theme = nombre && THEMES.includes(nombre) ? nombre : 'rose';
  body.classList.add(`theme-${theme}`);
  try {
    localStorage.setItem('paseolibros_theme', theme);
  } catch {}
}
 
// ---------- Helpers ----------
function setUserStatus(msg) {
  const el = document.getElementById('user-status-msg');
  if (!el) return;
  el.textContent = msg || '';
}
function exportarEjemplaresCSV() {
  if (!ejemplaresCache || ejemplaresCache.length === 0) {
    alert('No hay ejemplares para exportar');
    return;
  }
 
  const columnas = [
    'titulo',
    'autores',
    'isbn',
    'estado',
    'ubicacion',
    'notas',
    'creado_en'
  ];
 
  const escapeCSV = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  };
 
  const filas = [
    columnas.join(','), // cabecera
    ...ejemplaresCache.map(e =>
      columnas.map(c => escapeCSV(e[c])).join(',')
    )
  ];
 
  const csv = filas.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
 
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `paseolibros_ejemplares_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
 
  URL.revokeObjectURL(url);
}
function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}
 
function setUserStatusOk(msg) { setUserStatus(msg ? `✓ ${msg}` : ''); }
function setUserStatusErr(msg) { setUserStatus(msg ? msg : ''); }
function normalizarTitulo(t) {
  return (t || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quita acentos
}
 
function titulosDuplicadosEnCache(titulo, libroIdActual = null) {
  const nt = normalizarTitulo(titulo);
  if (!nt) return [];
 
  return (ejemplaresCache || []).filter(e => {
    if (!e?.titulo) return false;
    if (libroIdActual && Number(e.libro_id) === Number(libroIdActual)) return false; // no compararse consigo mismo
    return normalizarTitulo(e.titulo) === nt;
  });
}
 
function setModalMsg(msg) {
  const el = document.getElementById('edit-mensaje');
  if (el) el.textContent = msg || '';
}
 
async function refrescarHome() {
  if (!token || !usuarioActual?.id) return;
  try {
    await Promise.all([cargarLecturasAbiertas(), cargarPrestamosActivos(), cargarEstadisticasLecturas()]);
  } catch (e) {
    console.warn('No se pudo refrescar la home', e);
  }
}
 
function urlPortadaAbsoluta(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url}`; // /uploads/xxx.jpg
}
 
// Caché de portadas: el navegador las guarda y solo se fuerza la recarga
// de una portada concreta cuando se cambia (antes se añadía ?t=Date.now()
// a TODAS en cada repintado → se volvían a descargar todas al buscar u ordenar).
const portadaVersion = new Map(); // url absoluta -> marca de versión
function marcarPortadaCambiada(url) {
  const abs = urlPortadaAbsoluta(url);
  if (abs) portadaVersion.set(abs, Date.now());
}
function srcPortada(url) {
  const abs = urlPortadaAbsoluta(url);
  if (!abs) return '';
  const v = portadaVersion.get(abs);
  return v ? `${abs}${abs.includes('?') ? '&' : '?'}v=${v}` : abs;
}
window.srcPortada = srcPortada;
window.marcarPortadaCambiada = marcarPortadaCambiada;
 
function toSortable(v) {
  if (v === null || v === undefined) return '';
  return normalizarTitulo(String(v));
}
 
 
function compare(a, b, key, dir) {
  const va = a?.[key];
  const vb = b?.[key];
 
  // fechas
  if (key.includes('fecha') || key.includes('creado') || key.includes('inicio') || key.includes('fin')) {
    const da = va ? new Date(va).getTime() : 0;
    const db = vb ? new Date(vb).getTime() : 0;
    return dir === 'asc' ? da - db : db - da;
  }
 
  // números
  const na = Number(va);
  const nb = Number(vb);
  const bothNumeric =
    !Number.isNaN(na) && !Number.isNaN(nb) && va !== '' && vb !== '';
  if (bothNumeric) return dir === 'asc' ? na - nb : nb - na;
 
  // texto
  const sa = toSortable(va);
  const sb = toSortable(vb);
  if (sa < sb) return dir === 'asc' ? -1 : 1;
  if (sa > sb) return dir === 'asc' ? 1 : -1;
  return 0;
}
// ---------- Modal ----------
function abrirModalFicha() {
  const modal = document.getElementById('modal-ficha');
  if (!modal) return;
  modal.classList.add('is-visible');
  document.body.classList.add('modal-abierto');
}
 
async function cerrarModalFicha() {
  const modal = document.getElementById('modal-ficha');
  if (!modal) return;
  modal.classList.remove('is-visible');
  document.body.classList.remove('modal-abierto');
  window.libroSeleccionadoId    = null;
  window.ejemplarSeleccionadoId = null;
  await refrescarHome();
}
function wireSortEjemplaresSelect() {
  const sel = document.getElementById('sort-ejemplares');
  if (!sel) return;
 
  // Refleja el estado actual en el select (por si vienes de localStorage)
  const current = `${sortEjemplares.key}:${sortEjemplares.dir}`;
  if (sel.value !== current) sel.value = current;
 
  // Evita duplicar listeners si se llama dos veces
  if (sel.dataset.wired === '1') return;
  sel.dataset.wired = '1';
 
  sel.addEventListener('change', () => {
    const [key, dir] = (sel.value || 'creado_en:desc').split(':');
    sortEjemplares = { key: key || 'creado_en', dir: dir === 'asc' ? 'asc' : 'desc' };
 
    guardarSortEjemplares();      // ✅ CLAVE: persistir ordenación
    renderEjemplares();           // vuelve a pintar tabla/lista
  });
}
// =========================
// Reader meta cache (favorito + nº notas)
// =========================
const readerMetaCache = new Map();        // libroId -> { favorite, notesCount, tagsCount? }
const readerMetaInflight = new Map();     // libroId -> Promise
 
function getReaderMetaCached(libroId) {
  return readerMetaCache.get(Number(libroId)) || null;
}
 
async function fetchReaderMeta(libroId) {
  libroId = Number(libroId);
  if (!libroId) return null;
 
  if (readerMetaCache.has(libroId)) return readerMetaCache.get(libroId);
  if (readerMetaInflight.has(libroId)) return readerMetaInflight.get(libroId);
 
  const p = (async () => {
    try {
      // OJO: aquí usamos tu API_BASE y getHeaders(false)
      const res = await fetch(`${API_BASE}/api/libros/${libroId}/reader-meta`, {
        headers: getHeaders(false),
      });
      if (!res.ok) throw new Error(`reader-meta ${res.status}`);
 
      const meta = await res.json();
      
 
// soporta: notes[], notesCount, notas[], notas_count, etc.
const notesArr =
  (Array.isArray(meta?.notes) && meta.notes) ||
  (Array.isArray(meta?.notas) && meta.notas) ||
  [];
 
const notesCount =
  (Array.isArray(notesArr) ? notesArr.length : 0) ||
  Number(meta?.notesCount ?? meta?.notes_count ?? meta?.notasCount ?? meta?.notas_count ?? 0);
 
const audiosArr =
  (Array.isArray(meta?.audios) && meta.audios) ||
  (Array.isArray(meta?.audio) && meta.audio) ||
  [];
 
const audiosCount =
  (Array.isArray(audiosArr) ? audiosArr.length : 0) ||
  Number(meta?.audiosCount ?? meta?.audios_count ?? 0);
 
const normalized = {
  favorite: Boolean(meta?.favorite ?? meta?.favorito ?? false),
  notesCount,
  audiosCount, // ✅ NUEVO
  tagsCount: Array.isArray(meta?.tags) ? meta.tags.length : Number(meta?.tagsCount || meta?.tags_count || 0),
};
      readerMetaCache.set(libroId, normalized);
      return normalized;
    } catch (e) {
      // Si falla, cachea "vacío" para no reintentar en bucle.
      const fallback = { favorite: false, notesCount: 0, audiosCount: 0, tagsCount: 0 };
      readerMetaCache.set(libroId, fallback);
      return fallback;
    } finally {
      readerMetaInflight.delete(libroId);
    }
  })();
 
  readerMetaInflight.set(libroId, p);
  return p;
}
 
// Concurrencia limitada
async function ensureReaderMetaFor(libroIds, concurrency = 6) {
  const ids = Array.from(new Set((libroIds || []).map(Number))).filter(Boolean);
  const pending = ids.filter(id => !readerMetaCache.has(id));
 
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    while (i < pending.length) {
      const id = pending[i++];
      await fetchReaderMeta(id);
      applyBadgesForLibro(id); // pinta lo que haya en DOM
    }
  });
  await Promise.all(workers);
}
 
// Aplica badges a TODOS los nodos que correspondan a un libroId
function applyBadgesForLibro(libroId) {
  const meta = getReaderMetaCached(libroId);
  if (!meta) return;
 
  document.querySelectorAll(`[data-badge-libro="${libroId}"]`).forEach((el) => {
    const fav = el.querySelector('.badge-fav');
    const notes = el.querySelector('.badge-notes');
 
    if (fav) {
      fav.innerHTML = meta.favorite ? icono('estrella-llena') : '';
      fav.title = meta.favorite ? 'Favorito' : 'No favorito';
      fav.classList.toggle('is-on', meta.favorite);
    }
   if (notes) {
  const parts = [];
  if (meta.notesCount) parts.push(`${icono('nota')}${meta.notesCount}`);
  if (meta.audiosCount) parts.push(`${icono('micro')}${meta.audiosCount}`);
  notes.innerHTML = parts.join(' ');
  notes.title = parts.length ? `Notas: ${meta.notesCount || 0} · Audios: ${meta.audiosCount || 0}` : '';
}
  });
}
