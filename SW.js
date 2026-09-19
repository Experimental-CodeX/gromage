/* =====================================================================
   GROMAGE — service worker

   Two jobs:
     1. Android will only offer "Install app" if a service worker with a
        fetch handler is registered. This is that.
     2. Keep a copy of the app itself, so opening it with no signal shows
        the interface and a clear message rather than a blank page.

   Deliberately conservative. Only same-origin GET requests are touched.
   Supabase, Open Food Facts and the CDN scripts always go straight to
   the network, so nothing stale is ever served for your actual data.

   Strategy is network-first: a fresh copy wins whenever there is a
   connection, and the cache is only a fallback. That matters because
   updating this app means uploading a new index.html — cache-first
   would leave you staring at the old version.

   After changing anything here, bump CACHE_NAME.
   ===================================================================== */

const CACHE_NAME = "gromage-v1";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

// Store the shell as soon as the worker installs.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // Individually, so one missing file cannot fail the whole install.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

// Throw away caches from older versions.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Never interfere with writes.
  if (request.method !== "GET") return;

  // Never interfere with Supabase, Open Food Facts, fonts or the CDNs.
  let url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Keep a copy of anything good that comes back.
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((hit) =>
          hit || (request.mode === "navigate" ? caches.match("./index.html") : undefined)
        )
      )
  );
});
