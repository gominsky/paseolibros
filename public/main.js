const PROD_API = 'https://paseolibros.onrender.com'; // <- pon aquí tu URL real
const isDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
// Si estoy en localhost (PC desarrollando) → uso backend local
// En cualquier otro sitio (incluido file:// en móvil) → uso backend de Render
const API_BASE = isDev ? 'http://localhost:3011' : PROD_API;

//const isDev = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.protocol === 'file:';
//const API_BASE = isDev ? 'http://localhost:3011' : '';

let codeReader = null;
let currentStream = null;

// estabilidad de lectura (EAN)
let lastScanValue = null;
let lastScanCount = 0;
let scannerRunning = false;
let token = null;
let usuarioActual = null; // { id, nombre_usuario, ... }
// Vista ejemplares: 'lista' | 'grid'
let vistaEjemplares = 'lista';

const TOKEN_KEY = 'paseolibros_token';
const USER_KEY = 'paseolibros_usuario';
// Preferencias UI (persisten en el navegador)
const VISTA_EJ_KEY = 'paseolibros_vista_ejemplares';   // 'lista' | 'grid'
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
    if (v === 'lista' || v === 'grid') vistaEjemplares = v;
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
}

function actualizarBotonesVistaEjemplares() {
  const bLista = document.getElementById('ej-vista-lista');
  const bGrid  = document.getElementById('ej-vista-grid');
  if (!bLista || !bGrid) return;

  const isGrid = vistaEjemplares === 'grid';
  bLista.classList.toggle('is-active', !isGrid);
  bGrid.classList.toggle('is-active', isGrid);

  // opcional accesibilidad
  bLista.setAttribute('aria-pressed', String(!isGrid));
  bGrid.setAttribute('aria-pressed', String(isGrid));
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

function setUserStatusOk(msg) { setUserStatus(msg ? `✅ ${msg}` : ''); }
function setUserStatusErr(msg) { setUserStatus(msg ? `❌ ${msg}` : ''); }
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
    await Promise.all([cargarLecturasAbiertas(), cargarPrestamosActivos()]);
  } catch (e) {
    console.warn('No se pudo refrescar la home', e);
  }
}

function urlPortadaAbsoluta(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url}`; // /uploads/xxx.jpg
}

function getHeaders(json = true) {
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';

  if (token) {
    // Variante 1 (Bearer)
    headers['Authorization'] = `Bearer ${token}`;

    // Variante 2 (sin Bearer) + header alternativo común
    headers['X-Access-Token'] = token;
    headers['Authorization-Token'] = token; // opcional defensivo
  }

  return headers;
}

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

// ---------- UI auth ----------
function actualizarUIAutenticacion() {
  const loginModal = document.getElementById('login-modal');
  const userBar = document.getElementById('user-bar');
  const nombreSpan = document.getElementById('nombre-usuario-actual');

  const loggedIn = Boolean(token && usuarioActual);
  // Refresco suave de portadas (1 vez por sesión)
if (!sessionStorage.getItem('portadas_refrescadas')) {
  sessionStorage.setItem('portadas_refrescadas', '1');

  fetch(`${API_BASE}/api/ejemplares/refrescar-portadas?limite=10`, {
    method: 'POST',
    headers: getHeaders(false),
  })
    .then(() => cargarEjemplares(usuarioActual.id))
    .catch(() => {});
}

  // Modal de login + barra superior
  if (loginModal) loginModal.style.display = loggedIn ? 'none' : 'flex';
  if (userBar) userBar.style.display = loggedIn ? 'flex' : 'none';
  if (nombreSpan) nombreSpan.textContent = loggedIn ? (usuarioActual.nombre_usuario || '') : '';

  // Mensajes + datos
  const info = document.getElementById('info-ejemplares');
  if (info) info.textContent = loggedIn ? 'Tus ejemplares:' : 'Inicia sesión para ver tu biblioteca.';

  if (loggedIn) {
    if (usuarioActual.id) cargarEjemplares(usuarioActual.id);
    cargarLecturasAbiertas();
    cargarPrestamosActivos();
    return;
  }

  // Limpieza UI cuando no hay sesión
  const tbodyEj = document.querySelector('#tabla-ejemplares tbody');
  if (tbodyEj) tbodyEj.innerHTML = '';

  const tbodyL = document.querySelector('#tabla-lecturas-abiertas tbody');
  const tbodyP = document.querySelector('#tabla-prestamos-activos tbody');
  if (tbodyL) tbodyL.innerHTML = '';
  if (tbodyP) tbodyP.innerHTML = '';

  const infoL = document.getElementById('info-lecturas-abiertas');
  const infoP = document.getElementById('info-prestamos-activos');
  if (infoL) infoL.textContent = 'Inicia sesión para ver tus lecturas en curso.';
  if (infoP) infoP.textContent = 'Inicia sesión para ver tus préstamos activos.';
}

// ---------- Login / Logout ----------
async function hacerLogin() {
  const usuarioInput = document.getElementById('login-usuario');
  const passInput = document.getElementById('login-contrasena');
  const mensaje = document.getElementById('login-mensaje');

  const nombre_usuario = usuarioInput.value.trim();
  const contrasena = passInput.value.trim();

  if (!nombre_usuario || !contrasena) {
    if (mensaje) mensaje.textContent = 'Introduce usuario y contraseña';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_usuario, contrasena })
    });

    const data = await res.json();
    if (!res.ok) {
      if (mensaje) mensaje.textContent = data.error || 'Error en el login';
      return;
    }

    token = data.token || data.access_token || data.jwt || null;
    usuarioActual = data.usuario || data.user || null;

    try {
      // Guarda el token REAL (puede venir como token/access_token/jwt)
      localStorage.setItem(TOKEN_KEY, token || '');
      // Guarda el usuario REAL (puede venir como usuario/user)
      localStorage.setItem(USER_KEY, JSON.stringify(usuarioActual || {}));
    } catch {}

    if (mensaje) mensaje.textContent = 'Login correcto ✅';
    usuarioInput.value = '';
    passInput.value = '';

    actualizarUIAutenticacion();
    setUserStatusOk('Sesión iniciada');
  } catch (err) {
    console.error(err);
    if (mensaje) mensaje.textContent = 'Error de red en el login';
  }
}

function hacerLogout() {
  token = null;
  usuarioActual = null;

  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {}

  actualizarUIAutenticacion();
  setUserStatus('Sesión cerrada');
  const mensaje = document.getElementById('login-mensaje');
  if (mensaje) mensaje.textContent = 'Sesión cerrada';
}

// ---------- Modal ----------
function abrirModalFicha() {
  const modal = document.getElementById('modal-ficha');
  if (!modal) return;
  modal.classList.add('is-visible');
}

async function cerrarModalFicha() {
  const modal = document.getElementById('modal-ficha');
  if (!modal) return;
  modal.classList.remove('is-visible');
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
      icon.textContent = sortEjemplares.dir === 'asc' ? '▲' : '▼';
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
      else errores++;
    } catch {
      errores++;
    }
  }

  setUserStatusOk(`Importación terminada: ${creados} creados, ${errores} errores`);
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

  for (const e of filtrados) {
    const tr = document.createElement('tr');
    tr.dataset.libroId = e.libro_id;
    tr.dataset.ejemplarId = e.ejemplar_id;
    tr.dataset.creadoEn = e.creado_en || '';

    tr.innerHTML = `
      <td>
        ${
          e.url_portada
            ? `<img src="${urlPortadaAbsoluta(e.url_portada)}?t=${Date.now()}" alt="Portada" class="portada-mini-img" />`
            : `<div class="portada-placeholder-mini" aria-hidden="true">
  <span class="ph-logo">Pdl</span>
</div>`
        }
      </td>
      <td class="cell-title">
  <div class="title-main">${e.titulo || ''}</div>
  <div class="title-meta">
    <span class="meta-item">ISBN: ${e.isbn || '—'}</span>
    <span class="meta-dot">·</span>
    <span class="meta-item">${e.estado || '—'}</span>
    <span class="meta-dot">·</span>
    <span class="meta-item">${e.ubicacion || '—'}</span>
    ${e.notas ? `<span class="meta-dot">·</span><span class="meta-item">${e.notas}</span>` : ''}
  </div>
</td>

<td class="cell-author">${e.autores || ''}</td>

      <td>${e.isbn || ''}</td>
      <td>${e.estado || ''}</td>
      <td>${e.ubicacion || ''}</td>
      <td>${e.notas || ''}</td>
      <td class="celda-acciones">
        <button class="icon-btn btn-leer" title="Empezar / ver lectura"
          data-libro-id="${e.libro_id}" data-ejemplar-id="${e.ejemplar_id}" type="button">
          <span class="icon-circle icon-read">▶</span>
        </button>
        <button class="icon-btn btn-prestar" title="Registrar préstamo"
          data-libro-id="${e.libro_id}" data-ejemplar-id="${e.ejemplar_id}" type="button">
          <span class="icon-circle icon-loan">⇄</span>
        </button>
        <button class="icon-btn btn-eliminar" title="Eliminar ejemplar"
          data-ejemplar-id="${e.ejemplar_id}" type="button">
          <span class="icon-circle icon-delete">✕</span>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }
    // ✅ PRO MAX: también pinta la lista móvil (con los mismos filtrados/orden)
  renderEjemplaresMobileList(filtrados);
  renderEjemplaresGrid(filtrados);

}
function renderEjemplaresMobileList(filtrados){
  const list = document.getElementById('ejemplares-list');
  if (!list) return;

  const isMobile = window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
  if (!isMobile) { list.innerHTML = ''; return; }

  list.innerHTML = (filtrados || []).map(e => {
    const portada = e.url_portada ? `${urlPortadaAbsoluta(e.url_portada)}?t=${Date.now()}` : '';
    const notas = (e.notas || '').trim();

    return `
      <div class="ej-card" data-libro-id="${e.libro_id}" data-ejemplar-id="${e.ejemplar_id}">
        ${portada
          ? `<img class="ej-cover" src="${portada}" alt="Portada" />`
          : `<div class="portada-placeholder-mini" aria-hidden="true">
  <span class="ph-logo">Pdl</span>
</div>`
        }

        <div class="ej-main">
          <div class="ej-title">${escapeHtml(e.titulo || '—')}</div>
          <div class="ej-author">${escapeHtml(e.autores || '—')}</div>

          <div class="ej-meta">
            <span class="ej-pill">ISBN: ${escapeHtml(e.isbn || '—')}</span>
            <span class="ej-pill">${escapeHtml(e.estado || '—')}</span>
            <span class="ej-pill">${escapeHtml(e.ubicacion || '—')}</span>
            ${notas ? `<span class="ej-pill">${escapeHtml(notas)}</span>` : ''}
          </div>
        </div>

        <div class="ej-actions">
          <button class="icon-btn m-read" type="button" title="Lectura"><span class="icon-circle">▶</span></button>
          <button class="icon-btn m-loan" type="button" title="Préstamo"><span class="icon-circle">⇄</span></button>
          <button class="icon-btn m-del" type="button" title="Borrar"><span class="icon-circle">✕</span></button>
        </div>
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
    const ejemplares = await res.json();

    if (!Array.isArray(ejemplares) || ejemplares.length === 0) {
      if (info) info.textContent = 'No tienes ejemplares todavía.';
      ejemplaresCache = [];
      renderEjemplares();
      return;
    }

    if (info) info.textContent = `Total ejemplares: ${ejemplares.length}`;
    ejemplaresCache = ejemplares;
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
async function crearEjemplar() {
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
  console.log('TOKEN?', token);
  console.log('HEADERS', getHeaders());
  try {
    const res = await fetch(`${API_BASE}/api/ejemplares`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        isbn,
        estado: 'propio',
        ubicacion: ubicacion || null,
        notas: notas || null,
      }),
    });

    const data = await res.json();
    if (res.status === 401) {
      setUserStatusErr('El servidor ha respondido 401 (no autorizado). Probablemente el token haya caducado; vuelve a iniciar sesión.');
      return;
    }
    if (!res.ok) {
      setUserStatusErr(data.error || 'Error creando ejemplar.');
      return;
    }

    setUserStatusOk('Ejemplar creado.');
    const isbnEl = document.getElementById('isbn');
    if (isbnEl) isbnEl.value = '';

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

// ---------- Lecturas (modal) ----------
async function empezarLectura(libroId, ejemplarId) {
  setUserStatus('');

  if (!token || !usuarioActual) {
    setUserStatusErr('Debes iniciar sesión para registrar lecturas.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/lecturas`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        usuario_id: usuarioActual.id,
        libro_id: Number(libroId),
        ejemplar_id: Number(ejemplarId),
        estado: 'leyendo',
        pagina_actual: null,
        notas: null,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setUserStatusErr(data.error || 'Error al empezar la lectura.');
      return;
    }

    setUserStatusOk('Lectura iniciada.');
    await cargarLecturas(libroId);
    await refrescarHome();
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al empezar la lectura.');
  }
}

async function cargarLecturas(libroId) {
  const info = document.getElementById('info-lecturas');
  const pre = document.getElementById('lecturas-detalle');

  if (info) info.textContent = 'Cargando lecturas...';
  if (pre) pre.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroId}/lecturas`, {
      headers: getHeaders(false),
    });
    const lecturas = await res.json();

    if (!res.ok) {
      if (info) info.textContent = lecturas.error || 'Error al cargar lecturas.';
      return;
    }

    if (!Array.isArray(lecturas) || lecturas.length === 0) {
      if (info) info.textContent = 'Este libro no tiene lecturas registradas.';
      return;
    }

    if (info) info.textContent = `Lecturas: ${lecturas.length}`;

    // Formato “fila” dentro del <pre> (compacto + resalta activas)
    const lineas = lecturas.map((l) => {
      const esActiva = l.estado !== 'terminado';
      const mia = esActiva && usuarioActual && l.usuario_id === usuarioActual.id;

      const inicio = l.inicio ? new Date(l.inicio).toLocaleDateString('es-ES') : '—';
      const fin = l.fin ? new Date(l.fin).toLocaleDateString('es-ES') : '—';
      const pag = (l.pagina_actual ?? '—');

      const badge = mia ? '🟢' : (esActiva ? '🟡' : '⚪');
      const user = l.nombre_usuario || `Usuario ${l.usuario_id}`;
      return `${badge} ${user} · ${l.estado || '—'} · pág ${pag} · ${inicio} → ${fin}`;
    });

    if (pre) pre.textContent = lineas.join('\n');
  } catch (err) {
    console.error(err);
    if (info) info.textContent = 'Error al cargar lecturas.';
  }
}
async function actualizarPaginaLectura(lecturaId, pagina_actual) {
  if (!token) throw new Error('Sin sesión');

  const res = await fetch(`${API_BASE}/api/lecturas/${lecturaId}/pagina`, {
    method: 'PATCH',
    headers: getHeaders(true),
    body: JSON.stringify({ pagina_actual }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error guardando página (HTTP ${res.status})`);
  }

  setUserStatusOk('Página guardada');
  return data;
}

async function terminarLecturaActual() {
  if (!token || !usuarioActual) {
    setUserStatusErr('Debes iniciar sesión para terminar una lectura.');
    return;
  }
  if (!libroSeleccionadoId) {
    setUserStatusErr('Selecciona un ejemplar/libro primero.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroSeleccionadoId}/lecturas`, {
      headers: getHeaders(false),
    });
    const lecturas = await res.json();

    if (!res.ok) {
      setUserStatusErr(lecturas.error || 'Error cargando lecturas.');
      return;
    }

    const lecturaActiva = Array.isArray(lecturas)
      ? lecturas.find((l) => l.usuario_id === usuarioActual.id && l.estado !== 'terminado')
      : null;

    if (!lecturaActiva) {
      setUserStatusErr('No tienes ninguna lectura activa para este libro.');
      return;
    }

    const paginaStr = prompt('Última página leída (opcional):');
    const valoracionStr = prompt('Valoración (1-5, opcional):');
    const notas = prompt('Notas sobre la lectura (opcional):') || null;

    let pagina_actual = paginaStr ? Number(paginaStr) : null;
    if (Number.isNaN(pagina_actual)) pagina_actual = null;

    let valoracion = valoracionStr ? Number(valoracionStr) : null;
    if (Number.isNaN(valoracion)) valoracion = null;

    const resFin = await fetch(`${API_BASE}/api/lecturas/${lecturaActiva.id}/finalizar`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ pagina_actual, valoracion, notas }),
    });

    const dataFin = await resFin.json();
    if (!resFin.ok) {
      setUserStatusErr(dataFin.error || 'Error al finalizar lectura.');
      return;
    }

    setUserStatusOk('Lectura terminada.');
    await cargarLecturas(libroSeleccionadoId);
    await refrescarHome();
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al terminar la lectura.');
  }
}

// ---------- Resumen global lecturas / préstamos ----------
async function cargarLecturasAbiertas() {
  const info = document.getElementById('info-lecturas-abiertas');
  const tbody = document.querySelector('#tabla-lecturas-abiertas tbody');
  if (!info || !tbody) return;

  if (!usuarioActual) {
    info.textContent = 'Inicia sesión para ver tus lecturas en curso.';
    tbody.innerHTML = '';
    return;
  }

  info.textContent = 'Cargando lecturas en curso...';
  tbody.innerHTML = '';

  try {
    const res = await fetch(`${API_BASE}/api/usuarios/${usuarioActual.id}/lecturas-abiertas`, {
      headers: getHeaders(false),
    });
    const lecturas = await res.json();

    if (!Array.isArray(lecturas) || lecturas.length === 0) {
      info.textContent = 'No tienes lecturas en curso.';
      return;
    }

    info.textContent = `Lecturas en curso: ${lecturas.length}`;
    for (const l of lecturas) {
      const tr = document.createElement('tr');
      tr.classList.add('row-link');
      tr.dataset.libroId = l.libro_id;
      if (l.ejemplar_id) tr.dataset.ejemplarId = l.ejemplar_id;
      tr.dataset.lecturaId = l.id;                      // 👈 ID de la lectura
      tr.dataset.paginaActual = (l.pagina_actual ?? ''); // 👈 para prellenar modal
      const fecha = l.inicio ? new Date(l.inicio).toLocaleDateString('es-ES') : '—';
      tr.innerHTML = `
  <td>${l.titulo || 'Sin título'}</td>
  <td class="cell-pagina">${l.pagina_actual ?? '—'}</td>
  <td>${fecha}</td>
`;
      tbody.appendChild(tr);
    }
  } catch (err) {
    console.error(err);
    info.textContent = 'Error al cargar las lecturas en curso.';
  }
}

async function cargarPrestamosActivos() {
  const info = document.getElementById('info-prestamos-activos');
  const tbody = document.querySelector('#tabla-prestamos-activos tbody');
  if (!info || !tbody) return;

  if (!usuarioActual) {
    info.textContent = 'Inicia sesión para ver tus préstamos activos.';
    tbody.innerHTML = '';
    return;
  }

  info.textContent = 'Cargando préstamos activos...';
  tbody.innerHTML = '';

  try {
    const res = await fetch(`${API_BASE}/api/usuarios/${usuarioActual.id}/prestamos-activos`, {
      headers: getHeaders(false),
    });
    const prestamos = await res.json();

    if (!Array.isArray(prestamos) || prestamos.length === 0) {
      info.textContent = 'No tienes préstamos activos.';
      return;
    }
    info.textContent = `Préstamos: ${prestamos.length}`;
    for (const p of prestamos) {
      const tr = document.createElement('tr');
      tr.classList.add('row-link');
      tr.dataset.libroId = p.libro_id;
      if (p.ejemplar_id) tr.dataset.ejemplarId = p.ejemplar_id;

      const nombreReceptor = p.nombre_receptor_usuario || p.nombre_receptor || '—';
      const fechaLimite = p.fecha_limite ? new Date(p.fecha_limite).toLocaleDateString('es-ES') : '—';

      tr.innerHTML = `
        <td>${p.titulo || 'Sin título'}</td>
        <td>${nombreReceptor}</td>
        <td>${fechaLimite}</td>
      `;
      tbody.appendChild(tr);
    }
  } catch (err) {
    console.error(err);
    info.textContent = 'Error al cargar los préstamos activos.';
  }
}
function crearUIMarcapagina() {
  if (document.getElementById('mp-overlay')) return;

  const div = document.createElement('div');
  div.id = 'mp-overlay';
  div.className = 'mp-overlay';
  div.style.display = 'none';

  div.innerHTML = `
    <div class="mp-backdrop" data-close="1"></div>
    <div class="mp-dialog" role="dialog" aria-modal="true" aria-label="Marcapáginas">
      <div class="mp-header">
        <h3>Marcapáginas</h3>
        <button class="icon-btn" type="button" id="mp-close" title="Cerrar" aria-label="Cerrar">
          <span class="icon-circle">✕</span>
        </button>
      </div>

      <div class="mp-body">
        <label for="mp-num">Página actual</label>

        <div class="mp-row">
          <button class="btn btn-ghost mp-step" type="button" data-step="-5">-5</button>
          <button class="btn btn-ghost mp-step" type="button" data-step="-1">-1</button>

          <input id="mp-num" type="number" min="0" step="1" inputmode="numeric" />

          <button class="btn btn-ghost mp-step" type="button" data-step="1">+1</button>
          <button class="btn btn-ghost mp-step" type="button" data-step="5">+5</button>
        </div>

        <input id="mp-range" class="mp-range" type="range" min="0" max="600" step="1" />

        <p class="helper-text mp-help">Puedes escribir el número o ajustarlo con la rueda.</p>
      </div>

      <div class="mp-actions">
        <button class="btn btn-ghost" type="button" id="mp-skip">Omitir</button>
        <button class="btn btn-secondary" type="button" id="mp-save">Guardar</button>
      </div>
    </div>
  `;

  document.body.appendChild(div);

  // cerrar: X / backdrop / ESC
  div.addEventListener('click', (e) => {
    if (e.target?.dataset?.close === '1') cerrarUIMarcapagina('skip');
  });
  document.getElementById('mp-close')?.addEventListener('click', () => cerrarUIMarcapagina('skip'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarUIMarcapagina('skip'); });

  // pasos +/- y sincronía input <-> range
  div.addEventListener('click', (e) => {
    const btn = e.target.closest('.mp-step');
    if (!btn) return;
    const step = Number(btn.dataset.step || 0);

    const num = document.getElementById('mp-num');
    const range = document.getElementById('mp-range');
    const v = Math.max(0, Number(num.value || 0) + step);
    num.value = String(v);
    range.value = String(v);
  });

  document.getElementById('mp-num')?.addEventListener('input', (e) => {
    const range = document.getElementById('mp-range');
    const v = Math.max(0, Number(e.target.value || 0));
  
    // ✅ si el usuario pone 1200, el slider se adapta
    if (v > Number(range.max)) range.max = String(Math.ceil(v / 50) * 50);
  
    range.value = String(v);
  });
  

  document.getElementById('mp-range')?.addEventListener('input', (e) => {
    const num = document.getElementById('mp-num');
    num.value = String(e.target.value || 0);
  });
}

let mpCtx = null;

function abrirUIMarcapagina(ctx) {
  crearUIMarcapagina();
  mpCtx = ctx;

  const overlay = document.getElementById('mp-overlay');
  const num = document.getElementById('mp-num');
  const range = document.getElementById('mp-range');

  const inicial = (ctx?.paginaInicial ?? 0);
  num.value = String(inicial);
  range.value = String(inicial);

  // bind botones (cada apertura)
  document.getElementById('mp-save').onclick = async () => {
    const v = num.value === '' ? null : Math.max(0, Number(num.value));
    cerrarUIMarcapagina('save', v);
  };
  document.getElementById('mp-skip').onclick = () => cerrarUIMarcapagina('skip');

  overlay.style.display = 'flex';
  document.documentElement.style.overflow = 'hidden';
  num.focus();
  num.select?.();
}

function cerrarUIMarcapagina(action, value) {
  const overlay = document.getElementById('mp-overlay');
  if (!overlay) return;

  overlay.style.display = 'none';
  document.documentElement.style.overflow = '';

  const ctx = mpCtx;
  mpCtx = null;

  if (!ctx) return;

  if (action === 'save' && typeof ctx.onSave === 'function') ctx.onSave(value);
  if (action !== 'save' && typeof ctx.onSkip === 'function') ctx.onSkip();
}

// ---------- Préstamos UI ----------
let prestamoKeyHandler = null;

function crearUIPrestamo() {
  if (document.getElementById('prestamo-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'prestamo-overlay';
  overlay.className = 'prestamo-overlay';
  overlay.style.display = 'none';

  overlay.innerHTML = `
    <div class="prestamo-dialog" role="dialog" aria-modal="true" aria-label="Nuevo préstamo">
      <h3>Nuevo préstamo</h3>

      <div class="form-group">
        <label for="prestamo-receptor-select">Receptor (usuario de la app)</label>
        <select id="prestamo-receptor-select">
          <option value="">— Persona externa —</option>
        </select>
        <p class="helper-text">
          Elige un usuario de la app o deja "Persona externa" para escribir un nombre.
        </p>
      </div>

      <div class="form-group">
        <label for="prestamo-receptor-nombre">Nombre receptor (si es externo)</label>
        <input id="prestamo-receptor-nombre" type="text" placeholder="Ej: Mi madre, Carlos..." />
      </div>

      <div class="form-group">
        <label for="prestamo-fecha-limite">Fecha límite de devolución</label>
        <input id="prestamo-fecha-limite" type="date" />
      </div>

      <div class="form-group">
        <label for="prestamo-notas">Notas</label>
        <input id="prestamo-notas" type="text" placeholder="Opcional" />
      </div>

      <div class="prestamo-dialog-buttons">
        <button id="prestamo-cancelar" class="btn btn-ghost btn-sm" type="button">Cancelar</button>
        <button id="prestamo-confirmar" class="btn btn-secondary btn-sm" type="button">Crear préstamo</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Cerrar con botón cancelar
  document.getElementById('prestamo-cancelar')?.addEventListener('click', cerrarUIPrestamo);
  document.getElementById('prestamo-confirmar')?.addEventListener('click', confirmarPrestamoDesdeUI);

  // ✅ Cerrar al click fuera (solo si pinchas el overlay, no el diálogo)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrarUIPrestamo();
  });
}

function abrirUIPrestamo() {
  const overlay = document.getElementById('prestamo-overlay');
  if (!overlay) return;

  overlay.style.display = 'flex';
  document.documentElement.style.overflow = 'hidden'; // ✅ bloquea scroll fondo

  // Reset campos
  document.getElementById('prestamo-receptor-select').value = '';
  document.getElementById('prestamo-receptor-nombre').value = '';
  document.getElementById('prestamo-fecha-limite').value = '';
  document.getElementById('prestamo-notas').value = '';

  // ✅ ESC para cerrar
  prestamoKeyHandler = (e) => {
    if (e.key === 'Escape') cerrarUIPrestamo();
  };
  document.addEventListener('keydown', prestamoKeyHandler);

  // Foco al primer control
  setTimeout(() => {
    document.getElementById('prestamo-receptor-select')?.focus();
  }, 0);
}

function cerrarUIPrestamo() {
  const overlay = document.getElementById('prestamo-overlay');
  if (!overlay) return;

  overlay.style.display = 'none';
  document.documentElement.style.overflow = ''; // ✅ recupera scroll

  if (prestamoKeyHandler) {
    document.removeEventListener('keydown', prestamoKeyHandler);
    prestamoKeyHandler = null;
  }

  prestamoContexto = null;
}

async function cargarUsuariosParaPrestamo() {
  if (usuariosPrestamo.length > 0) {
    rellenarSelectPrestamo();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/usuarios`, { headers: getHeaders(false) });
    const data = await res.json();
    usuariosPrestamo = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error cargando usuarios para préstamo', err);
    usuariosPrestamo = [];
  }

  rellenarSelectPrestamo();
}

function rellenarSelectPrestamo() {
  const select = document.getElementById('prestamo-receptor-select');
  if (!select) return;
  select.innerHTML = '<option value="">— Persona externa —</option>';

  for (const u of usuariosPrestamo) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.nombre_usuario;
    select.appendChild(opt);
  }
}

async function crearPrestamo(libroId, ejemplarId) {
  if (!token || !usuarioActual) {
    setUserStatusErr('Debes iniciar sesión para prestar libros.');
    return;
  }

  prestamoContexto = { libroId: Number(libroId), ejemplarId: Number(ejemplarId) };
  crearUIPrestamo();
  await cargarUsuariosParaPrestamo();
  abrirUIPrestamo();
}

async function confirmarPrestamoDesdeUI() {
  if (!prestamoContexto || !usuarioActual || !token) {
    cerrarUIPrestamo();
    setUserStatusErr('No hay contexto de préstamo válido.');
    return;
  }

  // ✅ Guardar contexto ANTES de cerrar (porque cerrarUIPrestamo lo borra)
  const libroId = Number(prestamoContexto.libroId);
  const ejemplarId = Number(prestamoContexto.ejemplarId);

  const select = document.getElementById('prestamo-receptor-select');
  const inputNombre = document.getElementById('prestamo-receptor-nombre');
  const inputFecha = document.getElementById('prestamo-fecha-limite');
  const inputNotas = document.getElementById('prestamo-notas');

  let usuarioReceptorId = select.value ? Number(select.value) : null;
  let nombreReceptor = inputNombre.value.trim() || null;

  if (usuarioReceptorId) nombreReceptor = null;
  else if (!nombreReceptor) {
    alert('Introduce un nombre para la persona externa.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/prestamos`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        ejemplar_id: ejemplarId,
        usuario_prestador_id: usuarioActual.id,
        usuario_receptor_id: usuarioReceptorId || null,
        nombre_receptor: nombreReceptor || null,
        fecha_limite: inputFecha.value || null,
        notas: inputNotas.value.trim() || null
      })
    });

    const data = await res.json();
    if (!res.ok) {
      setUserStatusErr(data.error || 'Error al crear el préstamo.');
      return;
    }

    cerrarUIPrestamo();
    setUserStatusOk('Préstamo creado.');

    // ✅ refrescar “principal” (widgets) + detalle de préstamos del libro
    await cargarPrestamos(libroId);
    await refrescarHome();

    // (opcional, por si el backend cambia estado del ejemplar al prestar)
    // await cargarEjemplares(usuarioActual.id);
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al crear el préstamo.');
  }
}


// ---------- Préstamos (modal) ----------
async function cargarPrestamos(libroId) {
  const info = document.getElementById('info-prestamos');
  const pre = document.getElementById('prestamos-detalle');
  if (!info || !pre) return;

  info.textContent = 'Cargando préstamos...';
  pre.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroId}/prestamos`, {
      headers: getHeaders(false),
    });
    const prestamos = await res.json();

    if (!res.ok) {
      info.textContent = prestamos.error || 'Error al cargar los préstamos.';
      return;
    }

    if (!Array.isArray(prestamos) || prestamos.length === 0) {
      info.textContent = 'Este libro no tiene préstamos registrados.';
      return;
    }

    info.textContent = `Préstamos: ${prestamos.length}`;

    const lineas = prestamos.map((p) => {
      const activo = p.estado !== 'devuelto' && !p.fecha_devolucion;
      const badge = activo ? '🟡' : '⚪';

      const receptor = p.nombre_receptor_usuario || p.nombre_receptor || '—';
      const prestado = p.fecha_prestamo ? new Date(p.fecha_prestamo).toLocaleDateString('es-ES') : '—';
      const limite = p.fecha_limite ? new Date(p.fecha_limite).toLocaleDateString('es-ES') : '—';
      const dev = p.fecha_devolucion ? new Date(p.fecha_devolucion).toLocaleDateString('es-ES') : '—';

      return `${badge} #${p.id} · a ${receptor} · ${p.estado || '—'} · ${prestado} → ${limite} · dev: ${dev}`;
    });

    pre.textContent = lineas.join('\n');
  } catch (err) {
    console.error(err);
    info.textContent = 'Error al cargar los préstamos.';
  }
}

async function marcarPrestamoDevuelto(prestamoId, libroId) {
  const notas = prompt('Notas sobre la devolución (opcional):') || null;

  try {
    const res = await fetch(`${API_BASE}/api/prestamos/${prestamoId}/devolver`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ notas }),
    });

    const data = await res.json();
    if (!res.ok) {
      setUserStatusErr(data.error || 'Error al marcar como devuelto.');
      return;
    }

    setUserStatusOk('Préstamo devuelto.');
    await cargarPrestamos(libroId);
    await refrescarHome();
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al actualizar el préstamo.');
  }
}

async function marcarPrestamoDevueltoGlobal() {
  if (!token || !usuarioActual) {
    setUserStatusErr('Debes iniciar sesión para actualizar préstamos.');
    return;
  }
  if (!libroSeleccionadoId) {
    setUserStatusErr('Selecciona primero un libro.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroSeleccionadoId}/prestamos`, {
      headers: getHeaders(false),
    });
    const prestamos = await res.json();

    if (!res.ok) {
      setUserStatusErr(prestamos.error || 'Error cargando préstamos.');
      return;
    }

    const prestamoActivo = Array.isArray(prestamos)
      ? prestamos.find((p) => p.estado !== 'devuelto' && p.usuario_prestador_id === usuarioActual.id)
      : null;

    if (!prestamoActivo) {
      setUserStatusErr('No tienes ningún préstamo activo para este libro.');
      return;
    }

    const confirmar = confirm(`¿Marcar como devuelto el préstamo #${prestamoActivo.id}?`);
    if (!confirmar) return;

    await marcarPrestamoDevuelto(prestamoActivo.id, libroSeleccionadoId);
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al marcar préstamo como devuelto.');
  }
}
// ---------- Escáner (REHECHO desde cero) ----------
const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = ZXing;

let scanLocked = false;

const STABLE_FRAMES = 2; // pide 2 lecturas iguales seguidas para aceptar

function isLikelyISBN(code) {
  const v = String(code || "").trim();
  // EAN-13 numérico (muchos ISBN vienen como 978/979...)
  return /^\d{13}$/.test(v);
}

async function pickBackCameraDeviceId() {
  if (!navigator.mediaDevices?.enumerateDevices) return null;

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter(d => d.kind === "videoinput");
  if (!cams.length) return null;

  // si hay labels (normalmente tras aceptar permisos), intenta detectar trasera
  const byLabel = cams.find(d => /back|rear|environment|trasera/i.test(d.label || ""));
  if (byLabel) return byLabel.deviceId;

  // fallback típico: última cámara suele ser trasera en muchos móviles
  return cams[cams.length - 1].deviceId;
}

async function aplicarMejorasDeCamara(stream) {
  try {
    const track = stream.getVideoTracks?.()[0];
    if (!track) return;

    const caps = track.getCapabilities?.() || {};

    // autofocus continuo si existe
    const adv = [];
    if (caps.focusMode?.includes?.("continuous")) adv.push({ focusMode: "continuous" });

    // torch si existe (opcional; en algunos móviles ayuda MUCHO)
    if (caps.torch) adv.push({ torch: true });

    if (adv.length) {
      await track.applyConstraints({ advanced: adv });
    }
  } catch {
    // silencioso: no todos los navegadores soportan esto
  }
}
function extraerISBN(texto) {
  const digits = String(texto || "").replace(/\D/g, ""); // solo números
  // Busca un EAN-13 típico de ISBN: empieza por 978 o 979
  for (let i = 0; i <= digits.length - 13; i++) {
    const cand = digits.slice(i, i + 13);
    if (cand.startsWith("978") || cand.startsWith("979")) return cand;
  }
  // fallback: si solo hay 13 dígitos y no empieza 978/979, igual te sirve
  if (digits.length === 13) return digits;
  return null;
}

function resetStability() {
  scanLocked = false;
  lastScanValue = null;
  lastScanCount = 0;
}
let bd = null;
let bdRunning = false;

async function iniciarEscaneo() {
  const scannerDiv = document.getElementById("scanner");
  const video = document.getElementById("video");
  const textEl = document.querySelector("#scanner .scanner-text");

  if (!scannerDiv || !video) return;

  if (!window.isSecureContext) {
    setUserStatusErr(`La cámara requiere HTTPS (o localhost). Estás en: ${window.location.origin}`);
    return;
  }

  if (scannerRunning) return;
  scannerRunning = true;

  detenerEscaneo({ keepButtonState: true, keepScannerRunning: true });
  scannerDiv.style.display = "block";
  setScanButtonState(true);
  if (textEl) textEl.textContent = "Apunta al código de barras…";

  try {
    // 1) Abre cámara con constraints “para cerca”
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });
    currentStream = stream;
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    await video.play().catch(()=>{});

    // 2) Intenta autofocus/torch si existe
    await aplicarMejorasDeCamara(stream);

    // 3) Motor nativo (Chrome): EAN-13
    if ("BarcodeDetector" in window) {
      const formats = await BarcodeDetector.getSupportedFormats();
      const wanted = ["ean_13", "ean_8", "upc_a", "code_128"];
      const use = wanted.filter(f => formats.includes(f));
      bd = new BarcodeDetector({ formats: use.length ? use : formats });

      bdRunning = true;
      detectarConBarcodeDetector(video, textEl);
      return;
    }

    // 4) Fallback: ZXing si no hay BarcodeDetector
    iniciarZXingFallback(video, textEl);

  } catch (e) {
    console.error(e);
    setUserStatusErr(`No se pudo iniciar la cámara: ${e?.name || "error"}`);
    detenerEscaneo({ keepButtonState: false });
    scannerRunning = false;
  }
}

async function detectarConBarcodeDetector(video, textEl) {
  if (!bdRunning) return;

  try {
    const barcodes = await bd.detect(video);
    if (barcodes && barcodes.length) {
      const raw = barcodes[0].rawValue || "";
      if (textEl) textEl.textContent = `Detectado: ${raw}`;

      const isbn = extraerISBN(raw);
      if (isbn) {
        document.getElementById("isbn").value = isbn;
        setUserStatusOk(`ISBN detectado: ${isbn}`);
        bdRunning = false;
        detenerEscaneo({ keepButtonState: false });
        scannerRunning = false;
        return;
      }
    }
  } catch (e) {
    // silencioso
  }

  requestAnimationFrame(() => detectarConBarcodeDetector(video, textEl));
}

function iniciarZXingFallback(video, textEl) {
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.CODE_128
  ]);

  codeReader = new BrowserMultiFormatReader(hints);

  codeReader.decodeFromVideoElement(video, (result, err) => {
    if (!result?.text) return;
    const raw = String(result.text);
    if (textEl) textEl.textContent = `Detectado: ${raw}`;

    const isbn = extraerISBN(raw);
    if (!isbn) return;

    document.getElementById("isbn").value = isbn;
    setUserStatusOk(`ISBN detectado: ${isbn}`);
    detenerEscaneo({ keepButtonState: false });
    scannerRunning = false;
  });
}

function detenerEscaneo(opts = {}) {
  const { keepButtonState = false, keepScannerRunning = false } = opts;

  const scannerDiv = document.getElementById("scanner");
  const video = document.getElementById("video");

  resetStability();

  if (codeReader) {
    try { codeReader.reset(); } catch {}
    codeReader = null;
  }

  if (currentStream) {
    try { currentStream.getTracks().forEach(t => t.stop()); } catch {}
    currentStream = null;
  }

  if (video) {
    try { video.pause(); } catch {}
    video.srcObject = null;
  }

  if (scannerDiv) scannerDiv.style.display = "none";

  if (!keepButtonState) setScanButtonState(false);
  if (!keepScannerRunning) scannerRunning = false;
}

// ---------- Eliminar ejemplar ----------
async function eliminarEjemplar(ejemplarId) {
  if (!token || !usuarioActual) {
    setUserStatusErr('Debes iniciar sesión para eliminar ejemplares.');
    return;
  }

  const confirmar = confirm('¿Seguro que quieres eliminar este ejemplar?');
  if (!confirmar) return;

  try {
    const res = await fetch(`${API_BASE}/api/ejemplares/${ejemplarId}`, {
      method: 'DELETE',
      headers: getHeaders(false),
    });

    const data = await res.json();
    if (!res.ok) {
      setUserStatusErr(data.error || 'Error eliminando ejemplar.');
      return;
    }

    setUserStatusOk('Ejemplar eliminado.');
    await cargarEjemplares(usuarioActual.id);
    await refrescarHome();
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al eliminar ejemplar.');
  }
}

// ---------- Ficha (cargar + guardar) ----------
async function cargarFormEdicion() {
  const msg = document.getElementById('edit-mensaje');

  if (!libroSeleccionadoId || !ejemplarSeleccionadoId) {
    if (msg) msg.textContent = 'Selecciona un ejemplar para ver la ficha.';
    return;
  }
  if (msg) msg.textContent = '';

  try {
    const [resLibro, resEjemplar] = await Promise.all([
      fetch(`${API_BASE}/api/libros/${libroSeleccionadoId}`, { headers: getHeaders(false) }),
      fetch(`${API_BASE}/api/ejemplares/${ejemplarSeleccionadoId}`, { headers: getHeaders(false) }),
    ]);

    const libro = await resLibro.json();
    const ejemplar = await resEjemplar.json();

    if (!resLibro.ok) { if (msg) msg.textContent = libro.error || 'Error cargando libro.'; return; }
    if (!resEjemplar.ok) { if (msg) msg.textContent = ejemplar.error || 'Error cargando ejemplar.'; return; }

    // inputs libro
    document.getElementById('edit-libro-titulo').value = libro.titulo || '';
    document.getElementById('edit-libro-autores').value = libro.autores || '';
    document.getElementById('edit-libro-editorial').value = libro.editorial || '';
    document.getElementById('edit-libro-fecha').value = libro.fecha_publicacion || '';
    document.getElementById('edit-libro-paginas').value = libro.numero_paginas || '';
    document.getElementById('edit-libro-descripcion').value = libro.descripcion || '';

    // inputs ejemplar
    document.getElementById('edit-ejemplar-estado').value = ejemplar.estado || '';
    document.getElementById('edit-ejemplar-ubicacion').value = ejemplar.ubicacion || '';
    document.getElementById('edit-ejemplar-notas').value = ejemplar.notas || '';
    document.getElementById('edit-ejemplar-tipo').value = ejemplar.tipo || 'libro';

    // header modal
    const img = document.getElementById('ficha-portada-img');


const portada =
  libro.url_portada
  || ejemplar.url_portada
  || (ejemplaresCache || []).find(e => Number(e.libro_id) === Number(libroSeleccionadoId))?.url_portada
  || '';

  if (img) {
    const hasPortada = Boolean(portada);
  
    img.classList.toggle('is-placeholder', !hasPortada);
    img.src = hasPortada ? `${urlPortadaAbsoluta(portada)}?t=${Date.now()}` : '';
  
    img.onerror = () => {
      img.src = '';
      img.classList.add('is-placeholder');
    };
  }
    document.getElementById('ficha-titulo').textContent = libro.titulo || 'Sin título';
    document.getElementById('ficha-autores').textContent = libro.autores || 'Autor desconocido';
    document.getElementById('ficha-isbn').textContent = libro.isbn || '—';

    const creadoSpan = document.getElementById('ficha-creado-en');
    if (creadoSpan) {
      creadoSpan.textContent = ejemplar.creado_en
        ? new Date(ejemplar.creado_en).toLocaleString('es-ES')
        : '—';
    }
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = 'Error de red al cargar la ficha.';
  }
}

async function guardarLibroEditado() {
  const msg = document.getElementById('edit-mensaje');
  if (msg) msg.textContent = '';

  if (!token || !usuarioActual) { if (msg) msg.textContent = 'Debes iniciar sesión para editar libros.'; return; }
  if (!libroSeleccionadoId) { if (msg) msg.textContent = 'Selecciona un libro.'; return; }

  const titulo = document.getElementById('edit-libro-titulo').value.trim();
  const autores = document.getElementById('edit-libro-autores').value.trim();
  const editorial = document.getElementById('edit-libro-editorial').value.trim();
  const fecha_publicacion = document.getElementById('edit-libro-fecha').value.trim();
  const paginasStr = document.getElementById('edit-libro-paginas').value.trim();
  const descripcion = document.getElementById('edit-libro-descripcion').value.trim();

  const numero_paginas = paginasStr ? Number(paginasStr) : null;

  const res = await fetch(`${API_BASE}/api/libros/${libroSeleccionadoId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({
      titulo: titulo || null,
      autores: autores || null,
      editorial: editorial || null,
      fecha_publicacion: fecha_publicacion || null,
      numero_paginas: Number.isNaN(numero_paginas) ? null : numero_paginas,
      descripcion: descripcion || null,
    }),
  });

  const data = await res.json();
  if (!res.ok) { if (msg) msg.textContent = data.error || 'Error guardando libro.'; return; }

  if (msg) msg.textContent = 'Libro guardado ✅';
  if (usuarioActual?.id) await cargarEjemplares(usuarioActual.id);
  await cargarFormEdicion();   // ✅ refresca inputs + header del modal
}

async function guardarEjemplarEditado() {
  const msg = document.getElementById('edit-mensaje');
  if (msg) msg.textContent = '';

  if (!token || !usuarioActual) {
    if (msg) msg.textContent = 'Debes iniciar sesión para editar ejemplares.';
    return;
  }
  if (!ejemplarSeleccionadoId) {
    if (msg) msg.textContent = 'Selecciona un ejemplar.';
    return;
  }

  const estado = document.getElementById('edit-ejemplar-estado').value.trim();
  const ubicacion = document.getElementById('edit-ejemplar-ubicacion').value.trim();
  const notas = document.getElementById('edit-ejemplar-notas').value.trim();
  const tipo = document.getElementById('edit-ejemplar-tipo').value;

  try {
    const res = await fetch(`${API_BASE}/api/ejemplares/${ejemplarSeleccionadoId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({
        estado: estado || null,
        ubicacion: ubicacion || null,
        notas: notas || null,
        tipo: tipo || 'libro',      
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      if (msg) msg.textContent = data.error || 'Error guardando ejemplar.';
      return;
    }

    if (msg) msg.textContent = 'Ejemplar guardado ✅';
    if (usuarioActual?.id) await cargarEjemplares(usuarioActual.id);
    await cargarFormEdicion();   // ✅ para que el tipo/estado/notas y header se actualicen
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = 'Error de red al guardar ejemplar.';
  }
}

// ---------- Subir portada ----------
async function subirPortadaArchivo(file) {
  if (!libroSeleccionadoId || !file) return;

  setModalMsg('Subiendo portada...');

  const formData = new FormData();
  formData.append('portada', file);

  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroSeleccionadoId}/portada`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const contentType = res.headers.get('content-type') || '';
      let data = null;
      let raw = '';

      if (contentType.includes('application/json')) {
        data = await res.json().catch(() => null);
      } else {
        raw = await res.text().catch(() => '');
      }

      if (!res.ok) {
        const msg = (data && data.error) ? data.error : `Error ${res.status}: ${raw.slice(0, 120)}`;
        setModalMsg(msg);
        return;
      }
    setModalMsg('Portada actualizada ✅');

    const img = document.getElementById('ficha-portada-img');
    if (img && data.url_portada) img.src = `${urlPortadaAbsoluta(data.url_portada)}?t=${Date.now()}`;

    const portadaInput = document.getElementById('edit-libro-portada');
    if (portadaInput && data.url_portada) portadaInput.value = data.url_portada;

    if (usuarioActual?.id) await cargarEjemplares(usuarioActual.id);
  } catch (err) {
    console.error(err);
    setModalMsg('Error de red al subir la portada.');
  }
}

// ---------- Mostrar ficha (refresca siempre) ----------
let fichaReqId = 0;

async function mostrarFicha(libroId, ejemplarId) {
  const reqId = ++fichaReqId;

  libroSeleccionadoId = Number(libroId);
  ejemplarSeleccionadoId = ejemplarId ? Number(ejemplarId) : null;

  // reset visual
  const t = document.getElementById('ficha-titulo');
  if (t) t.textContent = 'Cargando…';
  const pre = document.getElementById('lecturas-detalle');
  if (pre) pre.textContent = '';
  const preP = document.getElementById('prestamos-detalle');
  if (preP) preP.textContent = '';

  await cargarFormEdicion();
  if (reqId !== fichaReqId) return;

  await Promise.all([cargarLecturas(libroSeleccionadoId), cargarPrestamos(libroSeleccionadoId)]);
  if (reqId !== fichaReqId) return;

  abrirModalFicha();
}
// compartir deseos
async function compartirLista(tipo) {
  if (!token || !usuarioActual?.id) {
    alert('Debes iniciar sesión para compartir.');
    return;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}/api/share`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ tipo })
    });
  } catch (e) {
    console.error(e);
    alert('Error de red (no se pudo conectar con el servidor).');
    return;
  }

  const contentType = res.headers.get('content-type') || '';
  let payload = null;
  let raw = '';

  if (contentType.includes('application/json')) {
    payload = await res.json().catch(() => null);
  } else {
    raw = await res.text().catch(() => '');
  }

  if (!res.ok) {
    const msg = payload?.error || raw?.slice(0, 160) || `HTTP ${res.status}`;
    alert(`No se pudo generar el enlace (${res.status}): ${msg}`);
    return;
  }

  const shareToken = payload?.token || payload?.share_token || payload?.id;
  if (!shareToken && !payload?.url) {
    alert('El servidor respondió OK pero no devolvió token/url.');
    return;
  }

  const url = payload.url || new URL(`share.html?t=${encodeURIComponent(shareToken)}`, window.location.href).toString();

  try {
    await navigator.clipboard.writeText(url);
    alert('Enlace copiado ✅');
  } catch {
    prompt('Copia este enlace:', url);
  }
}


function abrirShareOverlay() {
  const el = document.getElementById('share-overlay');
  if (!el) return;
  el.style.display = 'flex';
  document.documentElement.style.overflow = 'hidden';
}

function cerrarShareOverlay() {
  const el = document.getElementById('share-overlay');
  if (!el) return;
  el.style.display = 'none';
  document.documentElement.style.overflow = '';
}

async function crearEnlaceCompartir(tipo) {
  if (!token || !usuarioActual?.id) {
    alert('Debes iniciar sesión para compartir.');
    return;
  }

  const title = document.getElementById('share-title');
  const input = document.getElementById('share-url');
  const status = document.getElementById('share-status');

  if (title) title.textContent = (tipo === 'deseos') ? 'Compartir deseos' : 'Compartir ejemplares';
  if (input) input.value = '';
  if (status) status.textContent = 'Generando enlace…';

  abrirShareOverlay();

  const res = await fetch(`${API_BASE}/api/share`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ tipo })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (status) status.textContent = data.error || 'Error creando enlace';
    return;
  }

  if (input) input.value = data.url || '';
  if (status) status.textContent = 'Enlace listo ✅';
}
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
    <span class="icon-circle">▲</span>
  </button>
  <button class="icon-btn cola-down" type="button" title="Bajar">
    <span class="icon-circle">▼</span>
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

  // Importante: para reordenar, mejor usar el orden “posicion asc”
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

  // delegación: borrar en lista cola
  document.getElementById('cola-lista')?.addEventListener('click', async (e) => {
    const card = e.target.closest('.deseo-item');
    if (!card) return;
    if (!e.target.closest('.cola-del')) return;

    const id = Number(card.dataset.id);
    await borrarDeCola(id);
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
  document.body.classList.toggle('vista-ej-grid', showGrid);


  grid.style.display = showGrid ? 'grid' : 'none';

  // En modo grid ocultamos tabla y lista móvil
  if (showGrid) {
    tablaWrap.style.display = 'none';
    if (mobileList) mobileList.style.display = 'none';
  } else {
    tablaWrap.style.display = '';
    if (mobileList) mobileList.style.display = '';
  }

  if (!showGrid) return;

  grid.innerHTML = (lista || []).map(e => {
    const portada = e.url_portada ? `${urlPortadaAbsoluta(e.url_portada)}?t=${Date.now()}` : '';
    return `
      <div class="ej-grid-item" data-libro-id="${e.libro_id}" data-ejemplar-id="${e.ejemplar_id}">
        ${portada
          ? `<img class="ej-grid-cover" src="${portada}" alt="Portada"
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

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
    // 1) Aplicar tema guardado
    const savedTheme = localStorage.getItem('paseolibros_theme') || 'rose';
    aplicarTema(savedTheme);
  
    // 2) Botón toggle de tema
    const themeBtn = document.getElementById('btn-toggle-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = localStorage.getItem('paseolibros_theme') || 'rose';
        const next = current === 'rose' ? 'dark' : 'rose';
        aplicarTema(next);
      });
    }
  wireDeseosUI();
  wireColaUI();
  restaurarPreferenciasUI();
  actualizarBotonesVistaEjemplares();
  initOrdenacionEjemplares();
  wireSortEjemplaresSelect();
  document.getElementById('ej-vista-lista')?.addEventListener('click', () => {
    vistaEjemplares = 'lista';
    guardarVistaEjemplares();          // ✅ NUEVO
    actualizarBotonesVistaEjemplares(); // ✅ NUEVO
    renderEjemplares();
  });
  document.getElementById('ej-vista-grid')?.addEventListener('click', () => {
    vistaEjemplares = 'grid';
    guardarVistaEjemplares();
    actualizarBotonesVistaEjemplares();
    renderEjemplares();
  });
  
  document.getElementById('btn-escanear')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-escanear');
    const isOn = btn?.dataset?.scanning === '1';
    if (isOn) {
      detenerEscaneo();
      setScanButtonState(false);
    } else {
      setScanButtonState(true);
      await iniciarEscaneo();
    }
  });
  
  document.getElementById('ejemplares-grid')?.addEventListener('click', (e) => {
    const item = e.target.closest('.ej-grid-item');
    if (!item) return;
    mostrarFicha(Number(item.dataset.libroId), Number(item.dataset.ejemplarId));
  });
  
  // restaurar sesión
  try {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser = localStorage.getItem(USER_KEY);
    if (savedToken && savedUser) {
      token = savedToken;
      usuarioActual = JSON.parse(savedUser);
    }
  } catch {}
  actualizarUIAutenticacion();

  // Botones básicos
  document.getElementById('btn-crear')?.addEventListener('click', (e) => {
    e.preventDefault();
    crearEjemplar();
  });
  
  document.getElementById('btn-login')?.addEventListener('click', hacerLogin);
  document.getElementById('btn-logout')?.addEventListener('click', hacerLogout);
  document.getElementById('ejemplares-list')?.addEventListener('click', (e) => {
  const card = e.target.closest('.ej-card');
  if (!card) return;

  const libroId = Number(card.dataset.libroId);
  const ejemplarId = Number(card.dataset.ejemplarId);

  if (e.target.closest('.m-read')) {
    empezarLectura(libroId, ejemplarId);
    return;
  }
  if (e.target.closest('.m-loan')) {
    crearUIPrestamo();
    crearUIMarcapagina();
    prestamoContexto = { libroId, ejemplarId };
    abrirUIPrestamo();
    cargarUsuariosParaPrestamo();
    return;
  }
  if (e.target.closest('.m-del')) {
    e.stopPropagation();
    eliminarEjemplar(ejemplarId);
    return;
  }
  // click general o botón “open”
  mostrarFicha(libroId, ejemplarId);
});

  const tituloInput = document.getElementById('edit-libro-titulo');
  tituloInput?.addEventListener('input', () => {
    const dups = titulosDuplicadosEnCache(tituloInput.value, libroSeleccionadoId);

    if (dups.length > 0) {
      setModalMsg(`⚠️ Ojo: ya tienes ${dups.length} libro(s) con ese título en tu biblioteca.`);
    } else {
      // no borres otros mensajes importantes si los usas; si quieres, comenta esta línea
      setModalMsg('');
    }
  });

  // Modal cerrar
  document.getElementById('modal-ficha-cerrar')?.addEventListener('click', cerrarModalFicha);
  document.getElementById('modal-ficha-backdrop')?.addEventListener('click', cerrarModalFicha);
  //Exportar
  document
  .getElementById('btn-exportar-csv')
  ?.addEventListener('click', exportarEjemplaresCSV);
  //Importar
  document
  .getElementById('input-importar-csv')
  ?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importarEjemplaresCSV(file);
    e.target.value = '';
  });
  document.getElementById('btn-share-deseos')?.addEventListener('click', () => crearEnlaceCompartir('deseos'));
  document.getElementById('btn-share-ejemplares')?.addEventListener('click', () => crearEnlaceCompartir('ejemplares'));
  //document.getElementById('btn-share-ejemplares')?.addEventListener('click', () => compartirLista('ejemplares'));
  //document.getElementById('btn-share-deseos')?.addEventListener('click', () => compartirLista('deseos'));

  document.getElementById('btn-cerrar-share')?.addEventListener('click', cerrarShareOverlay);
  document.getElementById('share-overlay')?.addEventListener('click', (e) => {
    if (e.target?.id === 'share-overlay') cerrarShareOverlay();
  });

  document.getElementById('btn-copy-share')?.addEventListener('click', async () => {
    const input = document.getElementById('share-url');
    const status = document.getElementById('share-status');
    const title = document.getElementById('share-title')?.textContent || 'Lista';
    const url = input?.value?.trim();
  
    if (!url) return;
  
    // 1) Intentar compartir nativo (móvil)
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: title,
          url,
        });
        if (status) status.textContent = 'Compartido ✅';
        return;
      } catch (err) {
        // Si el usuario cancela o falla, seguimos con copiar
        if (status) status.textContent = 'Compartir cancelado, intentando copiar…';
      }
    }
  
    // 2) Intentar clipboard moderno
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        if (status) status.textContent = 'Copiado al portapapeles ✅';
        return;
      } catch (e) {
        // seguimos al fallback clásico
      }
    }
  
    // 3) Fallback clásico (para navegadores viejos)
    if (input) {
      input.select();
      document.execCommand?.('copy');
      if (status) status.textContent = 'Copiado (modo compatibilidad) ✅';
    } else {
      // Último recurso: un prompt
      prompt('Copia este enlace:', url);
    }
  });
  

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      const modal = document.getElementById('modal-ficha');
      if (modal && modal.classList.contains('is-visible')) cerrarModalFicha();
    }
  });

  // FAB alta (si existe)
  const fab = document.getElementById('btn-toggle-alta');
  fab?.addEventListener('click', () => {
    const abierto = document.body.classList.toggle('alta-visible');
    fab.textContent = abierto ? '−' : '+';
    if (abierto) {
      setTimeout(() => document.getElementById('isbn')?.focus(), 50);
    } else {
      try { detenerEscaneo(); } catch {}
    }
  });

  // Subida portada
  document.getElementById('ficha-portada-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await subirPortadaArchivo(file);
    e.target.value = '';
  });

  // Botones modal
  document.getElementById('btn-terminar-lectura')?.addEventListener('click', terminarLecturaActual);
  document.getElementById('btn-marcar-devuelto-global')?.addEventListener('click', marcarPrestamoDevueltoGlobal);
  document.getElementById('btn-guardar-libro')?.addEventListener('click', guardarLibroEditado);
  document.getElementById('btn-guardar-ejemplar')?.addEventListener('click', guardarEjemplarEditado);

  
  // UI préstamo overlay
  crearUIPrestamo();

  // Buscador ejemplares (usa render, no “oculta filas”)
  const buscador = document.getElementById('buscador-ejemplares');
  if (buscador) {
    buscador.addEventListener('input', () => {
      ejemplaresQuery = buscador.value || '';
      renderEjemplares();
    });
  }
    // Ordenación compacta (móvil): título / autor / recientes
    const sortSel = document.getElementById('sort-ejemplares');
  // Clicks en tabla ejemplares (acciones vs abrir ficha)
  const tbodyEjemplares = document.querySelector('#tabla-ejemplares tbody');
  tbodyEjemplares?.addEventListener('click', (e) => {
    const fila = e.target.closest('tr');
    if (!fila) return;

    libroSeleccionadoId = fila.dataset.libroId ? Number(fila.dataset.libroId) : null;
    ejemplarSeleccionadoId = fila.dataset.ejemplarId ? Number(fila.dataset.ejemplarId) : null;

    tbodyEjemplares.querySelectorAll('tr').forEach((tr) => tr.classList.remove('fila-seleccionada'));
    fila.classList.add('fila-seleccionada');

    const btnLeer = e.target.closest('.btn-leer');
    const btnPrestar = e.target.closest('.btn-prestar');
    const btnEliminar = e.target.closest('.btn-eliminar');

    if (btnLeer) {
      e.stopPropagation();
      empezarLectura(btnLeer.dataset.libroId, btnLeer.dataset.ejemplarId);
      return;
    }
    if (btnPrestar) {
      e.stopPropagation();
      crearPrestamo(btnPrestar.dataset.libroId, btnPrestar.dataset.ejemplarId);
      return;
    }
    if (btnEliminar) {
      e.stopPropagation();
      eliminarEjemplar(btnEliminar.dataset.ejemplarId);
      return;
    }

    // abrir ficha
    mostrarFicha(fila.dataset.libroId, fila.dataset.ejemplarId);
  });
  // Cerrar “alta” al tocar fuera (solo móvil)
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('alta-visible')) return;

    const dentroPanel = e.target.closest('.column-left .card');
    const esFab = e.target.closest('#btn-toggle-alta');
    if (!dentroPanel && !esFab) {
      document.body.classList.remove('alta-visible');
      const fab = document.getElementById('btn-toggle-alta');
      if (fab) fab.textContent = '+';
      try { detenerEscaneo(); } catch {}
    }
  });

  // Click en lecturas/préstamos home => abrir ficha (resuelve ejemplar si falta)
  document.querySelector('#tabla-lecturas-abiertas tbody')?.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
  
    const lecturaId = tr.dataset.lecturaId ? Number(tr.dataset.lecturaId) : null;
    const libroId = Number(tr.dataset.libroId);
    const ejId = tr.dataset.ejemplarId ? Number(tr.dataset.ejemplarId) : resolverEjemplarIdDesdeCache(libroId);
  
    if (!lecturaId) {
      setUserStatusErr('No encuentro el ID de la lectura (lecturaId).');
      return;
    }
    if (!ejId) {
      setUserStatusErr('No encuentro el ejemplar de ese libro en tu lista.');
      return;
    }
  
    const paginaInicial = tr.dataset.paginaActual ? Number(tr.dataset.paginaActual) : null;
  
    abrirUIMarcapagina({
      lecturaId,
      paginaInicial,
      onSave: async (pagina) => {
        await actualizarPaginaLectura(lecturaId, pagina);
  
        // ✅ actualizar UI al instante
        tr.dataset.paginaActual = String(pagina ?? '');
        const td = tr.querySelector('.cell-pagina');
        if (td) td.textContent = (pagina ?? '—');
  
        // (opcional) refresca el resumen por si tu API devuelve algo distinto
        // await cargarLecturasAbiertas();
  
        // ✅ después abre ficha
        mostrarFicha(libroId, ejId);
      },
      onSkip: () => {
        // si cierran sin guardar, abre ficha igual (opcional)
        mostrarFicha(libroId, ejId);
      }
    });
  });
  

document.querySelector('#tabla-prestamos-activos tbody')?.addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;

  const libroId = Number(tr.dataset.libroId);
  const ejId = tr.dataset.ejemplarId ? Number(tr.dataset.ejemplarId) : resolverEjemplarIdDesdeCache(libroId);

  if (!ejId) {
    setUserStatusErr('No encuentro el ejemplar de ese libro en tu lista (¿tienes algún ejemplar cargado?).');
    return;
  }
  mostrarFicha(libroId, ejId);
});

  // --- Dropdown Herramientas ---
const btnTools = document.getElementById('btn-tools');
const toolsDropdown = document.getElementById('tools-dropdown');

function cerrarTools() {
  if (!toolsDropdown) return;
  toolsDropdown.classList.remove('is-open');
  toolsDropdown.setAttribute('aria-hidden', 'true');
}

function toggleTools() {
  if (!toolsDropdown) return;
  const open = toolsDropdown.classList.toggle('is-open');
  toolsDropdown.setAttribute('aria-hidden', open ? 'false' : 'true');
}

btnTools?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleTools();
});

document.addEventListener('click', cerrarTools);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cerrarTools();
});

  // Evita que un click dentro del dropdown lo cierre (necesario para el selector de ordenar)
  toolsDropdown?.addEventListener('click', (ev) => ev.stopPropagation());

  // --- Ordenar: en móvil vive dentro de Herramientas ---
  const mqlMobile = window.matchMedia('(max-width: 820px)');
  const sortSelect = document.getElementById('sort-ejemplares');
  const sortMiniHost = document.querySelector('.sort-mini');
  const originalParent = sortSelect?.parentElement || null;
  const originalNextSibling = sortSelect?.nextSibling || null;
  let toolsSortWrap = null;

  function ensureToolsSortWrap() {
    if (!toolsDropdown || !sortSelect) return null;
    if (toolsSortWrap && toolsSortWrap.isConnected) return toolsSortWrap;

    toolsSortWrap = document.createElement('div');
    toolsSortWrap.id = 'tools-sort-wrap';
    toolsSortWrap.className = 'tools-item tools-sort-wrap';
    toolsSortWrap.innerHTML = `<div class="tools-sort-label">Ordenar ejemplares</div>`;

    // lo ponemos arriba del todo, antes de Exportar/Importar
    toolsDropdown.insertBefore(toolsSortWrap, toolsDropdown.firstChild);
    toolsSortWrap.appendChild(sortSelect);

    return toolsSortWrap;
  }

  function placeSortControl() {
    if (!sortSelect) return;

    if (mqlMobile.matches) {
      ensureToolsSortWrap();
    } else {
      // vuelve a su sitio (header Ejemplares)
      if (sortMiniHost && sortMiniHost.isConnected) {
        sortMiniHost.appendChild(sortSelect);
      } else if (originalParent) {
        originalParent.insertBefore(sortSelect, originalNextSibling);
      }
      if (toolsSortWrap && toolsSortWrap.isConnected) toolsSortWrap.remove();
      toolsSortWrap = null;
    }
  }

  placeSortControl();
  if (mqlMobile.addEventListener) mqlMobile.addEventListener('change', placeSortControl);
  else mqlMobile.addListener(placeSortControl);


  // Delegación: marcar devuelto desde tabla préstamos modal

  async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}
function mostrarRegistro() {
  const loginBox = document.getElementById('login-box');
  const registerBox = document.getElementById('register-box');
  const msg = document.getElementById('login-mensaje');
  if (msg) msg.textContent = '';

  if (loginBox) loginBox.style.display = 'none';
  if (registerBox) registerBox.style.display = 'block';

  setUserStatus?.(''); // si existe en tu código
}

function mostrarLogin() {
  const loginBox = document.getElementById('login-box');
  const registerBox = document.getElementById('register-box');
  const msg = document.getElementById('login-mensaje');
  if (msg) msg.textContent = '';

  if (registerBox) registerBox.style.display = 'none';
  if (loginBox) loginBox.style.display = 'block';

  setUserStatus?.('');
}
document.getElementById('link-show-register')?.addEventListener('click', (e) => {
  e.preventDefault();
  mostrarRegistro();
});

document.getElementById('link-show-login')?.addEventListener('click', (e) => {
  e.preventDefault();
  mostrarLogin();
});
document.getElementById('link-forgot')?.addEventListener('click', (e) => {
  e.preventDefault();
  // “Zona en obras”
  alert('🔧 Recuperación de contraseña: en obras (pendiente configurar SMTP).');
});

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
document.getElementById('cola-lista')?.addEventListener('click', async (e) => {
  const card = e.target.closest('.deseo-item');
  if (!card) return;

  const id = Number(card.dataset.id);

  try {
    if (e.target.closest('.cola-up')) {
      await moverColaSwap(id, -1);
      return;
    }
    if (e.target.closest('.cola-down')) {
      await moverColaSwap(id, +1);
      return;
    }
    if (e.target.closest('.cola-del')) {
      await borrarDeCola(id);
      return;
    }
  } catch (err) {
    console.error(err);
    alert(err.message || 'Error reordenando');
  }
});

// --- REGISTRO ---
const btnRegister = document.getElementById('btn-register');
const msg = document.getElementById('login-mensaje');

btnRegister?.addEventListener('click', async (e) => {
  e.preventDefault();

  const nombre_usuario = document.getElementById('reg-usuario')?.value?.trim() || '';
  const correo = document.getElementById('reg-correo')?.value?.trim() || '';
  const contrasena = document.getElementById('reg-pass')?.value || '';

  if (msg) msg.textContent = '';

  if (!nombre_usuario || !correo || !contrasena) {
    if (msg) msg.textContent = 'Completa usuario, correo y contraseña.';
    return;
  }

  // evita doble click
  btnRegister.disabled = true;

  try {
    const { ok, data, status } = await apiPost('/api/auth/register', {
      nombre_usuario,
      correo,
      contrasena,
    });

    if (!ok) {
      if (msg) msg.textContent = data?.error || `Error al registrar (HTTP ${status}).`;
      return;
    }

    if (msg) msg.textContent = 'Cuenta creada ✅ Ya puedes iniciar sesión.';
    // opcional: limpiar campos
    document.getElementById('reg-usuario').value = '';
    document.getElementById('reg-correo').value = '';
    document.getElementById('reg-pass').value = '';
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = 'No se pudo conectar con el servidor.';
  } finally {
    btnRegister.disabled = false;
  }
});

});

