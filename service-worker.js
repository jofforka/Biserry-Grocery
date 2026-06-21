const CACHE_NAME = "biserry-groceries-v1";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./cart.html",
  "./css/styles.css",
  "./js/store.js",
  "./js/checkout.js",
  "./js/firebase-config.js",
  "./js/firebase-service.js",
  "./assets/logo.png",
  "./assets/hero-banner.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone)).catch(() => null);
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
