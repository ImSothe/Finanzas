/* Service worker: la app abre al instante y sin cobertura. Nunca intercepta la hoja de Google ni la API de Gemini. */
const CACHE = 'finanzas-v2';
const SHELL = ['./', './index.html', './core.js', './app.js', './pc.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;       // Apps Script, Gemini, etc.: red directa
  if (url.pathname.endsWith('/exec') || url.pathname.includes('/gemini/')) return;  // servidor de pruebas local
  // red primero para el HTML/JS (siempre la versión nueva si hay conexión); caché si no la hay
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
