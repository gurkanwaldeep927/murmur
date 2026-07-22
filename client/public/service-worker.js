/* Murmur PWA service worker (installability + app-shell caching).
   The OFFLINE WRITE QUEUE (background sync of queued questions/answers/votes) is
   plan milestone M4 (T28) — it plugs into this worker's `sync`/`message` handlers
   then. M1 only needs installability + a cached app shell, so the tracer PWA is
   installable on a real phone (demo criterion). No UGC caching logic here yet. */

const SHELL_CACHE = "murmur-shell-v1";
const SHELL_ASSETS = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Never cache API calls — always hit the network (moderation/identity are dynamic).
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname.startsWith("/verification") ||
      url.pathname.startsWith("/events") || url.pathname.startsWith("/questions") ||
      url.pathname.startsWith("/reports") || url.pathname.startsWith("/sync")) {
    return; // default network handling
  }
  // App-shell: cache-first for navigations/static assets.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  );
});
