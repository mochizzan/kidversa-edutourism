const CACHE_NAME = 'kidversa-v1';

// Precache manifest: all SPA routes → index.html (same file for all routes in Vite SPA)
const PRECACHE_ROUTES = [
  '/',
  '/auth/login',
  '/auth/register',
  '/admin/dashboard',
  '/admin/programs',
  '/admin/sessions',
  '/admin/content',
  '/admin/frames',
  '/admin/users',
  '/fasilitator/dashboard',
  '/fasilitator/activities',
  '/parent/dashboard',
  '/parent/stories',
];

// Core static assets to precache
const PRECACHE_ASSETS = [
  '/index.html',
  '/favicon.svg',
  '/logo.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/manifest.webmanifest',
];

// Install: precache all routes and core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const allPrecache = [...PRECACHE_ROUTES, ...PRECACHE_ASSETS];
      console.log('[SW] Precaching', allPrecache.length, 'items');
      return cache.addAll(allPrecache).catch((err) => {
        console.warn('[SW] Precache partially failed (offline?):', err);
        // Don't fail install — SW activates with whatever succeeded
      });
    })
  );
  // Take control immediately
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Claim all open clients immediately
  self.clients.claim();
});

// Fetch: network-first strategy with cache fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API calls: network-only (pass-through), never cache
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Google Fonts: network-first with cache fallback
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Navigation requests (page loads): network-first → cache → offline.html
  if (request.mode === 'navigate') {
    event.respondWith(navigationFirst(request));
    return;
  }

  // Static assets (JS, CSS, images, fonts): network-first with cache fallback
  event.respondWith(networkFirst(request));
});

// Navigation-first: for SPA page loads
async function navigationFirst(request) {
  try {
    const networkResponse = await fetch(request);
    // Cache successful navigation responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Network failed — try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;

    // No cache — serve offline fallback
    const offlineResponse = await caches.match('/offline.html');
    if (offlineResponse) return offlineResponse;

    // Last resort: offline fallback not cached either
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

// Network-first: for static assets and fonts
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Network failed — try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;

    // Not cached and offline
    return new Response('', { status: 503 });
  }
}
