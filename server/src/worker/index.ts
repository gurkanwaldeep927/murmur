import { logger } from "../shared/logger.js";
import { closePool } from "../db/pool.js";

/**
 * Background worker process (architecture §5). Runs the async/retry jobs the API must
 * not do inline. Jobs land as their milestones do:
 *   - moderation-retry.job.ts        (T14, M2)  — fail-closed moderation retry/escalate
 *   - grievance-sla.job.ts           (T38, M5)  — acknowledgement + resolution SLA timers
 *   - sync-reconciliation.job.ts     (T32, M4)  — no sync item stuck non-terminal
 *
 * M1 has no scheduled jobs; this skeleton exists so the two-process shape (api + worker)
 * is established from the tracer and later jobs plug in without restructuring.
 */

type Job = { name: string; intervalMs: number; run: () => Promise<void> };

const jobs: Job[] = [
  // Registered by later milestones. Empty at M1 by design.
];

const timers: NodeJS.Timeout[] = [];

function start() {
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
