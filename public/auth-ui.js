// auth-ui.js (global, sin modules)

// UI auth
window.actualizarUIAutenticacion = function actualizarUIAutenticacion() {
  const loginModal = document.getElementById('login-modal');
  const userBar = document.getElementById('user-bar');
  const nombreSpan = document.getElementById('nombre-usuario-actual');

  const loggedIn = Boolean(window.token && window.usuarioActual);

  // Modal de login + barra superior
  if (loginModal) loginModal.style.display = loggedIn ? 'none' : 'flex';
  if (userBar) userBar.style.display = loggedIn ? 'flex' : 'none';
  if (nombreSpan) nombreSpan.textContent = loggedIn ? (window.usuarioActual?.nombre_usuario || '') : '';

  // Mensaje ejemplares
  const info = document.getElementById('info-ejemplares');
  if (info) info.textContent = loggedIn ? 'Tus ejemplares:' : 'Inicia sesión para ver tu biblioteca.';

  // Si logueado: dispara cargas (estas funciones ya existen en main.js)
  if (loggedIn) {
    if (window.usuarioActual?.id && window.cargarEjemplares) window.cargarEjemplares(window.usuarioActual.id);
    if (window.cargarLecturasAbiertas) window.cargarLecturasAbiertas();
    if (window.cargarPrestamosActivos) window.cargarPrestamosActivos();
    if (window.cargarEstadisticasLecturas) window.cargarEstadisticasLecturas();
    return;
  }

  // Si no logueado: limpiar tablas
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

    window.token = data.token || data.access_token || data.jwt || null;
    window.usuarioActual = data.usuario || data.user || null;

    window.saveSession();

    if (mensaje) mensaje.textContent = 'Login correcto ✅';
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

  try {
    localStorage.removeItem(window.TOKEN_KEY);
    localStorage.removeItem(window.USER_KEY);
  } catch {}

  window.actualizarUIAutenticacion();
  if (window.setUserStatus) window.setUserStatus('Sesión cerrada');

  const mensaje = document.getElementById('login-mensaje');
  if (mensaje) mensaje.textContent = 'Sesión cerrada';
};
