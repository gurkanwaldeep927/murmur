import { config } from "../../config/index.js";
import { pool } from "../../db/pool.js";
import { logger } from "../../shared/logger.js";
import * as repo from "./sync.repo.js";

/**
 * Sync reconciliation audit job (T32).
 *
 * The NFR it exists for: *"100% of queued client writes reach a terminal state (synced /
 * rejected / conflict-resolved); none silently lost."* That claim is worth nothing on its own —
 * the point of this job is that it could DISPROVE it. An all-clear is only evidence because
 * something is looking, and because a test deliberately plants a stuck item and checks this
 * notices (tests/integration/sync-reconciliation.test.ts).
 *
 * ## Why it only reports
 *
 * It audits and alerts; it does not retry. The stored `payload` means the server *could*
 * re-drive a stuck item without the phone ever coming back, and for an item whose owner
 * uninstalled the app that is the only thing that would ever finish it. It is deliberately not
 * built here:
 *
 *  - the task is scoped "audit job … with alerting", and a server that starts posting on a
 *    student's behalf days later is a product decision, not a reconciliation detail — the post
 *    would appear under their name at a moment they did not choose;
 *  - it needs a ceiling and a give-up rule, and neither exists in any upstream document.
 *
 * **The cost of not building it, stated rather than left implicit:** an item whose client never
 * returns stays non-terminal for ever, and this job will keep counting it for ever. That is the
 * honest state — a permanent, visible number — rather than a queue that looks clean because
 * nobody counted. Whoever picks it up (T67's drill is the natural place) inherits this note.
 *
 * ## Why it does not email anyone
 *
 * Unlike T38's grievance alerts, which have a recipient the law requires to exist, a stuck
 * queue item has no mandated audience and no configured one. Inventing an ops mailbox nobody
 * monitors would look like alerting while being nothing of the kind. This emits a structured
 * error line with counts on every pass — the shape an alerting rule reads — and **T71 is the
 * task that turns it into something that reaches a human. Until then it is visible in the logs
 * and nowhere else.**
 */

export interface ReconciliationResult {
  stuck: number;
  oldestAgeSeconds: number | null;
  maxRetryCount: number;
  byEntityType: Record<string, number>;
}

export async function runSyncReconciliationPass(
  now: Date = new Date(),
): Promise<ReconciliationResult> {
  const stuck = await repo.findStuckItems(pool, config.syncStuckAfterSeconds * 1000);

  const result: ReconciliationResult = {
    stuck: stuck.length,
    oldestAgeSeconds: null,
    maxRetryCount: 0,
    byEntityType: {},
  };
  if (stuck.length === 0) return result;

  for (const item of stuck) {
    result.byEntityType[item.entity_type] = (result.byEntityType[item.entity_type] ?? 0) + 1;
    if (item.retry_count > result.maxRetryCount) result.maxRetryCount = item.retry_count;
  }
  // `findStuckItems` orders by created_at, so the first row is the oldest.
  result.oldestAgeSeconds = Math.round(
    (now.getTime() - stuck[0]!.created_at.getTime()) / 1000,
  );

  // Counts and ages only — never a payload and never an owner. The payload is a post the
  // student has not published and the owner is who wrote it; a log line is the one place this
  // project has already leaked identity twice (PRV-5, PRV-6), and a reconciliation report is
  // not worth a third.
  //
  // `maxRetryCount` separates two situations that need different responses: items that have
  // been tried repeatedly and keep failing (something is broken), and items sitting at zero
  // attempts (nobody is coming back for them).
  logger.error(
    {
      stuck: result.stuck,
      oldestAgeSeconds: result.oldestAgeSeconds,
      maxRetryCount: result.maxRetryCount,
      byEntityType: result.byEntityType,
      thresholdSeconds: config.syncStuckAfterSeconds,
    },
    "queued offline writes have not reached a terminal state within the audit window",
  );

  return result;
}

export const syncReconciliationJob = {
  name: "sync-reconciliation",
  intervalMs: config.syncReconcileIntervalSeconds * 1000,
  run: async () => {
    await runSyncReconciliationPass();
  },
};
