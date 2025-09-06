// sw.js — безопасный для GitHub Pages /Opendoor/
const CACHE = 'opendoor-crm-v2';

// База (например "/Opendoor/")
const BASE = self.registration.scope.replace(self.location.origin, ''); // всегда заканчивается "/"

const toRel = p => BASE + p; // собираем относительные URL внутри подпути

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll([
        toRel('index.html'),
        toRel('styles.css'),
        toRel('app.js'),
        toRel('firebase-config.js'),
        toRel('manifest.webmanifest'),
        toRel('icon-192.png'),
        toRel('icon-512.png')
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;

  // Для навигации (переходы по страницам) отдаём наш index.html в пределах подпути
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match(toRel('index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(r => r || fetch(req))
  );
});
