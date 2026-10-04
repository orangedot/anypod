const CACHE_NAME = 'anypod-v9';
const AUDIO_CACHE_NAME = 'anypod-audio-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png'
];

let cachedAudioUrls = new Set();

async function refreshAudioCacheKeys() {
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const keys = await cache.keys();
    cachedAudioUrls = new Set(keys.map(k => k.url));
  } catch (_) {}
}

refreshAudioCacheKeys();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== AUDIO_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => refreshAudioCacheKeys())
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_AUDIO_CACHE') {
    refreshAudioCacheKeys();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Audio handling:
  // - Cached offline audio must be served from cache (even for cross-origin URLs)
  // - ALL live online audio streams MUST bypass the Service Worker completely!
  //   Returning without calling event.respondWith lets the native browser engine stream
  //   directly. This prevents OS background sleep from killing the connection after 30-90s.
  const isAudioRequest = req.headers.get('range') ||
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.m4a') ||
    url.pathname.endsWith('.aac') ||
    url.pathname.endsWith('.ogg') ||
    url.pathname.endsWith('.wav') ||
    req.destination === 'audio';

  if (isAudioRequest) {
    const isCachedOffline = url.searchParams.has('offline') || cachedAudioUrls.has(req.url);
    if (isCachedOffline) {
      event.respondWith(handleCachedAudioRequest(req));
      return;
    }
    // Live streaming audio: ALWAYS bypass the Service Worker completely!
    return;
  }

  // 2. Only handle same-origin requests for static app shell assets
  // Cross-origin requests (e.g. iTunes, CDN images, external APIs) must bypass the SW!
  if (url.origin !== self.location.origin) {
    return;
  }

  // 3. API requests bypass the SW
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(handleStaticRequest(req));
});

async function handleCachedAudioRequest(req) {
  try {
    const audioCache = await caches.open(AUDIO_CACHE_NAME);
    const cachedResponse = await audioCache.match(req.url);
    if (cachedResponse) {
      return servePartialAudio(req, cachedResponse);
    }
    return await fetch(req);
  } catch (err) {
    return new Response(null, { status: 504, statusText: 'Gateway Timeout (Offline)' });
  }
}

async function servePartialAudio(req, cachedResponse) {
  const rangeHeader = req.headers.get('range');
  if (!rangeHeader) {
    return cachedResponse;
  }

  const blob = await cachedResponse.blob();
  const total = blob.size;
  const parts = rangeHeader.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10) || 0;
  const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
  const boundedEnd = Math.min(end, total - 1);
  const chunk = blob.slice(start, boundedEnd + 1);

  return new Response(chunk, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cachedResponse.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${boundedEnd}/${total}`,
      'Content-Length': String(chunk.size),
      'Accept-Ranges': 'bytes'
    }
  });
}

async function handleStaticRequest(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);

  try {
    const networkResponse = await fetch(req);
    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
      cache.put(req, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const fallback = await cache.match('/') || await cache.match('/index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}
