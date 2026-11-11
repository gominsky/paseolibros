// auth-ui.js (global, sin modules)

// UI auth
window.actualizarUIAutenticacion = function actualizarUIAutenticacion() {
  const loginModal = document.getElementById('login-modal');
  const userBar = document.getElementById('user-bar');
  const nombreSpan = document.getElementById('nombre-usuario-actual');

  // Sesión válida = hay token, no ha caducado, hay usuario Y el servidor la ha confirmado
  const tokenVigente = Boolean(window.token && window.usuarioActual?.id &&
    !(window.tokenCaducado && window.tokenCaducado(window.token)));
  const loggedIn = tokenVigente && window.sesionVerificada === true;
  const comprobando = tokenVigente && !window.sesionVerificada;
  document.body.classList.toggle('sin-sesion', !loggedIn);

  // Dentro del cuadro: «Comprobando tu sesión…» o el formulario de acceso
  const zonaLogin = document.getElementById('zona-no-autenticado');
  const zonaComprobando = document.getElementById('auth-comprobando');
  if (zonaLogin) zonaLogin.hidden = comprobando;
  if (zonaComprobando) zonaComprobando.hidden = !comprobando;

  // Modal de login + barra superior
  if (loginModal) loginModal.style.display = loggedIn ? 'none' : 'flex';
  if (userBar) userBar.style.display = loggedIn ? 'flex' : 'none';
  if (nombreSpan) nombreSpan.textContent = loggedIn ? (window.usuarioActual?.nombre_usuario || '') : '';

  // Mensaje ejemplares
  const info = document.getElementById('info-ejemplares');
  if (info) info.textContent = loggedIn ? 'Tus ejemplares:' : 'Inicia sesión para ver tu biblioteca.';

  // Si logueado: dispara cargas (estas funciones ya existen en main.js)
  if (loggedIn) {
    // El buscador siempre empieza vacío (evita que quede el usuario autorrellenado)
    const buscador = document.getElementById('buscador-ejemplares');
    if (buscador && buscador.value) {
      buscador.value = '';
      if (typeof ejemplaresQuery !== 'undefined') ejemplaresQuery = ''; // variable global de core.js
    }
    if (window.usuarioActual?.id && window.cargarEjemplares) window.cargarEjemplares(window.usuarioActual.id);
    if (window.cargarLecturasAbiertas) window.cargarLecturasAbiertas();
    if (window.cargarPrestamosActivos) window.cargarPrestamosActivos();
    if (window.cargarEstadisticasLecturas) window.cargarEstadisticasLecturas();
    return;
  }

  // Si no logueado: borrar de pantalla TODOS los datos del usuario anterior
  if (window.limpiarDatosUsuario) window.limpiarDatosUsuario();
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
};

window.hacerLogin = async function hacerLogin() {
  const usuarioInput = document.getElementById('login-usuario');
  const passInput = document.getElementById('login-contrasena');
  const mensaje = document.getElementById('login-mensaje');

  const nombre_usuario = (usuarioInput?.value || '').trim();
  const contrasena = (passInput?.value || '').trim();

  if (!nombre_usuario || !contrasena) {
    if (mensaje) mensaje.textContent = 'Introduce usuario y contraseña';
    return;
  }

  try {
    const res = await fetch(`${window.API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_usuario, contrasena })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (mensaje) mensaje.textContent = data.error || 'Error en el login';
      return;
    }

    window.token = data.token ?? null;
    window.usuarioActual = data.usuario ?? null;
    window.sesionVerificada = Boolean(window.token); // recién emitido por el servidor

    if (!window.token || !window.usuarioActual) {
      if (mensaje) mensaje.textContent = 'Respuesta inesperada del servidor. Inténtalo de nuevo.';
      return;
    }

    window.saveSession();

    if (mensaje) mensaje.textContent = '';
    if (usuarioInput) usuarioInput.value = '';
    if (passInput) passInput.value = '';

    window.actualizarUIAutenticacion();
    if (window.setUserStatusOk) window.setUserStatusOk('Sesión iniciada');
  } catch (err) {
    console.error(err);
    if (mensaje) mensaje.textContent = 'Error de red en el login';
  }
};

window.hacerLogout = function hacerLogout() {
  window.token = null;
  window.usuarioActual = null;
  window.sesionVerificada = false;

  try {
    localStorage.removeItem(window.TOKEN_KEY);
    localStorage.removeItem(window.USER_KEY);
  } catch {}

  window.actualizarUIAutenticacion();
  if (window.setUserStatus) window.setUserStatus('Sesión cerrada');

  const mensaje = document.getElementById('login-mensaje');
  if (mensaje) mensaje.textContent = 'Sesión cerrada';
};
