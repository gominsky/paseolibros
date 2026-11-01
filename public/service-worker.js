// service-worker.js
// PaseoLibros PWA — caché offline
//
// Estrategias:
//  · /api/*        → siempre red (los datos no se cachean).
//  · /uploads/*    → cache-first (cada portada tiene nombre único, nunca cambia).
//  · Portadas externas (Google Books, Open Library…) → caché HTTP del navegador
//    (las respuestas opacas ocupan ~7 MB cada una en Cache Storage de Chrome).
//  · App (html/js/css) → stale-while-revalidate: abre al instante desde caché
//    y se actualiza en segundo plano. Ya no hace falta subir la versión a mano
//    para que el móvil reciba los cambios (basta con recargar una vez).
const CACHE_VERSION = 'paseolibros-v17';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_IMG = `${CACHE_VERSION}-img`;
const MAX_IMGS = 600;

const PRECACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/main.js',
  '/api.js',
  '/auth-ui.js',
  '/scanner.js',
  '/logo.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .catch((err) => console.warn('[SW] Precarga incompleta:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_STATIC && k !== CACHE_IMG).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

async function recortarCache(nombre, max) {
  const cache = await caches.open(nombre);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request, nombre) {
  const cache = await caches.open(nombre);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) {
    cache.put(request, res.clone()).then(() => recortarCache(nombre, MAX_IMGS)).catch(() => {});
  }
  return res;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE_STATIC);
  const hit = await cache.match(event.request, { ignoreSearch: event.request.mode === 'navigate' });
  const red = fetch(event.request)
    .then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(event.request, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(red);
    return hit;
  }
  const res = await red;
  if (res) return res;
  if (event.request.mode === 'navigate') {
    const index = await cache.match('/index.html');
    if (index) return index;
  }
  return new Response('Sin conexión', { status: 503 });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  const url = new URL(req.url);

  // Datos: siempre red
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({ error: 'Sin conexión' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
    );
    return;
  }

  // Imágenes propias (portadas subidas, logo, iconos)
  if (url.origin === self.location.origin && (req.destination === 'image' || url.pathname.startsWith('/uploads/'))) {
    event.respondWith(cacheFirst(req, CACHE_IMG).catch(() => caches.match(req)));
    return;
  }

  // App propia
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event));
  }
  // El resto (fuentes, CDN) lo gestiona el navegador con su propia caché HTTP
});
