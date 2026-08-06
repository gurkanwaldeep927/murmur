/**
 * Session lifecycle event vocabulary (plan T51's WAU hooks; PRD R8).
 *
 * Two of the six PRD metrics are sourced here: **WAU density** and **D30 cohort
 * retention**. Both are "did this profile do anything in the window", and before T51 the
 * app emitted nothing at all on the session path — `session.routes.ts` carried a comment
 * saying the logout endpoint existed "so the analytics hook has somewhere to live", and
 * the hook was never written. T46 (M6) derives both metrics from these names.
 *
 * Fire-and-forget throughout (A12): instrumentation never blocks or fails a sign-in.
 *
 * ## What is deliberately NOT instrumented
 *
 * - **`requireSession`** — it runs on every authenticated request. `analytics_event` is
 *   append-only and nothing deletes from it (PRV-1), so one row per API call would make
 *   the largest table in the product a byproduct of instrumentation.
 * - **`POST /session/logout`** — it runs without `requireSession`, so there is no
 *   attributable actor. Adding the middleware to get one would turn a 204 into a 401 for
 *   a client holding an expired token, which is a behavior change T51 does not need.
 *
 * ## Known limit, for T46 to handle
 *
 * `SESSION_RESUMED` fires on app boot. A PWA left open for days emits none, so WAU must
 * be derived as `COUNT(DISTINCT actor_profile_id)` over **all** events in the window, not
 * over session events alone. `client.session.ping` (also T51) narrows the gap by firing
 * when a backgrounded tab returns to the foreground, but the DISTINCT-over-all-events
 * rule is the one that must not be dropped.
 */

export const SessionEvents = {
  /** A bootstrap token was exchanged for a session: a real sign-in completed. */
  STARTED: "session.started",
  /** App boot with a stored token that still verifies. The WAU/D30 heartbeat. */
  RESUMED: "session.resumed",
} as const;
