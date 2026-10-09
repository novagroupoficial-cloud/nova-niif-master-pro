// NOVA NIIF MASTER PRO — Service Worker v8
// Cambia CACHE_VERSION en cada publicación para que los usuarios reciban la nueva versión.
const CACHE_VERSION = 'nova-niif-v8.4-2026-10-06';
const PRECACHE = ['/', '/index.html', '/app.html', '/manifest.json', '/updates.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Nunca cachear el consultor ni peticiones que no sean GET
  if (req.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;
  if (url.origin !== self.location.origin) return;

  // Red primero (contenido siempre actualizado); si no hay conexión, usa la copia guardada
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match(url.pathname.startsWith('/app') ? '/app.html' : '/index.html') : undefined)))
  );
});
