const cacheName = 'ielts-speaking-shell-v2';
self.addEventListener('install', event => event.waitUntil(caches.open(cacheName).then(c => c.addAll(['./','./index.html','./app.js','./fflate.js']))));
self.addEventListener('activate', event => event.waitUntil(caches.delete('ielts-speaking-shell-v1')));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.registration.scope)) return;
  event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
});
