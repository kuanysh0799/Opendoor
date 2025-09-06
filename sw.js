self.addEventListener('install', e=>{
  self.skipWaiting();
  e.waitUntil(caches.open('od-pretty-v1').then(c=>c.addAll(['./','./index.html','./styles.css','./app.js','./firebase-config.js','./manifest.webmanifest'])));
});
self.addEventListener('activate', e=> self.clients.claim());
self.addEventListener('fetch', e=>{
  e.respondWith(
    caches.match(e.request).then(r=> r || fetch(e.request).then(resp=>{
      const copy = resp.clone();
      caches.open('od-pretty-v1').then(c=>c.put(e.request, copy));
      return resp;
    }).catch(()=>caches.match('./index.html')))
  );
});
