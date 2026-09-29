// Kidversa service worker — PWA installability only. Network-only: nothing is
// ever cached, so the app always reflects the latest deployment.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Purge caches left behind by earlier Workbox cache generations.
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

// Pass every request straight through (nginx/HTTP cache decides); never serve
// from Cache Storage. The fetch listener keeps the SW installable per PWA criteria.
self.addEventListener('fetch', () => { })
