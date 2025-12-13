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

// ---------- Helpers ----------
function setUserStatus(msg) {
  const el = document.getElementById('user-status-msg');
  if (!el) return;
  el.textContent = msg || '';
}
async function refrescarHome() {
  if (!token || !usuarioActual?.id) return;

  try {
    await Promise.all([
      cargarLecturasAbiertas(),
      cargarPrestamosActivos(),
    ]);
  } catch (e) {
    console.warn('No se pudo refrescar la home', e);
  }
}

function setUserStatusOk(msg) { setUserStatus(msg ? `✅ ${msg}` : ''); }
function setUserStatusErr(msg) { setUserStatus(msg ? `❌ ${msg}` : ''); }

function urlPortadaAbsoluta(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url; // ya es absoluta
  return `${API_BASE}${url}`; // ej: http://localhost:3011 + /uploads/xxx.jpg
}

function getHeaders(json = true) {
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function actualizarUIAutenticacion() {
  const zonaNo = document.getElementById('zona-no-autenticado');
  const zonaSi = document.getElementById('zona-autenticado');
  const nombreSpan = document.getElementById('nombre-usuario-actual');
  const selectUsuario = document.getElementById('usuario');

  if (token && usuarioActual) {
    // zona logueado
    if (zonaNo) zonaNo.style.display = 'none';
    if (zonaSi) zonaSi.style.display = 'block';
    if (nombreSpan) nombreSpan.textContent = usuarioActual.nombre_usuario || '';

    if (selectUsuario) {
      selectUsuario.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = usuarioActual.id;
      opt.textContent = usuarioActual.nombre_usuario;
      selectUsuario.appendChild(opt);
    }

    const info = document.getElementById('info-ejemplares');
    if (info) info.textContent = 'Tus ejemplares:';

    // 👉 aquí se cargan ejemplares y los resúmenes globales
    if (usuarioActual.id) {
      cargarEjemplares(usuarioActual.id);
    }
    cargarLecturasAbiertas();
    cargarPrestamosActivos();
  } else {
    // zona no logueado
    if (zonaNo) zonaNo.style.display = 'block';
    if (zonaSi) zonaSi.style.display = 'none';
    if (nombreSpan) nombreSpan.textContent = '';

    if (selectUsuario) {
      selectUsuario.innerHTML = '';
    }

    const info = document.getElementById('info-ejemplares');
    if (info) info.textContent = 'Inicia sesión para ver tu biblioteca.';

    // limpiar paneles globales
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
    mensaje.textContent = 'Introduce usuario y contraseña';
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
      mensaje.textContent = data.error || 'Error en el login';
      return;
    }

    token = data.token;
    usuarioActual = data.usuario;

    // guardar en localStorage para persistir sesión
    try {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.usuario));
    } catch (e) {
      console.warn('No se pudo guardar la sesión en localStorage', e);
    }

    mensaje.textContent = 'Login correcto ✅';

    // limpiar campos
    usuarioInput.value = '';
    passInput.value = '';

    // refrescar toda la UI
    actualizarUIAutenticacion();

    // asegurar que se cargan paneles globales
    cargarLecturasAbiertas();
    cargarPrestamosActivos();
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red en el login';
  }
}


function hacerLogout() {
  token = null;
  usuarioActual = null;

  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (e) {
    console.warn('No se pudo limpiar localStorage', e);
  }

  actualizarUIAutenticacion();

  const mensaje = document.getElementById('login-mensaje');
  if (mensaje) mensaje.textContent = 'Sesión cerrada';
}


// ---------- Modal ficha libro/ejemplar ----------

function abrirModalFicha() {
  const modal = document.getElementById('modal-ficha');
  if (!modal) return;
  modal.classList.add('is-visible');
  document.body.classList.add('no-scroll');

  if (libroSeleccionadoId) {
    cargarLecturas(libroSeleccionadoId);
    cargarPrestamos(libroSeleccionadoId);
  }
}

async function cerrarModalFicha() {
  const modal = document.getElementById('modal-ficha');
  if (!modal) return;

  modal.classList.remove('is-visible');

  // refrescar resúmenes de la home al cerrar el modal
  try {
    await cargarLecturasAbiertas();
    await cargarPrestamosActivos();
  } catch (e) {
    console.warn('No se pudieron refrescar lecturas/préstamos al cerrar modal', e);
  }
}

async function subirPortadaArchivo(file) {
  const msg = document.getElementById('edit-mensaje');
  if (!libroSeleccionadoId || !file) return;

  if (msg) msg.textContent = 'Subiendo portada...';

  const formData = new FormData();
  formData.append('portada', file);

  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(
      `${API_BASE}/api/libros/${libroSeleccionadoId}/portada`,
      {
        method: 'POST',
        headers,
        body: formData,
      }
    );

    const data = await res.json();

    if (!res.ok) {
      if (msg) msg.textContent = data.error || 'Error subiendo la portada.';
      return;
    }

    if (msg) msg.textContent = 'Portada actualizada ✅';

    if (data.url_portada) {
      const img = document.getElementById('ficha-portada-img');
      if (img) img.src = data.url_portada;
      const portadaInput = document.getElementById('edit-libro-portada');
      if (portadaInput) portadaInput.value = data.url_portada;
    }

    if (usuarioActual) {
      cargarEjemplares(usuarioActual.id);
    }
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = 'Error de red al subir la portada.';
  }
}
// ---------- UI de préstamo con desplegable de usuarios ----------

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
        <button id="prestamo-cancelar" class="btn btn-ghost btn-sm">Cancelar</button>
        <button id="prestamo-confirmar" class="btn btn-secondary btn-sm">Crear préstamo</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const btnCancelar = document.getElementById('prestamo-cancelar');
  const btnConfirmar = document.getElementById('prestamo-confirmar');

  btnCancelar.addEventListener('click', () => {
    cerrarUIPrestamo();
  });

  btnConfirmar.addEventListener('click', confirmarPrestamoDesdeUI);
}

function abrirUIPrestamo() {
  const overlay = document.getElementById('prestamo-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  // limpiar campos
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
    // ya cargados
    rellenarSelectPrestamo();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/usuarios`, {
      headers: getHeaders(false)
    });
    const data = await res.json();

    if (Array.isArray(data)) {
      usuariosPrestamo = data;
    } else {
      usuariosPrestamo = [];
    }
  } catch (err) {
    console.error('Error cargando usuarios para préstamo', err);
    usuariosPrestamo = [];
  }

  rellenarSelectPrestamo();
}

function rellenarSelectPrestamo() {
  const select = document.getElementById('prestamo-receptor-select');
  if (!select) return;

  // dejamos la primera opción "Persona externa"
  select.innerHTML = '<option value="">— Persona externa —</option>';

  for (const u of usuariosPrestamo) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.nombre_usuario} (id ${u.id})`;
    select.appendChild(opt);
  }
}

async function confirmarPrestamoDesdeUI() {
  const mensaje = document.getElementById('mensaje');

  if (!prestamoContexto || !usuarioActual || !token) {
    cerrarUIPrestamo();
    if (mensaje) mensaje.textContent = 'No hay contexto de préstamo válido.';
    return;
  }

  const select = document.getElementById('prestamo-receptor-select');
  const inputNombre = document.getElementById('prestamo-receptor-nombre');
  const inputFecha = document.getElementById('prestamo-fecha-limite');
  const inputNotas = document.getElementById('prestamo-notas');

  let usuarioReceptorId = select.value ? Number(select.value) : null;
  let nombreReceptor = inputNombre.value.trim() || null;

  // Si se ha elegido usuario de la app, podemos ignorar nombreReceptor (lo tenemos en usuarios)
  if (usuarioReceptorId) {
    nombreReceptor = null;
  } else if (!nombreReceptor) {
    alert('Introduce un nombre para la persona externa.');
    return;
  }

  const fechaLimiteStr = inputFecha.value || null;
  const notas = inputNotas.value.trim() || null;

  try {
    const res = await fetch(`${API_BASE}/api/prestamos`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        ejemplar_id: Number(prestamoContexto.ejemplarId),
        usuario_prestador_id: usuarioActual.id,
        usuario_receptor_id: usuarioReceptorId || null,
        nombre_receptor: nombreReceptor || null,
        fecha_limite: fechaLimiteStr,
        notas
      })
    });

    const data = await res.json();

    if (!res.ok) {
      if (mensaje) {
        mensaje.textContent = `Error al crear el préstamo: ${data.error || 'Error desconocido'}`;
      }
      return;
    }

    if (mensaje) mensaje.textContent = 'Préstamo creado ✅';

    cerrarUIPrestamo();
    await cargarPrestamos(prestamoContexto.libroId);
  } catch (err) {
    console.error(err);
    if (mensaje) mensaje.textContent = 'Error de red al crear el préstamo';
  }
}

// ---------- Cargar ejemplares ----------

async function cargarEjemplares(usuarioId) {
  const info = document.getElementById('info-ejemplares');
  const tbody = document.querySelector('#tabla-ejemplares tbody');

  if (!tbody) return;

  tbody.innerHTML = '';
  if (!usuarioId) {
    if (info) info.textContent = 'Inicia sesión para ver tus ejemplares.';
    return;
  }

  if (info) info.textContent = 'Cargando ejemplares...';

  try {
    const res = await fetch(
      `${API_BASE}/api/usuarios/${usuarioId}/ejemplares`,
      {
        headers: getHeaders(false),
      }
    );
    const ejemplares = await res.json();

    if (!Array.isArray(ejemplares) || ejemplares.length === 0) {
      if (info) info.textContent = 'No tienes ejemplares todavía.';
      return;
    }

    if (info) info.textContent = `Total ejemplares: ${ejemplares.length}`;

    for (const e of ejemplares) {
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
    <button
      class="icon-btn btn-leer"
      title="Empezar / ver lectura"
      data-libro-id="${e.libro_id}"
      data-ejemplar-id="${e.ejemplar_id}"
      type="button"
    >
      <span class="icon-circle icon-read">▶</span>
    </button>

    <button
      class="icon-btn btn-prestar"
      title="Registrar préstamo"
      data-libro-id="${e.libro_id}"
      data-ejemplar-id="${e.ejemplar_id}"
      type="button"
    >
      <span class="icon-circle icon-loan">⇄</span>
    </button>

    <button
      class="icon-btn btn-eliminar"
      title="Eliminar ejemplar"
      data-ejemplar-id="${e.ejemplar_id}"
      type="button"
    >
      <span class="icon-circle icon-delete">✕</span>
    </button>
  </td>
`;

      tbody.appendChild(tr);
    }
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

  const isbn = document.getElementById('isbn').value.trim();
  const ubicacion = document.getElementById('ubicacion').value.trim();
  const notas = document.getElementById('notas').value.trim();

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
      setUserStatusErr(data.error || 'Error desconocido creando ejemplar.');
      return;
    }

    setUserStatusOk('Ejemplar creado.');
    document.getElementById('isbn').value = '';

    await cargarEjemplares(usuarioActual.id);
    await refrescarHome();
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al crear el ejemplar.');
  }
}

// ---------- LECTURAS Y PRÉSTAMOS ----------

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
    await cargarLecturasAbiertas();
  } catch (err) {
    console.error(err);
    setUserStatusErr('Error de red al empezar la lectura.');
  }
}


async function cargarLecturas(libroId) {
  const infoLecturas = document.getElementById('info-lecturas');
  const tbody = document.querySelector('#tabla-lecturas-libro tbody');

  infoLecturas.textContent = 'Cargando lecturas...';
  if (tbody) tbody.innerHTML = '';

  try {
    const res = await fetch(`${API_BASE}/api/libros/${libroId}/lecturas`, {
      headers: getHeaders(false),
    });

    const lecturas = await res.json();

    if (!res.ok) {
      infoLecturas.textContent = lecturas.error || 'Error al cargar las lecturas.';
      return;
    }

    if (!Array.isArray(lecturas) || lecturas.length === 0) {
      infoLecturas.textContent = 'Este libro no tiene lecturas registradas.';
      return;
    }

    infoLecturas.textContent = `Total lecturas registradas: ${lecturas.length}`;

    if (!tbody) return;

    for (const l of lecturas) {
      const tr = document.createElement('tr');

      // Activa = no terminada
      const esActiva = l.estado !== 'terminado';
      // Activa del usuario actual (se destaca aún más)
      const esActivaMia = esActiva && usuarioActual && l.usuario_id === usuarioActual.id;

      if (esActivaMia) tr.classList.add('lectura-activa-mia');
      else if (esActiva) tr.classList.add('lectura-activa');

      const inicio = l.inicio ? new Date(l.inicio).toLocaleDateString('es-ES') : '—';
      const fin = l.fin ? new Date(l.fin).toLocaleDateString('es-ES') : '—';

      tr.innerHTML = `
        <td>${l.nombre_usuario || `Usuario ${l.usuario_id}`}</td>
        <td>${l.estado || '—'}</td>
        <td>${l.pagina_actual ?? '—'}</td>
        <td>${inicio}</td>
        <td>${fin}</td>
      `;

      tbody.appendChild(tr);
    }
  } catch (err) {
    console.error(err);
    infoLecturas.textContent = 'Error al cargar las lecturas.';
  }
}

// ---------- Resumen GLOBAL: lecturas y préstamos abiertos ----------

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
    const res = await fetch(
      `${API_BASE}/api/usuarios/${usuarioActual.id}/lecturas-abiertas`,
      { headers: getHeaders(false) }
    );
    const lecturas = await res.json();

    if (!Array.isArray(lecturas) || lecturas.length === 0) {
      info.textContent = 'No tienes lecturas en curso.';
      return;
    }

    const maxFilas = 4;
    const aMostrar = lecturas.slice(0, maxFilas);

    if (lecturas.length > maxFilas) {
      info.textContent = `Lecturas en curso: ${lecturas.length} (mostrando ${maxFilas})`;
    } else {
      info.textContent = `Lecturas en curso: ${lecturas.length}`;
    }

    for (const l of aMostrar) {
      const tr = document.createElement('tr');

      const fecha = l.inicio
        ? new Date(l.inicio).toLocaleDateString('es-ES')
        : '—';
      tr.classList.add('row-link');
      tr.dataset.libroId = l.libro_id;
      if (l.ejemplar_id) tr.dataset.ejemplarId = l.ejemplar_id;

      tr.innerHTML = `
        <td>${l.titulo || 'Sin título'}</td>
        <td>${l.pagina_actual || '—'}</td>
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
    const res = await fetch(
      `${API_BASE}/api/usuarios/${usuarioActual.id}/prestamos-activos`,
      { headers: getHeaders(false) }
    );
    const prestamos = await res.json();

    if (!Array.isArray(prestamos) || prestamos.length === 0) {
      info.textContent = 'No tienes préstamos activos.';
      return;
    }

    const maxFilas = 4;
    const aMostrar = prestamos.slice(0, maxFilas);

    if (prestamos.length > maxFilas) {
      info.textContent = `Préstamos activos: ${prestamos.length} (mostrando ${maxFilas})`;
    } else {
      info.textContent = `Préstamos activos: ${prestamos.length}`;
    }

    for (const p of aMostrar) {
      const tr = document.createElement('tr');

      const nombreReceptor =
        p.nombre_receptor_usuario || p.nombre_receptor || '—';

      const fechaLimite = p.fecha_limite
        ? new Date(p.fecha_limite).toLocaleDateString('es-ES')
        : '—';
        tr.classList.add('row-link');
        tr.dataset.libroId = p.libro_id;
        if (p.ejemplar_id) tr.dataset.ejemplarId = p.ejemplar_id;

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

async function terminarLecturaActual() {
  const mensaje = document.getElementById('mensaje');

  if (!token || !usuarioActual) {
    mensaje.textContent = 'Debes iniciar sesión para terminar una lectura';
    return;
  }

  if (!libroSeleccionadoId) {
    mensaje.textContent = 'Selecciona primero un ejemplar en la tabla.';
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/libros/${libroSeleccionadoId}/lecturas`,
      {
        headers: getHeaders(false),
      }
    );
    const lecturas = await res.json();

    if (!res.ok) {
      mensaje.textContent = lecturas.error || 'Error cargando lecturas.';
      return;
    }

    if (!Array.isArray(lecturas) || lecturas.length === 0) {
      mensaje.textContent = 'Este libro no tiene lecturas registradas.';
      return;
    }

    const lecturaActiva = lecturas.find(
      (l) => l.usuario_id === usuarioActual.id && l.estado !== 'terminado'
    );

    if (!lecturaActiva) {
      mensaje.textContent = 'No tienes ninguna lectura activa para este libro.';
      return;
    }

    const paginaStr = prompt('Última página leída (opcional):');
    const valoracionStr = prompt('Valoración (1-5, opcional):');
    const notas = prompt('Notas sobre la lectura (opcional):') || null;

    let pagina_actual = paginaStr ? Number(paginaStr) : null;
    if (Number.isNaN(pagina_actual)) pagina_actual = null;

    let valoracion = valoracionStr ? Number(valoracionStr) : null;
    if (Number.isNaN(valoracion)) valoracion = null;

    const resFin = await fetch(
      `${API_BASE}/api/lecturas/${lecturaActiva.id}/finalizar`,
      {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ pagina_actual, valoracion, notas }),
      }
    );

    const dataFin = await resFin.json();

    if (!resFin.ok) {
      mensaje.textContent =
        dataFin.error || 'Error al marcar la lectura como terminada.';
      return;
    }

    mensaje.textContent = 'Lectura marcada como terminada ✅';
    await cargarLecturas(libroSeleccionadoId);
    await cargarLecturasAbiertas();
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al terminar la lectura.';
  }
  await refrescarHome();
}

async function crearPrestamo(libroId, ejemplarId) {
  const mensaje = document.getElementById('mensaje');

  if (!token || !usuarioActual) {
    if (mensaje) mensaje.textContent = 'Debes iniciar sesión para prestar libros';
    return;
  }

  // guardamos el contexto del préstamo actual
  prestamoContexto = {
    libroId: Number(libroId),
    ejemplarId: Number(ejemplarId),
  };

  // nos aseguramos de que la UI existe y de que los usuarios están cargados
  crearUIPrestamo();
  await cargarUsuariosParaPrestamo();

  // abrimos el mini-modal
  abrirUIPrestamo();
}


async function cargarPrestamos(libroId) {
  const info = document.getElementById('info-prestamos');
  const tbody = document.querySelector('#tabla-prestamos tbody');

  if (!info || !tbody) return;

  info.textContent = 'Cargando préstamos...';
  tbody.innerHTML = '';

  try {
    const res = await fetch(
      `${API_BASE}/api/libros/${libroId}/prestamos`,
      {
        headers: getHeaders(false),
      }
    );
    const prestamos = await res.json();

    if (!Array.isArray(prestamos) || prestamos.length === 0) {
      info.textContent = 'Este libro no tiene préstamos registrados.';
      return;
    }

    info.textContent = `Total préstamos registrados: ${prestamos.length}`;

    for (const p of prestamos) {
      const tr = document.createElement('tr');

      const nombreReceptor =
        p.nombre_receptor_usuario || p.nombre_receptor || '—';

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
              ? `<button 
                  class="btn-devolver" 
                  data-prestamo-id="${p.id}" 
                  data-libro-id="${libroId}"
                 >
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
  const mensaje = document.getElementById('mensaje');
  const notas = prompt('Notas sobre la devolución (opcional):') || null;

  try {
    const res = await fetch(
      `${API_BASE}/api/prestamos/${prestamoId}/devolver`,
      {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ notas }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      mensaje.textContent = `Error al marcar como devuelto: ${
        data.error || 'Error desconocido'
      }`;
      return;
    }

    mensaje.textContent = 'Préstamo marcado como devuelto ✅';

    await cargarPrestamos(libroId);
    await cargarPrestamosActivos();
    await refrescarHome();
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al actualizar el préstamo';
  }
}

async function marcarPrestamoDevueltoGlobal() {
  const mensaje = document.getElementById('mensaje');

  if (!token || !usuarioActual) {
    mensaje.textContent = 'Debes iniciar sesión para actualizar préstamos';
    return;
  }

  if (!libroSeleccionadoId) {
    mensaje.textContent = 'Selecciona primero un ejemplar en la tabla.';
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/libros/${libroSeleccionadoId}/prestamos`,
      { headers: getHeaders(false) }
    );
    const prestamos = await res.json();

    if (!res.ok) {
      mensaje.textContent = prestamos.error || 'Error cargando préstamos.';
      return;
    }

    if (!Array.isArray(prestamos) || prestamos.length === 0) {
      mensaje.textContent = 'Este libro no tiene préstamos registrados.';
      return;
    }

    const prestamoActivo = prestamos.find(
      (p) => p.estado !== 'devuelto' && p.usuario_prestador_id === usuarioActual.id
    );

    if (!prestamoActivo) {
      mensaje.textContent =
        'No tienes ningún préstamo activo para este libro.';
      return;
    }

    const confirmar = confirm(
      `¿Marcar como devuelto el préstamo #${prestamoActivo.id}?`
    );
    if (!confirmar) return;

    const notas = prompt('Notas sobre la devolución (opcional):') || null;

    const resDev = await fetch(
      `${API_BASE}/api/prestamos/${prestamoActivo.id}/devolver`,
      {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ notas }),
      }
    );

    const dataDev = await resDev.json();

    if (!resDev.ok) {
      mensaje.textContent =
        dataDev.error || 'Error al marcar el préstamo como devuelto.';
      return;
    }

    mensaje.textContent = 'Préstamo marcado como devuelto ✅';
    await cargarPrestamos(libroSeleccionadoId);
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al marcar préstamo como devuelto.';
  }
}

// ---------- Escaneo de código de barras ----------

async function iniciarEscaneo() {
  const scannerDiv = document.getElementById('scanner');
  const video = document.getElementById('video');

  if (!scannerDiv || !video) {
    setUserStatus('No se encontró el componente de escaneo en la página.');
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

    codeReader.decodeFromVideoDevice(null, video, (result, err) => {
      if (result) {
        document.getElementById('isbn').value = result.text;
        setUserStatus(`Código detectado: ${result.text}`);
        detenerEscaneo();
      }
    });
  } catch (error) {
    console.error(error);
    setUserStatus('No se pudo acceder a la cámara (permiso denegado o sin dispositivo).');
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
  const mensaje = document.getElementById('mensaje');

  if (!token || !usuarioActual) {
    mensaje.textContent = 'Debes iniciar sesión para eliminar ejemplares';
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
      mensaje.textContent = data.error || 'Error eliminando ejemplar';
      return;
    }

    mensaje.textContent = 'Ejemplar eliminado ✅';

    await cargarEjemplares(usuarioActual.id);
    await refrescarHome();
  } catch (err) {
    console.error(err);
    mensaje.textContent = 'Error de red al eliminar ejemplar';
  }
}

// ---------- Cargar formulario de edición (para la ficha) ----------

async function cargarFormEdicion() {
  const msg = document.getElementById('edit-mensaje');
  if (!libroSeleccionadoId || !ejemplarSeleccionadoId) {
    if (msg) msg.textContent = 'Selecciona un ejemplar en la tabla para editar.';
    return;
  }

  if (msg) msg.textContent = '';

  try {
    const [resLibro, resEjemplar] = await Promise.all([
      fetch(`${API_BASE}/api/libros/${libroSeleccionadoId}`, {
        headers: getHeaders(false),
      }),
      fetch(`${API_BASE}/api/ejemplares/${ejemplarSeleccionadoId}`, {
        headers: getHeaders(false),
      }),
    ]);

    const libro = await resLibro.json();
    const ejemplar = await resEjemplar.json();

    if (!resLibro.ok) {
      msg.textContent = libro.error || 'Error cargando datos del libro.';
      return;
    }
    if (!resEjemplar.ok) {
      msg.textContent = ejemplar.error || 'Error cargando datos del ejemplar.';
      return;
    }

    // Libro
    document.getElementById('edit-libro-titulo').value =
      libro.titulo || '';
    document.getElementById('edit-libro-autores').value =
      libro.autores || '';
    document.getElementById('edit-libro-editorial').value =
      libro.editorial || '';
    document.getElementById('edit-libro-fecha').value =
      libro.fecha_publicacion || '';
    document.getElementById('edit-libro-paginas').value =
      libro.numero_paginas || '';
    document.getElementById('edit-libro-portada').value =
      libro.url_portada || '';
    document.getElementById('edit-libro-descripcion').value =
      libro.descripcion || '';

    // Ejemplar
    document.getElementById('edit-ejemplar-estado').value =
      ejemplar.estado || '';
    document.getElementById('edit-ejemplar-ubicacion').value =
      ejemplar.ubicacion || '';
    document.getElementById('edit-ejemplar-notas').value =
      ejemplar.notas || '';

    // Cabecera de la ficha (modal)
    const img = document.getElementById('ficha-portada-img');
    if (img) {
      img.src = libro.url_portada ? `${urlPortadaAbsoluta(libro.url_portada)}?t=${Date.now()}` : '';
    }

    const tituloSpan = document.getElementById('ficha-titulo');
    if (tituloSpan) {
      tituloSpan.textContent = libro.titulo || 'Sin título';
    }

    const autoresSpan = document.getElementById('ficha-autores');
    if (autoresSpan) {
      autoresSpan.textContent = libro.autores || 'Autor desconocido';
    }

    const isbnSpan = document.getElementById('ficha-isbn');
    if (isbnSpan) {
      isbnSpan.textContent = libro.isbn || '—';
    }

    const creadoSpan = document.getElementById('ficha-creado-en');
    if (creadoSpan) {
      if (ejemplar.creado_en) {
        const fecha = new Date(ejemplar.creado_en);
        creadoSpan.textContent = fecha.toLocaleString('es-ES');
      } else {
        creadoSpan.textContent = '—';
      }
    }
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = 'Error de red al cargar datos de edición.';
  }
}

// ---------- Guardar libro / ejemplar ----------

async function guardarLibroEditado() {
  const msg = document.getElementById('edit-mensaje');
  msg.textContent = '';

  if (!token || !usuarioActual) {
    msg.textContent = 'Debes iniciar sesión para editar libros.';
    return;
  }

  if (!libroSeleccionadoId) {
    msg.textContent = 'Selecciona un libro desde la tabla de ejemplares.';
    return;
  }

  const titulo = document.getElementById('edit-libro-titulo').value.trim();
  const autores = document.getElementById('edit-libro-autores').value.trim();
  const editorial = document
    .getElementById('edit-libro-editorial')
    .value.trim();
  const fecha_publicacion = document
    .getElementById('edit-libro-fecha')
    .value.trim();
  const paginasStr = document
    .getElementById('edit-libro-paginas')
    .value.trim();
  const url_portada = document
    .getElementById('edit-libro-portada')
    .value.trim();
  const descripcion = document
    .getElementById('edit-libro-descripcion')
    .value.trim();

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
      msg.textContent = data.error || 'Error guardando datos del libro.';
      return;
    }

    msg.textContent = 'Datos del libro guardados ✅';

    if (usuarioActual) {
      cargarEjemplares(usuarioActual.id);
    }
  } catch (err) {
    console.error(err);
    msg.textContent = 'Error de red al guardar datos del libro.';
  }
}

async function guardarEjemplarEditado() {
  const msg = document.getElementById('edit-mensaje');
  msg.textContent = '';

  if (!token || !usuarioActual) {
    msg.textContent = 'Debes iniciar sesión para editar ejemplares.';
    return;
  }

  if (!ejemplarSeleccionadoId) {
    msg.textContent = 'Selecciona un ejemplar desde la tabla.';
    return;
  }

  const estado = document
    .getElementById('edit-ejemplar-estado')
    .value.trim();
  const ubicacion = document
    .getElementById('edit-ejemplar-ubicacion')
    .value.trim();
  const notas = document
    .getElementById('edit-ejemplar-notas')
    .value.trim();

  try {
    const res = await fetch(
      `${API_BASE}/api/ejemplares/${ejemplarSeleccionadoId}`,
      {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          estado: estado || null,
          ubicacion: ubicacion || null,
          notas: notas || null,
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.error || 'Error guardando datos del ejemplar.';
      return;
    }

    msg.textContent = 'Datos del ejemplar guardados ✅';

    if (usuarioActual) {
      cargarEjemplares(usuarioActual.id);
    }
  } catch (err) {
    console.error(err);
    msg.textContent = 'Error de red al guardar datos del ejemplar.';
  }
}

let fichaReqId = 0;

async function mostrarFicha(libroId, ejemplarId) {
  const reqId = ++fichaReqId;

  libroSeleccionadoId = Number(libroId);
  ejemplarSeleccionadoId = ejemplarId ? Number(ejemplarId) : null;

  // Limpieza rápida (para que se note que está cambiando)
  document.getElementById('ficha-titulo') && (document.getElementById('ficha-titulo').textContent = 'Cargando…');
  document.getElementById('ficha-autores') && (document.getElementById('ficha-autores').textContent = '');
  document.getElementById('ficha-isbn') && (document.getElementById('ficha-isbn').textContent = '—');
  document.getElementById('ficha-creado-en') && (document.getElementById('ficha-creado-en').textContent = '—');
  document.getElementById('info-lecturas') && (document.getElementById('info-lecturas').textContent = 'Cargando lecturas…');
  document.querySelector('#tabla-prestamos tbody') && (document.querySelector('#tabla-prestamos tbody').innerHTML = '');
  const pre = document.getElementById('lecturas-detalle');
  if (pre) pre.textContent = '';

  // Cargar y pintar (si llega otra petición después, ignoramos esta)
  await cargarFormEdicion();
  if (reqId !== fichaReqId) return;

  // si tus funciones existen, recargamos también lo “relacionado”
  if (typeof cargarLecturas === 'function') {
    await cargarLecturas(libroSeleccionadoId);
    if (reqId !== fichaReqId) return;
  }
  if (typeof cargarPrestamos === 'function') {
    await cargarPrestamos(libroSeleccionadoId);
    if (reqId !== fichaReqId) return;
  }

  abrirModalFicha();
}

// ---------- Inicialización ----------

document.addEventListener('DOMContentLoaded', () => {
  // restaurar sesión si hay algo guardado
  try {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser = localStorage.getItem(USER_KEY);

    if (savedToken && savedUser) {
      token = savedToken;
      usuarioActual = JSON.parse(savedUser);
    }
  } catch (e) {
    console.warn('No se pudo leer la sesión de localStorage', e);
  }

  actualizarUIAutenticacion();

  // Botones básicos
  document
    .getElementById('btn-crear')
    .addEventListener('click', crearEjemplar);

  document
    .getElementById('btn-escanear')
    .addEventListener('click', iniciarEscaneo);

  document
    .getElementById('btn-detener')
    .addEventListener('click', detenerEscaneo);

  document
    .getElementById('btn-login')
    .addEventListener('click', hacerLogin);

  document
    .getElementById('btn-logout')
    .addEventListener('click', hacerLogout);

  document.getElementById('btn-detener')?.addEventListener('click', detenerEscaneo);
  // Botones dentro de la ficha (modal)
  const btnVerLecturas = document.getElementById('btn-ver-lecturas');
  if (btnVerLecturas) {
    btnVerLecturas.addEventListener('click', () => {
      if (!libroSeleccionadoId) {
        alert('Selecciona primero un ejemplar en la tabla.');
        return;
      }
      cargarLecturas(libroSeleccionadoId);
    });
  }

  const btnTerminarLectura = document.getElementById('btn-terminar-lectura');
  if (btnTerminarLectura) {
    btnTerminarLectura.addEventListener('click', terminarLecturaActual);
  }

  const btnVerPrestamos = document.getElementById('btn-ver-prestamos');
  if (btnVerPrestamos) {
    btnVerPrestamos.addEventListener('click', () => {
      if (!libroSeleccionadoId) {
        alert('Selecciona primero un ejemplar en la tabla.');
        return;
      }
      cargarPrestamos(libroSeleccionadoId);
    });
  }

  const btnMarcarDevueltoGlobal = document.getElementById(
    'btn-marcar-devuelto-global'
  );
  if (btnMarcarDevueltoGlobal) {
    btnMarcarDevueltoGlobal.addEventListener(
      'click',
      marcarPrestamoDevueltoGlobal
    );
  }

  const btnGuardarLibro = document.getElementById('btn-guardar-libro');
  if (btnGuardarLibro) {
    btnGuardarLibro.addEventListener('click', guardarLibroEditado);
  }

  const btnGuardarEjemplar = document.getElementById('btn-guardar-ejemplar');
  if (btnGuardarEjemplar) {
    btnGuardarEjemplar.addEventListener('click', guardarEjemplarEditado);
  }
  crearUIPrestamo();
  // Modal: cerrar
  const btnCerrarModal = document.getElementById('modal-ficha-cerrar');
  const backdropModal = document.getElementById('modal-ficha-backdrop');

  if (btnCerrarModal) {
    btnCerrarModal.addEventListener('click', cerrarModalFicha);
  }
  if (backdropModal) {
    backdropModal.addEventListener('click', cerrarModalFicha);
  }

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      const modal = document.getElementById('modal-ficha');
      if (modal && modal.classList.contains('is-visible')) {
        cerrarModalFicha();
        refrescarHome();
      }
    }
  });

  // Subida de portada desde fichero
const inputPortada = document.getElementById('ficha-portada-file');
if (inputPortada) {
  inputPortada.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!libroSeleccionadoId) {
      alert('Selecciona un libro antes.');
      return;
    }

    try {
      const fd = new FormData();
      fd.append('portada', file);

      const res = await fetch(`${API_BASE}/api/libros/${libroSeleccionadoId}/portada`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`, // IMPORTANTE: no pongas Content-Type con FormData
        },
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Error subiendo portada');
        return;
      }

      // actualizar imagen de la ficha (cache-busting)
      const img = document.getElementById('ficha-portada-img');
      img.src = `${urlPortadaAbsoluta(data.url_portada)}?t=${Date.now()}`;

      // refrescar tabla ejemplares para que se vea en el listado
      if (usuarioActual?.id) {
        await cargarEjemplares(usuarioActual.id);
      }
    } catch (err) {
      console.error(err);
      alert('Error de red subiendo portada');
    } finally {
      // permitir volver a subir el mismo archivo si quieres
      e.target.value = '';
    }
  });
}
  // Buscador dinámico de ejemplares
  const buscador = document.getElementById('buscador-ejemplares');
  if (buscador) {
    buscador.addEventListener('input', () => {
      const q = buscador.value.toLowerCase().trim();
      const tbody = document.querySelector('#tabla-ejemplares tbody');
      if (!tbody) return;

      const filas = tbody.querySelectorAll('tr');
      filas.forEach((tr) => {
        const textoVisible = tr.textContent.toLowerCase();
        const extra =
          (tr.dataset.libroId || '') +
          ' ' +
          (tr.dataset.ejemplarId || '') +
          ' ' +
          (tr.dataset.creadoEn || '');
        const hay = (textoVisible + ' ' + extra.toLowerCase()).includes(q);
        tr.style.display = hay ? '' : 'none';
      });
    });
  }
const tbodyEjemplares = document.querySelector('#tabla-ejemplares tbody');

if (tbodyEjemplares) {
  tbodyEjemplares.addEventListener('click', (e) => {
    const fila = e.target.closest('tr');
    if (!fila) return;

    // Selección de fila
    libroSeleccionadoId = fila.dataset.libroId ? Number(fila.dataset.libroId) : null;
    ejemplarSeleccionadoId = fila.dataset.ejemplarId ? Number(fila.dataset.ejemplarId) : null;

    tbodyEjemplares.querySelectorAll('tr').forEach((tr) =>
      tr.classList.remove('fila-seleccionada')
    );
    fila.classList.add('fila-seleccionada');

    // Si click fue en un botón de acción (aunque pinches en el <span> del icono)
    const btnLeer = e.target.closest('.btn-leer');
    const btnPrestar = e.target.closest('.btn-prestar');
    const btnEliminar = e.target.closest('.btn-eliminar');

    if (btnLeer) {
      e.stopPropagation();
      empezarLectura(btnLeer.getAttribute('data-libro-id'), btnLeer.getAttribute('data-ejemplar-id'));
      return;
    }

    if (btnPrestar) {
      e.stopPropagation();
      crearPrestamo(btnPrestar.getAttribute('data-libro-id'), btnPrestar.getAttribute('data-ejemplar-id'));
      return;
    }

    if (btnEliminar) {
      e.stopPropagation();
      eliminarEjemplar(btnEliminar.getAttribute('data-ejemplar-id'));
      return;
    }

    // Click normal en la fila => abrir modal
    mostrarFicha(fila.dataset.libroId, fila.dataset.ejemplarId);

  });
  // Click en lecturas en curso => abrir ficha
document.querySelector('#tabla-lecturas-abiertas tbody')?.addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const libroId = tr.dataset.libroId;
  const ejemplarId = tr.dataset.ejemplarId;
  mostrarFicha(tr.dataset.libroId, tr.dataset.ejemplarId);
});

// Click en préstamos activos => abrir ficha
document.querySelector('#tabla-prestamos-activos tbody')?.addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const libroId = tr.dataset.libroId;
  const ejemplarId = tr.dataset.ejemplarId;
  mostrarFicha(tr.dataset.libroId, tr.dataset.ejemplarId);
});

}
   
});
