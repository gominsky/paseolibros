// api.js (global, sin modules)

// Base API (misma idea que en el paso 2)
const isDev =
  ['localhost', '127.0.0.1'].includes(window.location.hostname) ||
  window.location.protocol === 'file:';

window.API_BASE = isDev ? 'http://localhost:3011' : (window.__API_BASE__ ?? '');

// Sesión
window.TOKEN_KEY = 'paseolibros_token';
window.USER_KEY  = 'paseolibros_usuario';

window.token = null;
window.usuarioActual = null;

// Headers estándar
window.getHeaders = function getHeaders(json = true) {
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';

  if (window.token) {
    headers['Authorization'] = `Bearer ${window.token}`;
    headers['X-Access-Token'] = window.token;
    headers['Authorization-Token'] = window.token;
  }
  return headers;
};

// Manejo 401 central
window.handleUnauthorized = function handleUnauthorized() {
  // Estas funciones existen en main.js hoy
  if (window.setUserStatusErr) window.setUserStatusErr('La sesión ha caducado, vuelve a iniciar sesión.');

  window.token = null;
  window.usuarioActual = null;
  try {
    localStorage.removeItem(window.TOKEN_KEY);
    localStorage.removeItem(window.USER_KEY);
  } catch {}

  // Limpiezas UI (si existen)
  const infoStats = document.getElementById('stats-lecturas-info');
  const tbodyStats = document.getElementById('tabla-stats-lecturas');
  if (infoStats) infoStats.textContent = 'Inicia sesión para ver tus estadísticas.';
  if (tbodyStats) tbodyStats.innerHTML = '';

  if (window.actualizarUIAutenticacion) window.actualizarUIAutenticacion();
};

// Restore sesión (al cargar)
window.restoreSession = function restoreSession() {
  try {
    const t = localStorage.getItem(window.TOKEN_KEY);
    const u = localStorage.getItem(window.USER_KEY);
    window.token = t || null;
    window.usuarioActual = u ? JSON.parse(u) : null;
  } catch {
    window.token = null;
    window.usuarioActual = null;
  }
};

// Guardar sesión (tras login)
window.saveSession = function saveSession() {
  try {
    localStorage.setItem(window.TOKEN_KEY, window.token || '');
    localStorage.setItem(window.USER_KEY, JSON.stringify(window.usuarioActual || {}));
  } catch {}
};

// Fetch helper opcional (por si lo quieres usar luego)
window.apiFetch = async function apiFetch(path, opts = {}) {
  const url = `${window.API_BASE}${path}`;
  const res = await fetch(url, opts);

  if (res.status === 401) {
    window.handleUnauthorized();
  }
  return res;
};
