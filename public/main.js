const API_BASE =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3011'
    : '';

let codeReader = null;
let currentStream = null;

let token = null;
let usuarioActual = null; // { id, nombre_usuario, ... }

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

function setUserStatusOk(msg) { setUserStatus(msg ? `✅ ${msg}` : ''); }
function setUserStatusErr(msg) { setUserStatus(msg ? `❌ ${msg}` : ''); }

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
  if (token) headers['Authorization'] = `Bearer ${token}`;
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
  const zonaNo = document.getElementById('zona-no-autenticado');
  const zonaSi = document.getElementById('zona-autenticado');
  const nombreSpan = document.getElementById('nombre-usuario-actual');

  if (token && usuarioActual) {
    if (zonaNo) zonaNo.style.display = 'none';
    if (zonaSi) zonaSi.style.display = 'block';
    if (nombreSpan) nombreSpan.textContent = usuarioActual.nombre_usuario || '';

    const info = document.getElementById('info-ejemplares');
    if (info) info.textContent = 'Tus ejemplares:';

    if (usuarioActual.id) cargarEjemplares(usuarioActual.id);
    cargarLecturasAbiertas();
    cargarPrestamosActivos();
  } else {
    if (zonaNo) zonaNo.style.display = 'block';
    if (zonaSi) zonaSi.style.display = 'none';
    if (nombreSpan) nombreSpan.textContent = '';

    const info = document.getElementById('info-ejemplares');
    if (info) info.textContent = 'Inicia sesión para ver tu biblioteca.';

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

    token = data.token;
    usuarioActual = data.usuario;

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
      <td>${e.titulo || ''}</td>
      <td>${e.autores || ''}</td>
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
function crearUIPrestamo() {
  if (document.getElementById('prestamo-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'prestamo-overlay';
  overlay.className = 'prestamo-overlay';
  overlay.style.display = 'none';

  overlay.innerHTML = `
    <div class="prestamo-dialog">
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

  document.getElementById('prestamo-cancelar')?.addEventListener('click', cerrarUIPrestamo);
  document.getElementById('prestamo-confirmar')?.addEventListener('click', confirmarPrestamoDesdeUI);
}

function abrirUIPrestamo() {
  const overlay = document.getElementById('prestamo-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  document.getElementById('prestamo-receptor-select').value = '';
  document.getElementById('prestamo-receptor-nombre').value = '';
  document.getElementById('prestamo-fecha-limite').value = '';
  document.getElementById('prestamo-notas').value = '';
}

function cerrarUIPrestamo() {
  const overlay = document.getElementById('prestamo-overlay');
  if (!overlay) return;
  overlay.style.display = 'none';
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
        ejemplar_id: Number(prestamoContexto.ejemplarId),
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
    await cargarPrestamos(prestamoContexto.libroId);
    await refrescarHome();
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al crear el préstamo.');
  }
}

// ---------- Préstamos (modal) ----------
async function cargarPrestamos(libroId) {
  const info = document.getElementById('info-prestamos');
  const tbody = document.querySelector('#tabla-prestamos tbody');
  if (!info || !tbody) return;

  info.textContent = 'Cargando préstamos...';
  tbody.innerHTML = '';

  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroId}/prestamos`, {
      headers: getHeaders(false),
    });
    const prestamos = await res.json();

    if (!Array.isArray(prestamos) || prestamos.length === 0) {
      info.textContent = 'Este libro no tiene préstamos registrados.';
      return;
    }

    info.textContent = `Préstamos: ${prestamos.length}`;

    for (const p of prestamos) {
      const tr = document.createElement('tr');
      const nombreReceptor = p.nombre_receptor_usuario || p.nombre_receptor || '—';

      tr.innerHTML = `
        <td>${p.id}</td>
        <td>${p.nombre_prestador || ''}</td>
        <td>${nombreReceptor}</td>
        <td>${p.fecha_prestamo || ''}</td>
        <td>${p.fecha_limite || ''}</td>
        <td>${p.fecha_devolucion || ''}</td>
        <td>${p.estado || ''}</td>
        <td>${p.notas || ''}</td>
        <td>
          ${
            p.estado !== 'devuelto'
              ? `<button class="btn btn-secondary btn-sm btn-devolver"
                   data-prestamo-id="${p.id}" data-libro-id="${libroId}" type="button">
                   Marcar devuelto
                 </button>`
              : '—'
          }
        </td>
      `;
      tbody.appendChild(tr);
    }
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

    const data = await res.json();
    if (!res.ok) {
      setModalMsg(data.error || 'Error subiendo la portada.');
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
  const tbP = document.querySelector('#tabla-prestamos tbody');
  if (tbP) tbP.innerHTML = '';

  await cargarFormEdicion();
  if (reqId !== fichaReqId) return;

  await Promise.all([cargarLecturas(libroSeleccionadoId), cargarPrestamos(libroSeleccionadoId)]);
  if (reqId !== fichaReqId) return;

  abrirModalFicha();
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
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
  document.getElementById('btn-crear')?.addEventListener('click', crearEjemplar);
  document.getElementById('btn-escanear')?.addEventListener('click', iniciarEscaneo);
  document.getElementById('btn-detener')?.addEventListener('click', detenerEscaneo);
  document.getElementById('btn-login')?.addEventListener('click', hacerLogin);
  document.getElementById('btn-logout')?.addEventListener('click', hacerLogout);

  // Modal cerrar
  document.getElementById('modal-ficha-cerrar')?.addEventListener('click', cerrarModalFicha);
  document.getElementById('modal-ficha-backdrop')?.addEventListener('click', cerrarModalFicha);

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
  document.getElementById('btn-ver-lecturas')?.addEventListener('click', () => {
    if (!libroSeleccionadoId) return;
    cargarLecturas(libroSeleccionadoId);
  });

  document.getElementById('btn-terminar-lectura')?.addEventListener('click', terminarLecturaActual);

  document.getElementById('btn-ver-prestamos')?.addEventListener('click', () => {
    if (!libroSeleccionadoId) return;
    cargarPrestamos(libroSeleccionadoId);
  });

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

  // Click en lecturas/préstamos home => abrir ficha
  document.querySelector('#tabla-lecturas-abiertas tbody')?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    mostrarFicha(tr.dataset.libroId, tr.dataset.ejemplarId);
  });

  document.querySelector('#tabla-prestamos-activos tbody')?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    mostrarFicha(tr.dataset.libroId, tr.dataset.ejemplarId);
  });

  // Delegación: marcar devuelto desde tabla préstamos modal
  document.querySelector('#tabla-prestamos tbody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-devolver');
    if (!btn) return;
    marcarPrestamoDevuelto(btn.dataset.prestamoId, btn.dataset.libroId);
  });
});

