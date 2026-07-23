import { fetchCurrentSession, logout, ApiCallError } from "./api";
import { clearSession, loadSession } from "./session";
import { injectStyles } from "./screens/styles";
import { mountVerificationFlow } from "./screens/verification-flow";
import { mountSignedInStub } from "./screens/signed-in-stub";

/**
 * PWA client entry. Restores an existing session if there is one (T12), otherwise
 * mounts the F1 verification flow (S1–S4), and registers the service worker for
 * installability.
 *
 * Session restore is what makes re-opening the app NOT require re-verification —
 * the gap UX OQ-14 left open, resolved in `decisions/oq-14-session-mechanism.md`.
 * The authenticated shell (S5+) lands with the M2 screens; until then a restored
 * session has nowhere to go, so this boots the flow either way and only reports what
 * it found.
 */
injectStyles();

const app = document.getElementById("app");

async function boot(): Promise<void> {
  if (!app) return;

  // Offline or server-down must not strand a returning user on a blank screen, so the
  // stored session is trusted optimistically and only *confirmed* over the network.
  const stored = loadSession();

  const signedIn = (profile: { pseudonym: string; year_badge: string }) =>
    // TODO(M2): swap for the S5 Home Feed mount once those screens land.
    mountSignedInStub(app, profile, async () => {
      await logout();
      mountVerificationFlow(app);
    });

  if (stored) {
    try {
      const profile = await fetchCurrentSession();
      if (profile) return signedIn(profile);
      // null => the token was rejected and already cleared; fall through to S1.
    } catch (err) {
      if (err instanceof ApiCallError && err.status === 403) {
        // Suspended or banned: a terminal state, NOT a reason to re-register
        // (decision §6). Drop the credential; the M5 screens surface the state.
        clearSession();
      } else {
        // Network failure — offline or server down. Trust the stored session rather
        // than stranding a returning user on the sign-up screen; the next
        // authenticated request re-checks it.
        return signedIn(stored.profile);
      }
    }
  }

  mountVerificationFlow(app);
}

void boot();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      /* installability is best-effort; a failed SW registration must not break the app */
    });
  });
}
