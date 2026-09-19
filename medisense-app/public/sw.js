// MediSense service worker — basic offline support.
//
// Strategy: network-first for navigations (so people always get the latest
// app shell when online), falling back to the last cached shell when
// offline. Static assets (the hashed JS/CSS chunks Vite produces) are
// cached the first time they're fetched, then served cache-first, since
// their filenames change whenever their contents do.
//
// This is intentionally simple — no precache manifest, no background sync,
// no push notifications. It means "reopen the app you already used" works
// without a network connection; it does not mean every screen or every
// piece of data is guaranteed available offline (data sync with a signed-in
// account still needs the network).

const CACHE_NAME = "medisense-cache-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never cache third-party requests (fonts CDN, API calls, etc.)
  if (url.pathname.startsWith("/api/")) return; // never cache backend API responses

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put("/", res.clone())).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, res.clone())).catch(() => {});
          return res;
        })
        .catch(() => cached);
    })
  );
});
