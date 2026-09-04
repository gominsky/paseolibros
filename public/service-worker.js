// service-worker.js
// PaseoLibros PWA — caché offline básico
// Versión: actualizar este número para forzar recarga del SW
const CACHE_VERSION = 'paseolibros-v13';

// Archivos estáticos que se cachean al instalar
const CACHE_STATIC = [
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

// ── Install: cachear archivos estáticos ──────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(CACHE_STATIC).catch(err => {
        console.warn('[SW] Error cacheando algunos archivos:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: limpiar cachés antiguas ────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: estrategia por tipo de recurso ────────────────
self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith('http')) return;
  const url = new URL(event.request.url);

  // Las peticiones a la API siempre van a la red (no cachear datos)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Sin conexión' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Las portadas: network-first con fallback a caché
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copia = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copia));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Archivos estáticos: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const copia = res.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copia));
        return res;
      });
    })
  );
});
