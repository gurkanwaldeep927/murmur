import { injectStyles } from "./screens/styles";
import { mountVerificationFlow } from "./screens/verification-flow";

/**
 * PWA client entry. Mounts the F1 verification flow (S1–S4) and registers the service
 * worker for installability. The authenticated shell (S5+) and offline queue land in
 * later milestones (M2 / M4).
 */
injectStyles();

const app = document.getElementById("app");
if (app) mountVerificationFlow(app);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      /* installability is best-effort; a failed SW registration must not break the app */
    });
  });
}
