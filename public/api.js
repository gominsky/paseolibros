// api.js — configuración de la API y gestión de la sesión (global, sin módulos)
//
// Reglas de sesión:
//  · Al arrancar, un token guardado solo se usa si NO ha caducado (se mira la fecha
//    que lleva dentro el propio token, sin esperar al servidor).
//  · La app NO se muestra hasta que el servidor confirma la sesión
//    (GET /api/auth/sesion). Mientras, el cuadro de login dice «Comprobando tu sesión…».
//    Si responde 401 (firmado con otro secreto, usuario borrado…) se pide login.
//    Sin conexión: mensaje y botón Reintentar; nunca se enseña la app sin confirmar.
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
window.sesionVerificada = false; // true solo tras login o tras confirmarla con el servidor

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
  window.sesionVerificada = false;
  borrarSesionGuardada();

  if (!habiaSesion) {
    if (window.actualizarUIAutenticacion) window.actualizarUIAutenticacion();
    return; // ya estaba cerrada: evita repetir avisos
  }

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
    window.sesionVerificada = false; // pendiente de confirmar con el servidor
    return true;
  } catch {
    borrarSesionGuardada();
    window.token = null;
    window.usuarioActual = null;
    return false;
  }
};

// Texto y botón Reintentar del estado «Comprobando tu sesión…»
function estadoComprobando(texto, reintentar = false) {
  const t = document.getElementById('auth-comprobando-texto');
  const b = document.getElementById('btn-auth-reintentar');
  if (t) t.textContent = texto;
  if (b) b.hidden = !reintentar;
  document.getElementById('auth-comprobando')?.classList.toggle('con-error', reintentar);
}

// Confirma con el servidor que el token sigue siendo válido.
//  · Al arrancar (normal): la app sigue oculta hasta tener respuesta.
//  · silencioso: comprobación en segundo plano con la app ya abierta (al volver a ella);
//    solo actúa si el servidor dice que la sesión no vale (lo hace el interceptor de 401).
let verificando = null;
window.verificarSesion = function verificarSesion({ silencioso = false } = {}) {
  if (!window.token) return Promise.resolve(false);
  if (verificando) return verificando;

  if (!silencioso) {
    estadoComprobando('Comprobando tu sesión…');
    if (window.actualizarUIAutenticacion) window.actualizarUIAutenticacion();
  }
  // Render en plan gratuito tarda en despertar: avisarlo para que no parezca colgado
  const aviso = silencioso ? null : setTimeout(() => {
    estadoComprobando('El servidor se está despertando, puede tardar hasta un minuto…');
  }, 4000);

  verificando = (async () => {
    try {
      const res = await fetch(`${window.API_BASE}/api/auth/sesion`, {
        headers: window.getHeaders(false),
        signal: AbortSignal.timeout(90 * 1000),
      });
      if (res.status === 401) return false; // el interceptor ya ha cerrado la sesión
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!window.token) return false;     // se cerró sesión mientras tanto
      if (data?.usuario?.id !== window.usuarioActual?.id) {
        window.handleUnauthorized('Vuelve a iniciar sesión.');
        return false;
      }
      window.usuarioActual = { ...window.usuarioActual, ...data.usuario };
      window.saveSession();
      const eraPendiente = !window.sesionVerificada;
      window.sesionVerificada = true;
      if (eraPendiente && window.actualizarUIAutenticacion) window.actualizarUIAutenticacion();
      return true;
    } catch {
      // Sin conexión o servidor caído: no se enseña la app sin confirmar la sesión
      if (!silencioso && window.token && !window.sesionVerificada) {
        estadoComprobando('No se puede conectar con el servidor. Comprueba tu conexión.', true);
      }
      return false;
    } finally {
      clearTimeout(aviso);
      verificando = null;
    }
  })();
  return verificando;
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
  // Al volver a la app (p. ej. tras días en segundo plano)
  if (window.token) window.verificarSesion({ silencioso: window.sesionVerificada });
});
// Si se cierra sesión en otra pestaña, cerrar también aquí
window.addEventListener('storage', (e) => {
  if (e.key === window.TOKEN_KEY && !e.newValue && window.token) window.handleUnauthorized('Has cerrado sesión en otra pestaña.');
});

// Fetch helper (se mantiene por compatibilidad)
window.apiFetch = async function apiFetch(path, opts = {}) {
  return fetch(`${window.API_BASE}${path}`, opts);
};
