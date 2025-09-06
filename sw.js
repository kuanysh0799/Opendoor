// sw.js — cache app shell
const CACHE = 'odcrm-v1';
const ASSETS = [
  '/', '/index.html', '/styles.css', '/app.js', '/firebase-config.js', '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/logo.png'
];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=> k!==CACHE ? caches.delete(k):null))));
});
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if (ASSETS.includes(url.pathname) || url.origin===location.origin){
    e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request).then(res=>{
      const copy = res.clone();
      caches.open(CACHE).then(c=> c.put(e.request, copy));
      return res;
    }).catch(()=>caches.match('/index.html'))));
  }
});
