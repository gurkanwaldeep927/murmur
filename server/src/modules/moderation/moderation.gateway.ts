import { config } from "../../config/index.js";
import { pool, withTransaction, type DbClient } from "../../db/pool.js";
import { logger } from "../../shared/logger.js";
import { emit } from "../analytics/analytics.service.js";
import {
  ModerationEventNames,
  outcomeBucket,
  type ModerationOutcomeMeta,
} from "./moderation-events.js";
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

const VALID_TIERS: readonly RiskTier[] = ["auto_pass", "auto_block", "escalate"];

/**
 * RES-1 (fixed 2026-08-02). `ModerationProvider` is a PORT — from M6 its implementations
 * are vendor adapters translating third-party JSON, and TypeScript cannot check what
 * crosses that boundary at runtime. An adapter returning `{ tier: undefined }`, or a
 * plausible-looking tier the enum does not contain, previously flowed straight into
 * `TIER_TO_STATUS[verdict.tier]` → `undefined` status → a NOT NULL violation deep in
 * `recordVerdict`, surfacing as a 500 rather than as a moderation decision.
 *
 * The fix keeps the gateway's single invariant intact: an unusable verdict is NO verdict,
 * which is already a state with a correct handler — hold, retry, escalate. Converting it
 * to `ProviderUnavailableError` means a malformed response and an outage take the same
 * fail-closed path, exactly as a timeout already does.
 */
function assertUsableVerdict(providerName: string, verdict: ProviderVerdict): ProviderVerdict {
  if (!verdict || typeof verdict !== "object") {
    throw new ProviderUnavailableError(providerName, "provider returned no verdict object");
  }
  if (!VALID_TIERS.includes(verdict.tier)) {
    throw new ProviderUnavailableError(
      providerName,
      `provider returned an unusable risk tier: ${JSON.stringify(verdict.tier)}`,
    );
  }
  return verdict;
}

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

  const first = assertUsableVerdict(tier1.name, await classifyWithTimeout(tier1, input));
  if (first.tier !== "escalate" || !tier2) {
    return { verdict: first, provider: tier1.name };
  }

  try {
    const second = assertUsableVerdict(tier2.name, await classifyWithTimeout(tier2, input));
    return { verdict: second, provider: tier2.name };
  } catch (err) {
    logger.warn(
      { err, tier2: tier2.name },
      "tier-2 moderation provider unavailable — keeping tier-1 escalate verdict",
    );
    return { verdict: first, provider: tier1.name };
  }
}

/**
 * What one verdict application actually did — richer than the status alone because T51's
 * outcome event has to be emitted exactly once per applied decision.
 *
 * `contentChanged` is false when the UPDATE matched no row: another path decided this
 * item first. Emitting then would double-count one item in the auto-vs-escalated ratio.
 */
interface AppliedVerdict {
  status: ModerationStatus;
  /** Parent question of an answer — carried so answer liquidity is derivable from events. */
  parentQuestionId: string | null;
  contentChanged: boolean;
}

/** Apply a verdict to the content row and its case, atomically. */
async function applyVerdict(
  ref: ContentRef,
  caseId: string,
  verdict: ProviderVerdict,
  providerName: string,
  attempts: number,
): Promise<AppliedVerdict> {
  const status = TIER_TO_STATUS[verdict.tier];
  let parentQuestionId: string | null = null;
  // Escalation changes no content row, but it IS a decision and must be reported as one.
  let contentChanged = status === "pending";

  await withTransaction(async (client: DbClient) => {
    await repo.recordVerdict(client, caseId, verdict, status, providerName, attempts);

    if (status === "pending") return; // escalate — content stays held.

    if (ref.type === "question") {
      const { rowCount } = await client.query(
        // $2 is cast at every use. Assigning it to an enum column while also comparing
        // it to a bare 'published' literal makes Postgres deduce two different types for
        // one parameter, and it then refuses to parse the statement.
        `UPDATE question
            SET moderation_status = $2::moderation_status_enum,
                published_at = CASE WHEN $2::moderation_status_enum = 'published'
                                    THEN now() ELSE published_at END
          WHERE id = $1 AND moderation_status = 'pending'`,
        [ref.id, status],
      );
      contentChanged = rowCount === 1;
    } else {
      // RETURNING question_id reuses the statement already here rather than adding a
      // lookup: the parent id is what makes answer liquidity computable from events.
      const { rowCount, rows } = await client.query<{ question_id: string }>(
        `UPDATE answer
            SET moderation_status = $2
          WHERE id = $1 AND moderation_status = 'pending'
      RETURNING question_id`,
        [ref.id, status],
      );
      contentChanged = rowCount === 1;
      parentQuestionId = rows[0]?.question_id ?? null;
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

  return { status, parentQuestionId, contentChanged };
}

/**
 * T51 — one event per verdict APPLICATION, on every path into this module. Fire-and-
 * forget: a failed analytics write must never turn a moderation decision into an error.
 */
function emitOutcome(
  ref: ContentRef,
  outcome: string,
  attempt: number,
  parentQuestionId: string | null,
): void {
  const metadata: ModerationOutcomeMeta = {
    contentType: ref.type,
    contentId: ref.id,
    outcome,
    attempt,
  };
  if (ref.type === "answer" && parentQuestionId) metadata.questionId = parentQuestionId;
  emit({ eventType: ModerationEventNames.OUTCOME, metadata: { ...metadata } });
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
    const applied = await applyVerdict(ref, caseId, verdict, provider, attempts);

    // Skipped when the UPDATE matched nothing: another path already decided this item,
    // and a second event would double-count it in the auto-vs-escalated ratio.
    if (applied.contentChanged) {
      emitOutcome(
        ref,
        outcomeBucket(applied.status, verdict.tier),
        attempts,
        applied.parentQuestionId,
      );
    }

    return {
      caseId,
      status: applied.status,
      riskTier: verdict.tier,
      held: applied.status === "pending",
    };
  } catch (err) {
    // RES-3 (fixed 2026-08-02). This used to rethrow anything that was not a
    // ProviderUnavailableError — a database blip inside applyVerdict, a bug, anything —
    // WITHOUT recording the attempt. The attempt counter therefore never advanced for
    // those failures, so `attempts >= moderationMaxAttempts` was never reached, the retry
    // worker re-ran the same failure forever, and the item could never be escalated to a
    // human. Content held invisible with no path to a decision breaks R6 AC3, and it is
    // invisible by construction: no user sees it, and nothing alerts on it.
    //
    // Every failure now advances the counter, so the ceiling is reachable by every route
    // into this catch. That is the property R6 AC3 actually depends on.
    const isProviderFailure = err instanceof ProviderUnavailableError;
    const providerName = isProviderFailure ? err.provider : "gateway";
    const message = err instanceof Error ? err.message : String(err);

    if (!isProviderFailure) {
      // Unexpected, so it must be loud — but the item is safely held either way, and
      // reporting "pending" to the caller is the truth about the row that exists.
      logger.error(
        { err, caseId, attempts, ref },
        "unexpected moderation failure — content held pending, attempt recorded (fail-closed)",
      );
    }

    try {
      await repo.recordFailedAttempt(pool, caseId, providerName, message, attempts);

      // Ceiling reached on this very attempt: hand it to the human queue now rather than
      // waiting a retry cycle to notice.
      if (attempts >= config.moderationMaxAttempts) {
        await repo.escalateToHuman(pool, caseId);
        logger.warn(
          { caseId, attempts, provider: providerName },
          "moderation attempts exhausted — auto-escalated to the human queue (fail-closed)",
        );
        emitOutcome(ref, outcomeBucket("pending", "escalate"), attempts, null);
        return { caseId, status: "pending", riskTier: "escalate", held: true };
      }
    } catch (bookkeepingErr) {
      // The database is unreachable, so the attempt could not be recorded. Rethrowing the
      // ORIGINAL error would hide that; swallowing it would claim progress that did not
      // happen. Log both and still report held — the content row is `pending` and no
      // failure path here can publish it.
      logger.error(
        { err: bookkeepingErr, cause: message, caseId, attempts },
        "could not record moderation attempt — case may not advance toward escalation",
      );
      // Deliberately no outcome event here. Reaching this branch means the database
      // refused the attempt write, so an analytics INSERT would fail for the same reason
      // — a doomed write whose only product is a second error in the log. The log line
      // above is the signal for this state.
      return { caseId, status: "pending", riskTier: null, held: true };
    }

    logger.info(
      { caseId, attempts, provider: providerName, err: message },
      "moderation provider unavailable — content held pending, retry scheduled (fail-closed)",
    );
    emitOutcome(ref, outcomeBucket("pending", null), attempts, null);
    return { caseId, status: "pending", riskTier: null, held: true };
  }
}

export { openCase } from "./moderation.repo.js";
export type { ContentRef } from "./moderation.repo.js";
