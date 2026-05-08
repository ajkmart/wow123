/* AJKMart Vendor App — SW v2 (network-first, no caching) */
/* Clears all old caches on install/activate so stale assets never persist. */
/* Push-notification handlers are preserved for vendor order alerts.        */

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Network-first: all requests go straight to the network — no caching. */
self.addEventListener("fetch", function (e) {
  e.respondWith(
    fetch(e.request).catch(function () {
      return new Response("Offline", { status: 503 });
    })
  );
});

self.addEventListener("push", function (event) {
  var data = event.data ? event.data.json() : {};
  var title = data.title || "AJKMart Vendor";
  var options = {
    body: data.body || "",
    icon: "/vendor/favicon.svg",
    badge: "/vendor/favicon.svg",
    tag: data.tag || "ajkmart-vendor",
    data: data.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow("/vendor/"));
});
