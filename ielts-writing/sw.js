const CACHE_PREFIX = 'ielts-writing-';
const CACHE = CACHE_PREFIX + 'offline-v7';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './sync-core.js', './study-core.js',
  './data.js', './entries.json', './practice-prompts.js', './practice-records.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(url => new Request(url, {cache: 'reload'})));
    // The first offline release has no update button, so migrate it on its next refresh.
    if (await caches.has(CACHE_PREFIX + 'offline-v1')) await self.skipWaiting();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
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
    if (asset === './entries.json') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const fresh = await fetch(request, {cache: 'no-cache', signal: controller.signal});
        if (fresh.ok) {
          await cache.put(asset, fresh.clone());
          return fresh;
        }
      } catch { /* Load the last available catalog offline. */ }
      finally { clearTimeout(timeout); }
    }
    const saved = await cache.match(asset || './');
    if (saved) return saved;
    return fetch(request);
  }));
});
