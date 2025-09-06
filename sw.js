const CACHE = 'od-crm-v1';
const ASSETS = [
  './','./index.html','./styles.css','./app.js','./firebase-config.js',
  './icon-192.png','./icon-512.png','./apple-touch-icon.png','./manifest.webmanifest'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method!=='GET'){ return; }
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(r=>{
      const copy = r.clone();
      caches.open(CACHE).then(c=>c.put(req, copy));
      return r;
    }).catch(()=> cached || new Response('',{status:504})))
  );
});
