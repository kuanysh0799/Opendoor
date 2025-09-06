// sw.js — PWA cache, исключаем Google OAuth
const CACHE = 'od-amo-fix2-v1';
const ASSETS = [
  './','./index.html','./styles.css','./app.js','./firebase-config.js',
  './manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'
];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if (url.origin.includes('accounts.google.com') || url.pathname.includes('/__/auth/handler')) return;
  if (e.request.mode === 'navigate') { e.respondWith(fetch(e.request).catch(()=>caches.match('./index.html'))); return; }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
