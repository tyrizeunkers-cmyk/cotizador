// Service worker: permite instalar la app y abrirla rápido.
// Archivos propios: primero red (para recibir actualizaciones), si no hay internet usa la copia guardada.
// Las llamadas a Supabase nunca se guardan en caché.
const CACHE = 'cotizador-v1';
const ARCHIVOS = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js', 'js/db.js', 'js/pdf.js', 'js/calc.js', 'js/empresas.js', 'js/config.js',
  'vendor/pdf-lib.min.js',
  'assets/km-logo.png', 'assets/dk-logo.png', 'assets/dk-banner.jpg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
