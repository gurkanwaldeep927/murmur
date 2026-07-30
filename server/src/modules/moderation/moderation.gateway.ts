import { config } from "../../config/index.js";
import { pool, withTransaction, type DbClient } from "../../db/pool.js";
import { logger } from "../../shared/logger.js";
import * as repo from "./moderation.repo.js";
import type { ContentRef } from "./moderation.repo.js";
import { resolveProviders } from "./providers/index.js";
import {
  ProviderUnavailableError,
  type ClassifyInput,
  type ModerationOutcome,
  type ModerationProvider,
  type ModerationStatus,
  type ProviderVerdict,
  type RiskTier,
} from "./moderation.types.js";

/**
 * Moderation Gateway (T14a — TRD §6 A7, §8; PRD R6).
 *
 * Two guarantees, both structural rather than conventional:
 *
 *  1. **Nothing publishes without a cleared case.** Content is inserted `pending` with an
 *     open case in the same transaction (`openCase`), and only a verdict can move it to
 *     `published`. A crash anywhere after the insert leaves content held, never live.
 *  2. **No verdict means hold.** Timeout, outage, malformed response, or no provider
 *     configured at all collapse to one `ProviderUnavailableError`, whose only handler
 *     holds the item and schedules a retry. There is no branch here that publishes on a
 *     failure, which is why R6's "no UGC bypasses it" survives the moderation provider
 *     being absent for the whole of M2–M5 (plan §1, fourth revision).
 *
 * The tiering is TRD §8's cost design: a cheap tier-1 classifier sees every item, and
 * only what it calls ambiguous costs a tier-2 call.
 */

const TIER_TO_STATUS: Record<RiskTier, ModerationStatus> = {
  auto_pass: "published",
  auto_block: "blocked",
  // `escalate` is NOT a decision — it is the absence of one. The item stays pending
  // until a human decides it on S16 (T36/T41).
  escalate: "pending",
};

/** Wall-clock ceiling on a provider call: a hung provider must not hang a user's write. */
async function classifyWithTimeout(
  provider: ModerationProvider,
  input: ClassifyInput,
): Promise<ProviderVerdict> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      provider.classify(input),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new ProviderUnavailableError(
                provider.name,
                `classification timed out after ${config.moderationTimeoutMs}ms`,
              ),
            ),
          config.moderationTimeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run the tiered classification. Tier-1 sees everything; tier-2 only confirms tier-1's
 * `escalate` calls, and only when one is configured.
 *
 * A tier-2 failure is deliberately NOT fatal: tier 1 already produced a usable verdict
 * (`escalate`), and escalation is a safe state — it holds the content and routes it to a
 * human. Falling back to it is strictly more conservative than retrying.
 */
async function classifyTiered(
  input: ClassifyInput,
): Promise<{ verdict: ProviderVerdict; provider: string }> {
  const { tier1, tier2 } = resolveProviders();

  const first = await classifyWithTimeout(tier1, input);
  if (first.tier !== "escalate" || !tier2) {
    return { verdict: first, provider: tier1.name };
  }

  try {
    const second = await classifyWithTimeout(tier2, input);
    return { verdict: second, provider: tier2.name };
  } catch (err) {
    logger.warn(
      { err, tier2: tier2.name },
      "tier-2 moderation provider unavailable — keeping tier-1 escalate verdict",
    );
    return { verdict: first, provider: tier1.name };
  }
}

/** Apply a verdict to the content row and its case, atomically. */
async function applyVerdict(
  ref: ContentRef,
  caseId: string,
  verdict: ProviderVerdict,
  providerName: string,
  attempts: number,
): Promise<ModerationStatus> {
  const status = TIER_TO_STATUS[verdict.tier];

  await withTransaction(async (client: DbClient) => {
    await repo.recordVerdict(client, caseId, verdict, status, providerName, attempts);

    if (status === "pending") return; // escalate — content stays held.

    if (ref.type === "question") {
      await client.query(
        `UPDATE question
            SET moderation_status = $2,
                published_at = CASE WHEN $2 = 'published' THEN now() ELSE published_at END
          WHERE id = $1 AND moderation_status = 'pending'`,
        [ref.id, status],
      );
    } else {
      const { rowCount } = await client.query(
        `UPDATE answer
            SET moderation_status = $2
          WHERE id = $1 AND moderation_status = 'pending'`,
        [ref.id, status],
      );
      // Keep the parent's cached answer_count truthful the moment an answer becomes
      // visible. Full aggregate maintenance (triggers + reconciliation) is T21/M3's
      // job; this is the minimum that keeps the T17 feed from lying in the meantime.
      if (rowCount === 1 && status === "published") {
        await client.query(
          `UPDATE question q
              SET answer_count = answer_count + 1
             FROM answer a
            WHERE a.id = $1 AND q.id = a.question_id`,
          [ref.id],
        );
      }
    }
  });

  return status;
}

/**
 * Classify one item and apply the result. Called after the content row already exists
 * and its case is open — never before.
 *
 * Returns the item's terminal-for-now status. It never throws on provider failure:
 * a held item is a normal outcome, not an error, and A3/A4 report it as `pending`.
 */
export async function classifyAndApply(
  ref: ContentRef,
  caseId: string,
  input: ClassifyInput,
  priorAttempts = 0,
): Promise<ModerationOutcome> {
  const attempts = priorAttempts + 1;

  try {
    const { verdict, provider } = await classifyTiered(input);
    const status = await applyVerdict(ref, caseId, verdict, provider, attempts);
    return { caseId, status, riskTier: verdict.tier, held: status === "pending" };
  } catch (err) {
    if (!(err instanceof ProviderUnavailableError)) throw err;

    await repo.recordFailedAttempt(pool, caseId, err.provider, err.message, attempts);

    // Ceiling reached on this very attempt: hand it to the human queue now rather than
    // waiting a retry cycle to notice.
    if (attempts >= config.moderationMaxAttempts) {
      await repo.escalateToHuman(pool, caseId);
      logger.warn(
        { caseId, attempts, provider: err.provider },
        "moderation attempts exhausted — auto-escalated to the human queue (fail-closed)",
      );
      return { caseId, status: "pending", riskTier: "escalate", held: true };
    }

    logger.info(
      { caseId, attempts, provider: err.provider, err: err.message },
      "moderation provider unavailable — content held pending, retry scheduled (fail-closed)",
    );
    return { caseId, status: "pending", riskTier: null, held: true };
  }
}

export { openCase } from "./moderation.repo.js";
export type { ContentRef } from "./moderation.repo.js";
