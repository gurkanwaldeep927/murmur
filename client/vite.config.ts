import { defineConfig } from "vite";

// Dev proxy: the client calls the API with same-origin relative paths (see src/api.ts),
// so in dev we forward the API routes to the local server (default :4000). In prod the
// PWA and API are served behind one origin / gateway, so no proxy is needed.
const API_TARGET = process.env.VITE_API_PROXY ?? "http://localhost:4000";

export default defineConfig({
  publicDir: "public",
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    // Every prefix the API mounts must be listed here. Anything missing is silently
    // served by vite itself as index.html, so the client gets a 200 full of HTML and
    // JSON.parse throws somewhere far away from the cause — which is exactly what
    // happened to /session on 2026-08-02: sign-up succeeded, the bootstrap token was
    // never exchanged, and the user bounced back to S1 with no error anywhere.
    // `tests/unit/client-api-proxy.test.ts` now fails if a route is added without one.
    proxy: {
      "/verification": API_TARGET, // A1, A2
      "/session": API_TARGET, // T12 — exchange, current session, logout
      "/events": API_TARGET, // A12
      "/health": API_TARGET,
      "/questions": API_TARGET, // A3, A4, A5-browse
      "/topics": API_TARGET, // S6's topic chips
      "/reports": API_TARGET, // A8 (M5, not yet mounted)
      "/sync": API_TARGET, // A9 (M4, not yet mounted)
    },
  },
});
