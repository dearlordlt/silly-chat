// Minimal service worker: enough for PWA installability, deliberately NO caching —
// the app is useless offline (it's a chat), and stale-cache bugs after deploys are
// worse than a plain browser error page.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // no respondWith: everything falls through to the network untouched
})
