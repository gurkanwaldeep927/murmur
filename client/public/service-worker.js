/* Murmur PWA app-shell caching (T28).
   The profile-scoped outbox is drained by the signed-in client, not by this
   worker: replaying a write requires the current student's session. API data
   and credentials are never cached here. Bump SHELL_CACHE when releasing a
   changed shell so installation refreshes the HTML and its bundled assets. */

const SHELL_CACHE = "murmur-shell-v2";
const SHELL_ASSETS = ["/", "/index.html", "/manifest.webmanifest"];
const STATIC_DESTINATIONS = new Set(["script", "style", "image", "font", "manifest", "worker"]);

async function installShell() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(SHELL_ASSETS);
  // The first page's bundle loads before a new worker controls it. Runtime
  // caching alone would still leave that first offline reload blank. Vite's
  // generated HTML names the hashed bundles, so cache them during installation.
  const index = await cache.match("/index.html");
  const html = await index.text();
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const url = new URL(match[1], self.location.origin);
    if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
      assets.add(url.href);
    }
  }
  await cache.addAll([...assets]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(installShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("murmur-shell-") && k !== SHELL_CACHE)
        .map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only same-origin navigations and static resources belong in the shell.
  // fetch/XHR has an empty destination, including routes added in future tasks;
  // this avoids a prefix list quietly missing /session or another private API.
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      (request.mode !== "navigate" && !STATIC_DESTINATIONS.has(request.destination))) {
    return; // default network handling
  }
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Vite serves static bundles with Vary: Origin. Module loads include an
    // Origin header that installation's same-origin GET may omit; both name
    // the same immutable asset. Only this same-origin static shell uses cache.
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        // A full cache must not prevent a successful online page from loading.
        try { await cache.put(request, response.clone()); } catch { /* memory-only load */ }
      }
      return response;
    } catch (err) {
      if (request.mode === "navigate") {
        const shell = await cache.match("/index.html");
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
