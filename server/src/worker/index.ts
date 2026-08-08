import { logger } from "../shared/logger.js";
import { closePool } from "../db/pool.js";
import { moderationRetryJob } from "../modules/moderation/moderation-retry.job.js";
import { initModerationProviders } from "../modules/moderation/providers/index.js";
import { grievanceSlaJob } from "../modules/grievance/grievance-sla.job.js";
import { syncReconciliationJob } from "../modules/sync/sync-reconciliation.job.js";

/**
 * Background worker process (architecture §5). Runs the async/retry jobs the API must
 * not do inline. Jobs land as their milestones do:
 *   - moderation-retry.job.ts        (T14a, M2) — fail-closed moderation retry/escalate ✓
 *   - grievance-sla.job.ts           (T38, M5)  — acknowledgement + resolution SLA alerts ✓
 *   - sync-reconciliation.job.ts     (T32, M4)  — no sync item stuck non-terminal ✓
 *
 * The two-process shape (api + worker) was established at M1 with no jobs, so later
 * jobs plug in without restructuring — which is what M2's first job is doing here.
 */

type Job = { name: string; intervalMs: number; run: () => Promise<void> };

const jobs: Job[] = [moderationRetryJob, grievanceSlaJob, syncReconciliationJob];

const timers: NodeJS.Timeout[] = [];

function start() {
  // RES-2: same as the API process — the retry job classifies content, so a provider
  // that cannot resolve must stop this process at boot rather than failing once per
  // interval, forever, against every held item it picks up.
  initModerationProviders();
  logger.info({ jobCount: jobs.length }, "murmur worker starting");
  for (const job of jobs) {
    const timer = setInterval(() => {
      job.run().catch((err) => logger.error({ err, job: job.name }, "worker job failed"));
    }, job.intervalMs);
    timers.push(timer);
  }
  if (jobs.length === 0) {
    logger.info("no scheduled jobs at this milestone — worker idle");
  }
}

async function shutdown(signal: string) {
  logger.info({ signal }, "worker shutting down");
  for (const t of timers) clearInterval(t);
  await closePool();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

start();
