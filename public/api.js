// api.js — configuración de la API y gestión de la sesión (global, sin módulos)
//
// Reglas de sesión:
//  · Al arrancar, un token guardado solo se usa si NO ha caducado (se mira la fecha
//    que lleva dentro el propio token, sin esperar al servidor).
//  · Después se confirma con el servidor (GET /api/auth/sesion). Si responde 401
//    (caducado, firmado con otro secreto, usuario borrado) se pide login.
//  · CUALQUIER respuesta 401 de la API, venga de donde venga, pide login.
//  · Si la sesión caduca con la app abierta (o al volver a ella), se pide login.

const isDev =
  ['localhost', '127.0.0.1'].includes(window.location.hostname) ||
  window.location.protocol === 'file:';

window.API_BASE = isDev ? 'http://localhost:3011' : (window.__API_BASE__ ?? '');

// Sesión
window.TOKEN_KEY = 'paseolibros_token';
window.USER_KEY  = 'paseolibros_usuario';

window.token = null;
window.usuarioActual = null;

// ---------- Utilidades del token ----------
// Lee la fecha de caducidad (exp) del JWT. No valida la firma: eso lo hace el servidor.
function expiracionToken(t) {
  try {
    const payload = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const datos = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return typeof datos.exp === 'number' ? datos.exp * 1000 : null;
  } catch {
    return 0; // token ilegible = caducado
  }
}

window.tokenCaducado = function tokenCaducado(t = window.token) {
  if (!t) return true;
  const exp = expiracionToken(t);
  if (exp === null) return false;           // sin fecha: decide el servidor
  return exp - 30 * 1000 <= Date.now();     // 30 s de margen
};

function borrarSesionGuardada() {
  try {
    localStorage.removeItem(window.TOKEN_KEY);
    localStorage.removeItem(window.USER_KEY);
  } catch {}
}

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

// ---------- Cerrar sesión por caducidad / token no válido ----------
window.handleUnauthorized = function handleUnauthorized(mensaje = 'La sesión ha caducado. Vuelve a iniciar sesión.') {
  const habiaSesion = Boolean(window.token);

  window.token = null;
  window.usuarioActual = null;
  borrarSesionGuardada();

  if (!habiaSesion) return; // ya estaba cerrada: evita repetir avisos

  try { window.Scanner?.stop(); } catch {}

  // Cerrar modales abiertos para que el login quede a la vista
  document.querySelectorAll('.modal').forEach((m) => { m.style.display = 'none'; });
  document.body.classList.remove('alta-visible', 'modal-open');

  const infoStats = document.getElementById('stats-lecturas-info');
  const tbodyStats = document.getElementById('tabla-stats-lecturas');
  if (infoStats) infoStats.textContent = 'Inicia sesión para ver tus estadísticas.';
  if (tbodyStats) tbodyStats.innerHTML = '';

  if (window.actualizarUIAutenticacion) window.actualizarUIAutenticacion();

  const msg = document.getElementById('login-mensaje');
  if (msg) msg.textContent = mensaje;
};

// ---------- Cualquier 401 de la API pide login ----------
// Envuelve fetch una sola vez: así también lo cumplen las partes de la app
// que no comprueban el 401 por su cuenta.
(function interceptar401() {
  if (window.__fetch401) return;
  const fetchOriginal = window.fetch.bind(window);
  const RUTAS_LIBRES = /\/api\/(auth\/(login|register|forgot-password|reset-password)|share\/|health)/;

  window.fetch = async function (recurso, opciones) {
    const res = await fetchOriginal(recurso, opciones);
    try {
      const url = typeof recurso === 'string' ? recurso : recurso?.url || '';
      if (res.status === 401 && url.includes('/api/') && !RUTAS_LIBRES.test(url) && window.token) {
        window.handleUnauthorized();
      }
    } catch {}
    return res;
  };
  window.__fetch401 = true;
})();

// ---------- Restaurar sesión al cargar ----------
window.restoreSession = function restoreSession() {
  try {
    const t = localStorage.getItem(window.TOKEN_KEY);
    const u = localStorage.getItem(window.USER_KEY);
    const usuario = u ? JSON.parse(u) : null;

    if (!t || !usuario?.id || window.tokenCaducado(t)) {
      // Nada guardado, incompleto o caducado: empezar sin sesión
      if (t || u) borrarSesionGuardada();
      window.token = null;
      window.usuarioActual = null;
      return false;
    }

    window.token = t;
    window.usuarioActual = usuario;
    return true;
  } catch {
    borrarSesionGuardada();
    window.token = null;
    window.usuarioActual = null;
    return false;
  }
};

// Confirma con el servidor que el token sigue siendo válido.
// Un 401 lo gestiona el interceptor; sin conexión se mantiene la sesión local.
window.verificarSesion = async function verificarSesion() {
  if (!window.token) return false;
  try {
    const res = await fetch(`${window.API_BASE}/api/auth/sesion`, { headers: window.getHeaders(false) });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.usuario?.id && window.usuarioActual?.id === data.usuario.id) {
      window.usuarioActual = { ...window.usuarioActual, ...data.usuario };
      window.saveSession();
    }
    return true;
  } catch {
    return false;
  }
};

// Guardar sesión (tras login)
window.saveSession = function saveSession() {
  try {
    localStorage.setItem(window.TOKEN_KEY, window.token || '');
    localStorage.setItem(window.USER_KEY, JSON.stringify(window.usuarioActual || {}));
  } catch {}
};

// ---------- Vigilar caducidad con la app abierta ----------
function comprobarCaducidad() {
  if (window.token && window.tokenCaducado()) window.handleUnauthorized();
}
setInterval(comprobarCaducidad, 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !window.token) return;
  comprobarCaducidad();
  if (window.token) window.verificarSesion(); // al volver a la app (p. ej. tras días en segundo plano)
});
// Si se cierra sesión en otra pestaña, cerrar también aquí
window.addEventListener('storage', (e) => {
  if (e.key === window.TOKEN_KEY && !e.newValue && window.token) window.handleUnauthorized('Has cerrado sesión en otra pestaña.');
});

// Fetch helper (se mantiene por compatibilidad)
window.apiFetch = async function apiFetch(path, opts = {}) {
  return fetch(`${window.API_BASE}${path}`, opts);
};
