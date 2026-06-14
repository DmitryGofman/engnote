/*
 * sw.js — service worker for offline + installable PWA.
 *
 * Network-first for same-origin GETs: online users always get fresh files (no
 * stale-deploy trap), and when offline we fall back to the precached app shell.
 * Cross-origin requests (e.g. the Claude API) are never intercepted or cached.
 */
const CACHE = "engnote-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/schema.js",
  "./js/storage.js",
  "./js/catalog.js",
  "./js/export.js",
  "./js/organize.js",
  "./js/ui.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return; // leave Claude API et al. alone

  e.respondWith(
    fetch(req)
      .then(function (res) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match("./index.html");
        });
      })
  );
});
