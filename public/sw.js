/*
 * Offline shell for the installed web app.
 *
 * Strategy is stale-while-revalidate: the cached copy is served immediately so
 * the game starts instantly and works with no signal, while a fresh copy is
 * fetched in the background and picked up on the next launch. That avoids
 * having to bump a version string on every build.
 */
const CACHE = "penitence-shell-v1";

const SHELL = [
  "./",
  "./index.html",
  "./game.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // A single missing entry must not fail the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      // Navigations fall back to the cached shell when offline.
      if (!cached && request.mode === "navigate") {
        return network.catch(() => caches.match("./index.html"));
      }
      return cached || network;
    }),
  );
});
