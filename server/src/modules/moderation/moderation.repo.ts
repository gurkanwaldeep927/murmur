import type { DbClient, Queryable } from "../../db/pool.js";
import type { ContentType, ModerationStatus, ProviderVerdict, RiskTier } from "./moderation.types.js";

/**
 * `moderation_case` persistence (T14a). Owns the table; no other module writes it
 * (architecture §2). Schema is frozen at migration 002 — nothing here adds a column.
 *
 * Retry bookkeeping note: migration 002 gives the case no attempt counter, and the
 * schema is frozen, so the gateway's retry state lives inside the existing
 * `provider_raw_response` jsonb under a reserved `_gateway` key alongside the provider's
 * own payload. That column's purpose is "the record of provider interaction", which is
 * exactly what attempt counts and last-error strings are. Documented rather than silent:
 * if a later migration adds real columns, `_gateway` is what moves.
 */

export interface ModerationCaseRow {
  id: string;
  question_id: string | null;
  answer_id: string | null;
  risk_tier: RiskTier | null;
  decision: ModerationStatus;
  ai_classification_label: string | null;
  provider_raw_response: ProviderRawResponse | null;
  created_at: Date;
  updated_at: Date;
}

export interface GatewayState {
  attempts: number;
  lastError?: string;
  lastAttemptAt?: string;
  provider?: string;
}

export interface ProviderRawResponse {
  _gateway: GatewayState;
  provider?: unknown;
}

export interface ContentRef {
  type: ContentType;
  id: string;
}

function columnFor(ref: ContentRef): "question_id" | "answer_id" {
  return ref.type === "question" ? "question_id" : "answer_id";
}

/**
 * Open the case for a freshly created item. Called inside the SAME transaction that
 * inserts the content, so there is no window in which content exists without a case —
 * the reconciliation NFR ("100% of published UGC has a cleared case") is enforced by
 * construction, not by a later sweep.
 */
export async function openCase(client: DbClient, ref: ContentRef): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO moderation_case (${columnFor(ref)}, decision, provider_raw_response)
     VALUES ($1, 'pending', $2::jsonb)
     RETURNING id`,
    [ref.id, JSON.stringify({ _gateway: { attempts: 0 } } satisfies ProviderRawResponse)],
  );
  return rows[0]!.id;
}

/** Record a provider verdict and the decision the gateway derived from it. */
export async function recordVerdict(
  client: DbClient,
  caseId: string,
  verdict: ProviderVerdict,
  decision: ModerationStatus,
  providerName: string,
  attempts: number,
): Promise<void> {
  const raw: ProviderRawResponse = {
    _gateway: { attempts, provider: providerName, lastAttemptAt: new Date().toISOString() },
    provider: verdict.raw,
  };
  await client.query(
    `UPDATE moderation_case
        SET risk_tier = $2,
            risk_score = $3,
            ai_classification_label = $4,
            external_provider_case_ref = $5,
            provider_raw_response = $6::jsonb,
            decision = $7::moderation_status_enum,
            -- A human decision is never overwritten by the AI here: this path only
            -- runs while decision = 'pending' (see the WHERE clause).
            --
            -- Every use of $7 carries an explicit cast. Without it Postgres deduces the
            -- enum from the assignment but text from the 'pending' comparison, and then
            -- refuses to parse at all: inconsistent types deduced for parameter $7.
            -- That is a parse-time failure, so this UPDATE could never have run.
            decided_by = CASE WHEN $7::moderation_status_enum = 'pending'
                              THEN NULL ELSE 'ai'::moderation_decided_by_enum END,
            decided_at = CASE WHEN $7::moderation_status_enum = 'pending'
                              THEN NULL ELSE now() END
      WHERE id = $1 AND decision = 'pending'`,
    [
      caseId,
      verdict.tier,
      verdict.score,
      verdict.label,
      verdict.providerCaseRef,
      JSON.stringify(raw),
      decision,
    ],
  );
}

/**
 * Record a failed classification attempt. The case stays `pending` with `risk_tier`
 * NULL — that pair is the gateway's "held, awaiting retry" state, and it is deliberately
 * distinct from `risk_tier = 'escalate'`, which means "awaiting a human" and is what the
 * escalation-queue index (migration 002) selects on.
 */
export async function recordFailedAttempt(
  client: Queryable,
  caseId: string,
  providerName: string,
  error: string,
  attempts: number,
): Promise<void> {
  const raw: ProviderRawResponse = {
    _gateway: {
      attempts,
      provider: providerName,
      lastError: error.slice(0, 500),
      lastAttemptAt: new Date().toISOString(),
    },
  };
  await client.query(
    `UPDATE moderation_case
        SET provider_raw_response = $2::jsonb,
            ai_classification_label = 'provider_unavailable'
      WHERE id = $1 AND decision = 'pending'`,
    [caseId, JSON.stringify(raw)],
  );
}

/**
 * Give up on automated classification and hand the item to the Human Escalation Queue
 * (S16). Terminal for the gateway; the case stays `pending` because only a human can
 * decide it now (T36/T41). Never publishes, never drops — TRD apis[A7] failure posture.
 */
export async function escalateToHuman(client: Queryable, caseId: string): Promise<void> {
  await client.query(
    `UPDATE moderation_case
        SET risk_tier = 'escalate'
      WHERE id = $1 AND decision = 'pending'`,
    [caseId],
  );
}

export async function findCaseById(
  client: Queryable,
  caseId: string,
): Promise<ModerationCaseRow | null> {
  const { rows } = await client.query<ModerationCaseRow>(
    `SELECT id, question_id, answer_id, risk_tier, decision, ai_classification_label,
            provider_raw_response, created_at, updated_at
       FROM moderation_case WHERE id = $1`,
    [caseId],
  );
  return rows[0] ?? null;
}

export interface RetryableCase {
  id: string;
  question_id: string | null;
  answer_id: string | null;
  attempts: number;
  text: string;
  content_type: ContentType;
}

/** A case past the attempt ceiling. `RetryableCase` minus the text nothing re-classifies. */
export type ExhaustedCase = Omit<RetryableCase, "text">;

/**
 * Cases held after a failed classification and due for another attempt: still pending,
 * not yet escalated, under the attempt ceiling, and past the backoff window.
 *
 * `FOR UPDATE SKIP LOCKED` so more than one worker can run without double-classifying
 * the same case.
 */
export async function claimRetryableCases(
  client: DbClient,
  maxAttempts: number,
  backoffSeconds: number,
  limit: number,
): Promise<RetryableCase[]> {
  const { rows } = await client.query<RetryableCase>(
    `WITH due AS (
       SELECT mc.id
         FROM moderation_case mc
        WHERE mc.decision = 'pending'
          AND mc.risk_tier IS NULL
          AND COALESCE((mc.provider_raw_response -> '_gateway' ->> 'attempts')::int, 0) < $1
          AND (
                mc.provider_raw_response -> '_gateway' ->> 'lastAttemptAt' IS NULL
                OR (mc.provider_raw_response -> '_gateway' ->> 'lastAttemptAt')::timestamptz
                     < now() - make_interval(secs => $2)
              )
        ORDER BY mc.created_at
        LIMIT $3
        FOR UPDATE SKIP LOCKED
     )
     SELECT mc.id,
            mc.question_id,
            mc.answer_id,
            COALESCE((mc.provider_raw_response -> '_gateway' ->> 'attempts')::int, 0) AS attempts,
            COALESCE(q.title || ' ' || q.body, a.body) AS text,
            CASE WHEN mc.question_id IS NOT NULL THEN 'question' ELSE 'answer' END AS content_type
       FROM moderation_case mc
       JOIN due ON due.id = mc.id
       LEFT JOIN question q ON q.id = mc.question_id
       LEFT JOIN answer   a ON a.id = mc.answer_id`,
    [maxAttempts, backoffSeconds, limit],
  );
  return rows;
}

/**
 * Held cases that have exhausted their attempts and belong to a human now. Separate
 * from `claimRetryableCases` so the ceiling is applied in exactly one place.
 */
export async function claimExhaustedCases(
  client: DbClient,
  maxAttempts: number,
  limit: number,
): Promise<ExhaustedCase[]> {
  const { rows } = await client.query<ExhaustedCase>(
    // The content columns exist for T51's outcome event: an auto-escalation is a decision
    // about a specific item, and the caller cannot name it from a bare case id.
    `SELECT id,
            question_id,
            answer_id,
            COALESCE((provider_raw_response -> '_gateway' ->> 'attempts')::int, 0) AS attempts,
            CASE WHEN question_id IS NOT NULL THEN 'question' ELSE 'answer' END AS content_type
       FROM moderation_case
      WHERE decision = 'pending'
        AND risk_tier IS NULL
        AND COALESCE((provider_raw_response -> '_gateway' ->> 'attempts')::int, 0) >= $1
      ORDER BY created_at
      LIMIT $2
      FOR UPDATE SKIP LOCKED`,
    [maxAttempts, limit],
  );
  return rows;
}
