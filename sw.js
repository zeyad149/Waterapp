/* Simple offline cache for Water Tracker.
 * Bump CACHE when any cached asset changes to force an update. */
var CACHE = "water-tracker-v2";
var ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  // Network-first for navigations (so ?add= params always run fresh),
  // cache-first for static assets.
  var isNav = e.request.mode === "navigate";
  if (isNav) {
    e.respondWith(
      fetch(e.request).catch(function () { return caches.match("./index.html"); })
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(function (r) { return r || fetch(e.request); })
    );
  }
});
