// RJL's Zombie Hero Match - offline cache
// v7.1: cache names are namespaced (zhm-*) before deletion. v7 deleted every
// cache on the origin except its own, which wipes sibling apps hosted on the
// same GitHub Pages origin.
const CACHE = 'zhm-v7-1';
const NS = 'zhm-';
const ASSETS = [
  './',
  'index.html',
  'zombie-hero-match.html',
  'sw.js'
];
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(NS) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match('index.html'));
    })
  );
});
