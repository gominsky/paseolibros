const isDev = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.protocol === 'file:';
const API_BASE = isDev ? 'http://localhost:3011' : '';

let codeReader = null;
let currentStream = null;

let token = null;
let usuarioActual = null; // { id, nombre_usuario, ... }
// Vista ejemplares: 'lista' | 'grid'
let vistaEjemplares = 'lista';

const TOKEN_KEY = 'paseolibros_token';
const USER_KEY = 'paseolibros_usuario';

// selección actual en la tabla
let libroSeleccionadoId = null;
let ejemplarSeleccionadoId = null;

let usuariosPrestamo = [];
let prestamoContexto = null;

// ---------- Estado tabla ejemplares (buscador + ordenación) ----------
let ejemplaresCache = [];
let ejemplaresQuery = '';
let sortEjemplares = { key: 'creado_en', dir: 'desc' }; // por defecto: más nuevos primero

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
  return String(v).toLowerCase();
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
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.usuario));
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
            : `<div class="portada-placeholder-mini">📚</div>`
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
          : `<div class="ej-cover" style="display:grid;place-items:center;color:#fff;background:#000;border-radius:12px;">📚</div>`
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
          <button class="icon-btn m-open" type="button" title="Abrir ficha"><span class="icon-circle">⌁</span></button>
          <button class="icon-btn m-read" type="button" title="Lectura"><span class="icon-circle">▶</span></button>
          <button class="icon-btn m-loan" type="button" title="Préstamo"><span class="icon-circle">⇄</span></button>
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
      hacerLogout();
      setUserStatusErr('Tu sesión ha caducado. Inicia sesión de nuevo.');
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

    const maxFilas = 4;
    const aMostrar = lecturas.slice(0, maxFilas);
    info.textContent =
      lecturas.length > maxFilas
        ? `Lecturas en curso: ${lecturas.length} (mostrando ${maxFilas})`
        : `Lecturas en curso: ${lecturas.length}`;

    for (const l of aMostrar) {
      const tr = document.createElement('tr');
      tr.classList.add('row-link');
      tr.dataset.libroId = l.libro_id;
      if (l.ejemplar_id) tr.dataset.ejemplarId = l.ejemplar_id;

      const fecha = l.inicio ? new Date(l.inicio).toLocaleDateString('es-ES') : '—';
      tr.innerHTML = `
        <td>${l.titulo || 'Sin título'}</td>
        <td>${l.pagina_actual ?? '—'}</td>
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

    const maxFilas = 4;
    const aMostrar = prestamos.slice(0, maxFilas);
    info.textContent =
      prestamos.length > maxFilas
        ? `Préstamos activos: ${prestamos.length} (mostrando ${maxFilas})`
        : `Préstamos activos: ${prestamos.length}`;

    for (const p of aMostrar) {
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

// ---------- Préstamos UI ----------
// ---------- Préstamos UI (MODAL real) ----------
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

// ---------- Escáner ----------
async function iniciarEscaneo() {
  const scannerDiv = document.getElementById('scanner');
  const video = document.getElementById('video');

  if (!scannerDiv || !video) {
    setUserStatusErr('No se encontró el componente de escaneo.');
    return;
  }

  setUserStatus('');
  scannerDiv.style.display = 'block';

  try {
    const constraints = { video: { facingMode: 'environment' } };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;

    video.srcObject = stream;
    video.setAttribute('playsinline', true);
    await video.play();

    const { BrowserMultiFormatReader } = ZXing;
    codeReader = new BrowserMultiFormatReader();

    codeReader.decodeFromVideoDevice(null, video, (result) => {
      if (result) {
        const isbnEl = document.getElementById('isbn');
        if (isbnEl) isbnEl.value = result.text;
        setUserStatusOk(`ISBN detectado: ${result.text}`);
        detenerEscaneo();
      }
    });
  } catch (error) {
    console.error(error);
    setUserStatusErr('No se pudo acceder a la cámara.');
    scannerDiv.style.display = 'none';
  }
}

function detenerEscaneo() {
  const scannerDiv = document.getElementById('scanner');

  if (codeReader) {
    try { codeReader.reset(); } catch {}
    codeReader = null;
  }

  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }

  if (scannerDiv) scannerDiv.style.display = 'none';
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
    document.getElementById('edit-libro-portada').value = libro.url_portada || '';
    document.getElementById('edit-libro-descripcion').value = libro.descripcion || '';

    // inputs ejemplar
    document.getElementById('edit-ejemplar-estado').value = ejemplar.estado || '';
    document.getElementById('edit-ejemplar-ubicacion').value = ejemplar.ubicacion || '';
    document.getElementById('edit-ejemplar-notas').value = ejemplar.notas || '';

    // header modal
    const img = document.getElementById('ficha-portada-img');
    if (img) img.src = libro.url_portada ? `${urlPortadaAbsoluta(libro.url_portada)}?t=${Date.now()}` : '';

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

  if (!token || !usuarioActual) {
    if (msg) msg.textContent = 'Debes iniciar sesión para editar libros.';
    return;
  }
  if (!libroSeleccionadoId) {
    if (msg) msg.textContent = 'Selecciona un libro.';
    return;
  }

  const titulo = document.getElementById('edit-libro-titulo').value.trim();
  const autores = document.getElementById('edit-libro-autores').value.trim();
  const editorial = document.getElementById('edit-libro-editorial').value.trim();
  const fecha_publicacion = document.getElementById('edit-libro-fecha').value.trim();
  const paginasStr = document.getElementById('edit-libro-paginas').value.trim();
  const url_portada = document.getElementById('edit-libro-portada').value.trim();
  const descripcion = document.getElementById('edit-libro-descripcion').value.trim();

  const numero_paginas = paginasStr ? Number(paginasStr) : null;
  const dups = titulosDuplicadosEnCache(titulo, libroSeleccionadoId);
if (dups.length > 0) {
  const ok = confirm(`Ojo: ya existe ese título en tu biblioteca (${dups.length} coincidencia/s). ¿Quieres guardar igualmente?`);
  if (!ok) return;
}
  try {
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
        url_portada: url_portada || null,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      if (msg) msg.textContent = data.error || 'Error guardando libro.';
      return;
    }

    if (msg) msg.textContent = 'Libro guardado ✅';
    if (usuarioActual?.id) await cargarEjemplares(usuarioActual.id);
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = 'Error de red al guardar libro.';
  }
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

  try {
    const res = await fetch(`${API_BASE}/api/ejemplares/${ejemplarSeleccionadoId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({
        estado: estado || null,
        ubicacion: ubicacion || null,
        notas: notas || null,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      if (msg) msg.textContent = data.error || 'Error guardando ejemplar.';
      return;
    }

    if (msg) msg.textContent = 'Ejemplar guardado ✅';
    if (usuarioActual?.id) await cargarEjemplares(usuarioActual.id);
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

  if (!grid || !tablaWrap) return;

  const showGrid = vistaEjemplares === 'grid';

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
          ? `<img class="ej-grid-cover" src="${portada}" alt="Portada">`
          : `<div class="ej-grid-cover" style="display:grid;place-items:center;">📚</div>`
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
  wireDeseosUI();
  document.getElementById('ej-vista-lista')?.addEventListener('click', () => {
    vistaEjemplares = 'lista';
    renderEjemplares();
  });
  
  document.getElementById('ej-vista-grid')?.addEventListener('click', () => {
    vistaEjemplares = 'grid';
    renderEjemplares();
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

  // Ordenación tabla
  initOrdenacionEjemplares();

  // Botones básicos
  document.getElementById('btn-crear')?.addEventListener('click', (e) => {
    e.preventDefault();
    crearEjemplar();
  });
  document.getElementById('btn-escanear')?.addEventListener('click', iniciarEscaneo);
  document.getElementById('btn-detener')?.addEventListener('click', detenerEscaneo);
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
    prestamoContexto = { libroId, ejemplarId };
    abrirUIPrestamo();
    cargarUsuariosParaPrestamo();
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
      setTimeout(() => { try { iniciarEscaneo(); } catch {} }, 150);
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
  document.querySelector('#tabla-lecturas-abiertas tbody')?.addEventListener('click', (e) => {
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

