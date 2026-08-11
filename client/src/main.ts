import { fetchCurrentSession, ApiCallError, emitEvent } from "./api";
import { startActivityPing } from "./activity-ping";
import { clearSession, loadSession } from "./session";
import { injectStyles } from "./screens/styles";
import { mountVerificationFlow } from "./screens/verification-flow";
import { mountAppShell } from "./screens/app-shell";

/**
 * PWA client entry. Restores an existing session if there is one (T12), otherwise
 * mounts the F1 verification flow (S1–S4), and registers the service worker for
 * installability.
 *
 * Session restore is what makes re-opening the app NOT require re-verification —
 * the gap UX OQ-14 left open, resolved in `decisions/oq-14-session-mechanism.md`.
 * Since T19 a restored session lands on the real authenticated shell (S5–S8) rather
 * than the placeholder that stood in for it through M1.
 */
injectStyles();

const app = document.getElementById("app");

async function boot(): Promise<void> {
  if (!app) return;

  // Offline or server-down must not strand a returning user on a blank screen, so the
  // stored session is trusted optimistically and only *confirmed* over the network.
  const stored = loadSession();

  // `id` is required since T28: the offline outbox and the draft store are keyed by it, so
  // one phone's two students cannot end up sharing a queue (see outbox-store.ts). Both call
  // sites already hand over a full PublicProfile, so nothing new has to be fetched.
  const signedIn = (profile: { id: string; pseudonym: string; year_badge: string }) => {
    // T51 — keeps a long-lived installed PWA visible to WAU, which `session.resumed`
    // alone cannot do since it only fires on boot. Started only for a signed-in user:
    // an unattributed ping tells the metric nothing.
    startActivityPing(document, emitEvent);
    return mountAppShell(app, profile, () => {
      // The shell hit a 401: api.ts's handle() has already dropped the stored session,
      // so all that is left is to send the user back through S1.
      clearSession();
      mountVerificationFlow(app);
    });
  };

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
