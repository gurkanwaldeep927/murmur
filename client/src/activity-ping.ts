import { emitEvent } from "./api";

/**
 * WAU liveness ping (plan T51; PRD R8).
 *
 * The server emits `session.resumed` when the PWA boots and calls `GET /session`. That is
 * the right unit for "app opened", but it is the ONLY session signal, and a PWA is
 * installed precisely so it does not have to be reopened — a tab left running for a week
 * would produce exactly one event and read as inactive for the following six days.
 *
 * This closes that gap with the cheapest signal that is still true: when a backgrounded
 * tab comes back to the foreground, the user is present. Throttled to one per hour, so a
 * user flipping between apps all afternoon costs a handful of rows and not hundreds —
 * `analytics_event` is append-only (PRV-1), so the throttle is a storage decision, not a
 * politeness one.
 *
 * Carries no metadata. WAU needs the actor and the timestamp, and the actor is derived
 * server-side from the session token — never sent by the client (PRV-7 / SEC-009).
 */

export const PING_MIN_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Pure so the throttle is testable without a DOM or a clock. Exported for the unit test;
 * `startActivityPing` is the only production caller.
 */
export function shouldPing(now: number, lastSignalAt: number): boolean {
  return now - lastSignalAt >= PING_MIN_INTERVAL_MS;
}

/**
 * Begin watching for foreground returns. Call once, after the shell mounts for a
 * signed-in user. Returns a teardown function (used by tests; the shell lives for the
 * lifetime of the page).
 */
export function startActivityPing(): () => void {
  // Boot has just produced `session.resumed` server-side, so the clock starts now rather
  // than at zero — otherwise the very first foreground return would double-count it.
  let lastSignalAt = Date.now();

  const onVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (!shouldPing(now, lastSignalAt)) return;
    lastSignalAt = now;
    emitEvent("client.session.ping");
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => document.removeEventListener("visibilitychange", onVisibilityChange);
}
