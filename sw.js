self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Не трогаем трафик Google Auth и возврат после редиректа
  if (url.origin.includes("accounts.google.com") || url.pathname.includes("/__/auth/handler")) {
    return; // не respondWith — пусть браузер сам обработает
  }
});
// sw.js
const CACHE = 'od-crm-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE&&caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e=>{
  const req = e.request;
  e.respondWith(
    caches.match(req).then(cached=> cached || fetch(req).then(res=>{
      const copy = res.clone();
      caches.open(CACHE).then(c=>c.put(req, copy));
      return res;
    }).catch(()=> cached))
  );
});
