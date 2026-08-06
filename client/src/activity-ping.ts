/**
 * WAU liveness ping (plan T51; PRD R8).
 *
 * The server emits `session.resumed` when the PWA boots and calls `GET /session`. That is
 * the right unit for "app opened", but it is the ONLY session signal, and a PWA is
 * installed precisely so it does not have to be reopened — a tab left running for a week
 * would produce exactly one event and read as inactive for the following six days. WAU
 * would under-report exactly the most engaged users, which is the wrong direction for a
 * metric meant to prove the product is used.
 *
 * This closes that gap with the cheapest signal that is still true: when a backgrounded
 * tab comes back to the foreground, the user is present. Throttled to one per hour, so a
 * user flipping between apps all afternoon costs a handful of rows and not hundreds —
 * `analytics_event` is append-only (PRV-1), so the throttle is a storage decision, not a
 * politeness one.
 *
 * ## Why the document and the sender are injected
 *
 * Both used to be reached as globals (`document`, and an import of `./api`). That made the
 * module unimportable outside a browser — and the unit suite runs under `environment:
 * "node"`, so the test had to stub a global and mock a module to say anything about it,
 * while the server's typecheck pulled the file in through that test and failed on a
 * missing DOM library. Passing them in costs one argument at the single call site in
 * `main.ts` and leaves this file with no hidden dependencies at all.
 *
 * Carries no metadata. WAU needs the actor and the timestamp, and the actor is derived
 * server-side from the session token — never sent by the client (PRV-7 / SEC-009).
 */

export const PING_MIN_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Must match an entry in the server's `CLIENT_EVENT_TYPES` allowlist, or `POST /events`
 * answers 400 and the metric is silently missing.
 */
export const PING_EVENT_TYPE = "client.session.ping";

/** The slice of `document` this needs — declared locally so no DOM library is required. */
export interface VisibilityDocument {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/** Pure so the throttle is testable without a clock. */
export function shouldPing(now: number, lastSignalAt: number): boolean {
  return now - lastSignalAt >= PING_MIN_INTERVAL_MS;
}

/**
 * Begin watching for foreground returns. Call once, after the shell mounts for a
 * signed-in user. Returns a teardown function.
 */
export function startActivityPing(
  doc: VisibilityDocument,
  sendEvent: (eventType: string) => void,
): () => void {
  // Boot has just produced `session.resumed` server-side, so the clock starts now rather
  // than at zero — otherwise the very first foreground return would double-count it.
  let lastSignalAt = Date.now();

  const onVisibilityChange = (): void => {
    if (doc.visibilityState !== "visible") return;
    const now = Date.now();
    if (!shouldPing(now, lastSignalAt)) return;
    lastSignalAt = now;
    sendEvent(PING_EVENT_TYPE);
  };

  doc.addEventListener("visibilitychange", onVisibilityChange);
  return () => doc.removeEventListener("visibilitychange", onVisibilityChange);
}
