const CACHE_PREFIX = 'ielts-writing-';
const CACHE = CACHE_PREFIX + 'offline-v1';
const ASSETS = ['./', './index.html', './style.css', './app.js', './sync-core.js', './study-core.js', './data.js', './entries.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(
    ASSETS.map(url => new Request(url, {cache: 'reload'}))
  )));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const {request} = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin
    || !url.href.startsWith(self.registration.scope)) return;
  const asset = ASSETS.find(path => new URL(path, self.registration.scope).pathname === url.pathname);
  if (!asset && request.mode !== 'navigate') return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const saved = await cache.match(asset || './');
    if (saved) return saved;
    return fetch(request);
  }));
});
