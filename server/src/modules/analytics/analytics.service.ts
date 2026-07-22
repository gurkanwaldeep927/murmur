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
  persistEvent(input).catch((err) => {
    logger.warn({ err, eventType: input.eventType }, "analytics emit failed (ignored)");
  });
}
