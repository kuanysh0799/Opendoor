self.addEventListener("install", e => {
  e.waitUntil(
    caches.open("opendoor-crm").then(cache => cache.addAll([
      "/", "/index.html", "/styles.css", "/app.js", "/firebase-config.js"
    ]))
  );
});
self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});
