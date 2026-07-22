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
    proxy: {
      "/verification": API_TARGET,
      "/events": API_TARGET,
      "/health": API_TARGET,
      "/questions": API_TARGET,
      "/reports": API_TARGET,
      "/sync": API_TARGET,
    },
  },
});
