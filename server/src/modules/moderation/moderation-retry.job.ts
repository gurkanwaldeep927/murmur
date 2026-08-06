import { config } from "../../config/index.js";
import { withTransaction } from "../../db/pool.js";
import { logger } from "../../shared/logger.js";
import { emit } from "../analytics/analytics.service.js";
import {
  ModerationEventNames,
  outcomeBucket,
  type ModerationOutcomeMeta,
} from "./moderation-events.js";
import { classifyAndApply } from "./moderation.gateway.js";
import * as repo from "./moderation.repo.js";
import type { ContentRef } from "./moderation.repo.js";

/**
 * Moderation retry job (T14a — the worker half of TRD apis[A7]'s failure posture).
 *
 * Two passes, in this order:
 *   1. **Escalate the exhausted.** Cases past the attempt ceiling go to the Human
 *      Escalation Queue. Running this first means a backlog can never grow a tail of
 *      items that are permanently retried and never seen by anyone.
 *   2. **Retry the due.** Cases still under the ceiling and past their backoff window
 *      get another classification attempt.
 *
 * With no provider bound (the default until T14b/M6), pass 2 always fails, so every held
 * item walks its attempt budget and lands in the human queue. That is the intended
 * behavior and not a wasted cycle: it is what makes the escalation queue the single
 * place a human looks, whether the cause is an ambiguous verdict or no provider at all.
 */

const BATCH_LIMIT = 50;

export async function runModerationRetryPass(): Promise<{
  escalated: number;
  retried: number;
}> {
  const escalatedCases = await withTransaction(async (client) => {
    const exhausted = await repo.claimExhaustedCases(
      client,
      config.moderationMaxAttempts,
      BATCH_LIMIT,
    );
    for (const row of exhausted) {
      await repo.escalateToHuman(client, row.id);
    }
    return exhausted;
  });
  const escalated = escalatedCases.length;

  if (escalated > 0) {
    logger.warn({ escalated }, "moderation cases auto-escalated to the human queue");
  }

  // T51 — this pass is the ONLY route to the human queue that the gateway never sees, so
  // without this the auto-vs-escalated ratio would miss exactly the escalations the
  // fail-closed posture produces. Emitted after the transaction commits: an event for a
  // rolled-back escalation would be a lie, and emitting inside `repo.escalateToHuman`
  // would put analytics inside a data-access function.
  for (const row of escalatedCases) {
    const metadata: ModerationOutcomeMeta = {
      contentType: row.content_type,
      contentId: (row.content_type === "question" ? row.question_id : row.answer_id)!,
      outcome: outcomeBucket("pending", "escalate"),
      attempt: row.attempts,
    };
    emit({ eventType: ModerationEventNames.OUTCOME, metadata: { ...metadata } });
  }

  // Claim inside a transaction, classify outside it — a provider call must never be made
  // while holding row locks.
  const due = await withTransaction((client) =>
    repo.claimRetryableCases(
      client,
      config.moderationMaxAttempts,
      config.moderationRetryBackoffSeconds,
      BATCH_LIMIT,
    ),
  );

  let retried = 0;
  for (const row of due) {
    const ref: ContentRef = {
      type: row.content_type,
      id: (row.content_type === "question" ? row.question_id : row.answer_id)!,
    };
    try {
      await classifyAndApply(ref, row.id, { text: row.text, contentType: row.content_type },
        row.attempts);
      retried += 1;
    } catch (err) {
      // classifyAndApply already absorbs provider failure; reaching here means something
      // unexpected (a DB error, say). Log and continue — one bad case must not stall the
      // rest of the batch.
      logger.error({ err, caseId: row.id }, "moderation retry failed unexpectedly");
    }
  }

  if (retried > 0) logger.info({ retried }, "moderation retry pass complete");
  return { escalated, retried };
}

export const moderationRetryJob = {
  name: "moderation-retry",
  intervalMs: config.moderationRetryIntervalSeconds * 1000,
  run: async () => {
    await runModerationRetryPass();
  },
};
