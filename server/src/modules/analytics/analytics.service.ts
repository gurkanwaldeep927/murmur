import { pool } from "../../db/pool.js";
import { logger } from "../../shared/logger.js";

/**
 * Analytics Instrumentation Service (owns analytics_event, plan T44).
 *
 * Fire-and-forget by contract (A12): a failed analytics write must NEVER block or
 * fail the primary user action it is attached to. `emit` therefore swallows its own
 * errors (logging them) and is not awaited on the request's critical path.
 */

export interface AnalyticsEventInput {
  eventType: string;
  actorProfileId?: string | null;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}

export async function persistEvent(input: AnalyticsEventInput): Promise<void> {
  await pool.query(
    `INSERT INTO analytics_event (event_type, actor_profile_id, occurred_at, metadata)
     VALUES ($1, $2, COALESCE($3, now()), $4)`,
    [
      input.eventType,
      input.actorProfileId ?? null,
      input.occurredAt ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

/**
 * Fire-and-forget emit used by server-side instrumentation hooks (T45). Never throws;
 * never blocks the caller. Do not `await` this on a user-facing critical path.
 */
export function emit(input: AnalyticsEventInput): void {
  const pending = persistEvent(input).catch((err) => {
    logger.warn({ err, eventType: input.eventType }, "analytics emit failed (ignored)");
  });
  inFlight.add(pending);
  void pending.finally(() => inFlight.delete(pending));
}

/**
 * Writes that have been started and have not landed yet.
 *
 * Bounded by concurrency, not by volume — each entry removes itself the moment its write
 * settles — so this is not a growing buffer, and nothing here is ever awaited on a request's
 * critical path. The fire-and-forget contract (A12) is unchanged.
 */
const inFlight = new Set<Promise<unknown>>();

/**
 * Wait for the emits already started to finish. Never rejects — `emit` has already absorbed
 * every error, and a failed analytics write must not become a failure anywhere else.
 *
 * Two callers, present and future:
 *
 *  - **tests that delete a profile.** `analytics_event.actor_profile_id` is a foreign key, and
 *    "fire-and-forget" means precisely that a row may arrive AFTER the response the test was
 *    waiting on. A test that clears the events and then deletes the profile can therefore be
 *    beaten by a write still in flight, and it fails with a foreign-key violation that has
 *    nothing to do with what it was testing. That happened on CI on 2026-08-09 in the T24
 *    erasure suite — intermittently, which is the worst kind: it teaches everyone to re-run
 *    rather than to read. Draining first makes it deterministic without weakening the
 *    contract.
 *  - **graceful shutdown**, when it is built: the same drain is what stops a deploy from
 *    discarding the events of its last few seconds.
 */
export async function settleEmits(): Promise<void> {
  while (inFlight.size > 0) {
    // Re-read the set each round: a settling write can start another, and awaiting a snapshot
    // would return with those still outstanding.
    await Promise.allSettled([...inFlight]);
  }
}
