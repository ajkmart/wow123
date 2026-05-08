/* AJKMart Rider App — SW v2 (network-first, no caching) */
/* Clears all old caches on install/activate so stale assets never persist. */
/* Push-notification handlers are preserved for rider delivery alerts.      */

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
  var title = data.title || "AJKMart Rider";
  var options = {
    body: data.body || "",
    icon: "/rider/favicon.svg",
    badge: "/rider/favicon.svg",
    tag: data.tag || "ajkmart-rider",
    data: data.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var rideId = event.notification.data && event.notification.data.rideId;
  var url = rideId ? "/rider/active/" + rideId : "/rider/";
  event.waitUntil(clients.openWindow(url));
});
