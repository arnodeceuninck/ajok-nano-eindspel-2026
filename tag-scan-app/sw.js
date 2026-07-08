// ─────────────────────────────────────────────────────────────
//  AJOK TAG SCANNER — Service Worker
//  Cache-first strategy; caches app shell on install,
//  then caches every successful GET response (audio, etc.)
// ─────────────────────────────────────────────────────────────
const CACHE = 'ajok-tag-v1';

// Cache the app shell immediately on install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.add('./index.html'))
  );
  // Take control immediately without waiting for old SW to unload
  self.skipWaiting();
});

// Remove stale caches from previous versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  // Take control of all open clients immediately
  self.clients.claim();
});

// Cache-first: serve from cache if available, otherwise fetch & cache
self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith(self.location.origin)) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Only cache successful responses (skip 404s for missing audio, etc.)
        if (response.ok) {
          caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      });
    })
  );
});
