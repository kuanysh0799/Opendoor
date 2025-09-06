self.addEventListener("install", e => {
  e.waitUntil(caches.open("od-crm").then(c => c.addAll(["/", "/index.html", "/styles.css", "/app.js", "/firebase-config.js"])));
});
self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});