// ─── 武士道 · Bushido Service Worker ───
const CACHE_NAME = 'bushido-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Noto+Serif+JP:wght@200;300;400&family=Cinzel:wght@400;500&display=swap'
];

// ─── INSTALL: cache all static assets ───
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        // Non-fatal: font CDN may fail in some environments
        console.warn('[SW] Some assets failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE: clean up old caches ───
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH: Cache-first for static, network-first for API ───
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go to network for Anthropic API calls
  if (url.hostname === 'api.anthropic.com') {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({
            error: 'Je bent offline. De samoerai adviseur heeft een verbinding nodig.'
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      )
    );
    return;
  }

  // For Google Fonts — network first, fall back to cache
  if (url.hostname.includes('fonts.')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For everything else — cache first, fall back to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cache valid responses
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ─── MESSAGE: force update from client ───
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
