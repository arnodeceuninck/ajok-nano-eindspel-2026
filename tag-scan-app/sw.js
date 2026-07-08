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

// Cache-first: serve from cache if available, otherwise fetch & cache.
// Audio elements send range requests (Range: bytes=X-Y). These won't match
// the full cached response, so we detect them, look up the cached full body
// by URL, and return a proper 206 Partial Content slice.
self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith(self.location.origin)) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(handleFetch(event.request));
});

async function handleFetch(request) {
  const rangeHeader = request.headers.get('Range');

  if (rangeHeader) {
    // Look up the non-range (full) cached entry by bare URL
    const cached = await caches.match(new Request(request.url));
    if (cached) return serveRange(cached, rangeHeader);
    // Not cached yet — let the network handle it
    return fetch(request);
  }

  // Standard cache-first for non-range requests
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // Only cache successful responses (skip 404s for missing audio, etc.)
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

// Slice a full cached Response to satisfy a Range request, returning 206.
async function serveRange(fullResponse, rangeHeader) {
  const buffer = await fullResponse.arrayBuffer();
  const total  = buffer.byteLength;

  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) return new Response(buffer, { status: 200 });

  const start = match[1] !== '' ? parseInt(match[1], 10) : 0;
  const end   = match[2] !== '' ? parseInt(match[2], 10) : total - 1;
  const clampedEnd = Math.min(end, total - 1);

  const chunk = buffer.slice(start, clampedEnd + 1);
  return new Response(chunk, {
    status: 206,
    headers: {
      'Content-Type':  fullResponse.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${clampedEnd}/${total}`,
      'Content-Length': String(clampedEnd - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
