/* AJKMart Admin — SW v5 (minimal kill-switch) */
/* Install: clear ALL caches immediately, then skip waiting to take over. */
self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

/* Activate: clear caches again, claim all clients.
   NO fetch handler → every request falls straight through to the network. */
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* No fetch handler on purpose — browser goes directly to network for everything. */
