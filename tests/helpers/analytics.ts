import type { Pool } from "pg";

/**
 * Reading `analytics_event` from a test.
 *
 * Instrumentation is fire-and-forget by contract (A12) — `emit()` starts a write and
 * returns, so the row is NOT there when the HTTP response arrives. A test that reads
 * immediately fails intermittently and teaches everyone to distrust it, so these poll.
 *
 * Before T51 nothing in the suite read this table at all; the only mention was the
 * TRUNCATE in `test-db.ts`. Every event the product emitted was therefore unverified,
 * which is the failure class this project has been bitten by repeatedly: the metric would
 * have been discovered missing at T46, in M6, with the milestones that produced it long
 * closed.
 */

export interface AnalyticsRow {
  event_type: string;
  actor_profile_id: string | null;
  occurred_at: Date;
  metadata: Record<string, unknown> | null;
}

export async function readEvents(pool: Pool, eventType: string): Promise<AnalyticsRow[]> {
  const { rows } = await pool.query<AnalyticsRow>(
    `SELECT event_type, actor_profile_id, occurred_at, metadata
       FROM analytics_event
      WHERE event_type = $1
      ORDER BY occurred_at, event_type`,
    [eventType],
  );
  return rows;
}

/**
 * Wait until at least `count` rows of `eventType` exist. Throws naming what it did find,
 * so a failure reads as "expected 1 session.started, saw 0" rather than as a timeout.
 */
export async function waitForEvents(
  pool: Pool,
  eventType: string,
  count = 1,
  timeoutMs = 5_000,
): Promise<AnalyticsRow[]> {
  const deadline = Date.now() + timeoutMs;
  let rows: AnalyticsRow[] = [];
  while (Date.now() < deadline) {
    rows = await readEvents(pool, eventType);
    if (rows.length >= count) return rows;
    await new Promise((r) => setTimeout(r, 25));
  }
  const seen = await pool.query<{ event_type: string; n: string }>(
    `SELECT event_type, count(*) AS n FROM analytics_event GROUP BY event_type ORDER BY 1`,
  );
  throw new Error(
    `expected >=${count} "${eventType}" event(s) within ${timeoutMs}ms, saw ${rows.length}. ` +
      `Events present: ${seen.rows.map((r) => `${r.event_type}=${r.n}`).join(", ") || "(none)"}`,
  );
}

/**
 * Assert an event count that must NOT grow. Waits for the expected rows, then settles and
 * re-reads — the point being to catch a SECOND emitter, which is exactly the bug T51 fixed
 * by moving moderation outcomes to a single funnel.
 */
export async function expectExactlyEvents(
  pool: Pool,
  eventType: string,
  count: number,
  settleMs = 250,
): Promise<AnalyticsRow[]> {
  const rows = await waitForEvents(pool, eventType, count);
  await new Promise((r) => setTimeout(r, settleMs));
  const after = await readEvents(pool, eventType);
  if (after.length !== count) {
    throw new Error(
      `expected exactly ${count} "${eventType}" event(s), found ${after.length} after settling`,
    );
  }
  return rows;
}
