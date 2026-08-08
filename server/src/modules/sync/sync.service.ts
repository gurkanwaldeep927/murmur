import { pool, withTransaction } from "../../db/pool.js";
import { AppError } from "../../shared/error-envelope.js";
import { logger } from "../../shared/logger.js";
import { reportLimiter } from "../../shared/rate-limit.js";
import { createAnswer, createQuestion } from "../content/content.service.js";
import { fileReport } from "../grievance/grievance.service.js";
import { acceptAnswer, upvoteAnswer } from "../reputation/reputation.service.js";
import * as repo from "./sync.repo.js";
import type { QueueRow, SyncStatus } from "./sync.repo.js";
import type { SyncItemInput } from "./sync.types.js";

/**
 * A10 — Sync Offline Write Queue (T29). TRD §6.
 *
 * ## The contract's one unusual sentence
 *
 * *"Partial-batch failure is expected, not exceptional."* Every item carries its own outcome
 * and nothing rolls the batch back, so one malformed post out of forty cannot cost a student
 * the other thirty-nine. That shapes the whole file: there is no batch-wide transaction.
 *
 * ## The distinction everything else rests on
 *
 * A failure is **terminal** or it is **transient**, and confusing the two is how an offline
 * post gets silently lost:
 *
 *  - terminal — a topic that does not exist, a parent that was itself refused, a vote on your
 *    own answer. These cannot become true later, so the item is `rejected` and the phone can
 *    stop carrying it.
 *  - transient — a database blip, a rate ceiling, an unexpected error. The post was never
 *    going to be refused; writing `rejected` for one of these DESTROYS it. The item stays
 *    `pending` with its attempt counted, and T32's reconciliation is what notices if it never
 *    resolves.
 *
 * Anything unrecognised is treated as transient. Erring toward "try again" costs a retry;
 * erring toward "rejected" costs the student their post.
 *
 * ## Moderation is not re-implemented here, and that is the point
 *
 * Items are processed by calling A3/A4 — the same functions the online path uses — so a synced
 * post goes through the moderation gateway for exactly the same reason an online one does.
 * R6's "no UGC bypasses it" holds here structurally rather than by a check somebody remembered
 * to add. Sync has no publish path of its own.
 */

/** `[ASSUMPTION]` — no upstream figure. Bounds one request's work; the phone sends more batches. */
export const MAX_BATCH_ITEMS = 50;

export interface SyncItemResult {
  clientLocalId: string;
  status: SyncStatus;
  /** Present on `synced` — the id the server assigned (A10 outputs). */
  serverAssignedId?: string;
  /** Stable error code on `rejected`, or the last transient cause while still pending. */
  errorReason?: string;
  entityType: string;
}

function resultOf(row: QueueRow): SyncItemResult {
  return {
    clientLocalId: row.client_local_id,
    status: row.sync_status,
    entityType: row.entity_type,
    ...(row.server_assigned_id ? { serverAssignedId: row.server_assigned_id } : {}),
    ...(row.error_reason ? { errorReason: row.error_reason } : {}),
  };
}

/**
 * Which refusals are permanent.
 *
 * An allowlist, not a denylist, deliberately: a code nobody has classified yet falls through
 * to transient and gets retried. The failure mode of a forgotten entry is a post that syncs
 * one batch later, rather than a post that is thrown away.
 */
const TERMINAL_CODES = new Set([
  "validation_failed",
  "topic_invalid",
  "parent_question_not_found",
  "idempotency_key_conflict",
  "answer_not_found",
  "self_vote_forbidden",
  "duplicate_vote_forbidden",
  "accept_not_question_author",
  "answer_already_accepted",
  "reported_content_not_found",
  "not_found",
]);

/** A parent this item depended on was itself refused, so this can never land either. */
const PARENT_REJECTED = "parent_rejected";
/** The parent is still queued: not a refusal, so the child waits with it. */
const PARENT_PENDING = "parent_pending";
const RATE_LIMITED = "rate_limited";

interface Processed {
  serverAssignedId: string;
}

export async function syncBatch(input: {
  ownerProfileId: string;
  items: SyncItemInput[];
}): Promise<SyncItemResult[]> {
  // Oldest first, by the phone's own clock. Within one batch this is what lets an answer
  // written offline find the question it answers: the question is processed first and gets a
  // server id, and `resolveLocalId` can then translate the child's reference.
  const ordered = [...input.items].sort(
    (a, b) => a.clientCreatedAt.getTime() - b.clientCreatedAt.getTime(),
  );

  const results: SyncItemResult[] = [];
  for (const item of ordered) {
    results.push(await syncOne(input.ownerProfileId, item));
  }
  // Answered in the order the CLIENT sent, not the order processed — the phone matches results
  // to its own queue positions, and silently reordering them invites an off-by-one there.
  const byLocalId = new Map(results.map((r) => [r.clientLocalId, r]));
  return input.items.map((i) => byLocalId.get(i.clientLocalId)!);
}

async function syncOne(
  ownerProfileId: string,
  item: SyncItemInput,
): Promise<SyncItemResult> {
  // Recorded before it is processed, in its own transaction. If the process dies on the next
  // line, the row exists and T32's reconciliation finds it — which is the difference between
  // "we lost a post" and "we can see exactly which post is stuck".
  const { row } = await withTransaction((client) =>
    repo.recordItem(client, {
      ownerProfileId,
      clientLocalId: item.clientLocalId,
      idempotencyKey: item.idempotencyKey,
      entityType: item.entityType,
      payload: item.payload,
      clientCreatedAt: item.clientCreatedAt,
    }),
  );

  // Already finished on an earlier batch. Return what was decided then rather than doing it
  // again — this is the idempotent replay A10 requires, and it is what makes a phone that
  // re-sends its whole queue harmless.
  if (row.sync_status === "synced" || row.sync_status === "rejected") return resultOf(row);

  try {
    const processed = await processItem(ownerProfileId, item);
    await repo.markSynced(pool, row.id, processed.serverAssignedId);
    return {
      clientLocalId: item.clientLocalId,
      entityType: item.entityType,
      status: "synced",
      serverAssignedId: processed.serverAssignedId,
    };
  } catch (err) {
    const terminal = terminalCodeOf(err);
    if (terminal) {
      await repo.markRejected(pool, row.id, terminal);
      return {
        clientLocalId: item.clientLocalId,
        entityType: item.entityType,
        status: "rejected",
        errorReason: terminal,
      };
    }
    const reason = transientReasonOf(err);
    await repo.markAttemptFailed(pool, row.id, reason);
    // Logged, because a transient failure that repeats forever is a real outage and the only
    // other trace of it is a retry_count nobody is watching until T32 lands.
    logger.warn(
      { syncItemId: row.id, entityType: item.entityType, reason },
      "sync item did not complete; left pending for retry",
    );
    return {
      clientLocalId: item.clientLocalId,
      entityType: item.entityType,
      status: "pending",
      errorReason: reason,
    };
  }
}

function terminalCodeOf(err: unknown): string | null {
  if (err instanceof SyncItemError) return err.terminal ? err.code : null;
  if (err instanceof AppError) {
    // A 429 is the clearest case of a refusal that is not a refusal: the request was fine and
    // the world was busy. Excluded explicitly rather than by not being in the set, so nobody
    // adds it later.
    if (err.code === "rate_limited") return null;
    return TERMINAL_CODES.has(err.code) ? err.code : null;
  }
  return null;
}

function transientReasonOf(err: unknown): string {
  if (err instanceof SyncItemError) return err.code;
  if (err instanceof AppError) return err.code;
  return "internal_error";
}

class SyncItemError extends Error {
  constructor(
    readonly code: string,
    readonly terminal: boolean,
  ) {
    super(code);
    this.name = "SyncItemError";
  }
}

/**
 * Translate a parent reference the phone wrote into a server id.
 *
 * The phone may name the parent either way: `questionId` when the question was already live
 * when they answered it, or `parentClientLocalId` when they wrote both offline and the
 * question had no server id yet. The second is the case `sync_queue_item` exists to serve
 * (schema §4a).
 */
async function resolveParentQuestion(
  ownerProfileId: string,
  payload: { questionId?: string; parentClientLocalId?: string },
): Promise<string> {
  if (payload.questionId) return payload.questionId;
  const local = payload.parentClientLocalId;
  if (!local) throw new SyncItemError("parent_question_not_found", true);

  const parent = await repo.resolveLocalId(pool, ownerProfileId, local);
  if (!parent) {
    // The phone referenced a queue item it never sent. Terminal: nothing later can supply it.
    throw new SyncItemError("parent_question_not_found", true);
  }
  if (parent.sync_status === "rejected") {
    // The question was refused, so its answer can never attach to anything.
    throw new SyncItemError(PARENT_REJECTED, true);
  }
  if (!parent.server_assigned_id) {
    // Still queued. NOT terminal — it may well succeed on the next batch, and rejecting the
    // child now would throw away a post whose only problem is its position in a queue.
    throw new SyncItemError(PARENT_PENDING, false);
  }
  return parent.server_assigned_id;
}

async function processItem(ownerProfileId: string, item: SyncItemInput): Promise<Processed> {
  switch (item.entityType) {
    case "question": {
      const p = item.payload;
      const created = await createQuestion({
        authorProfileId: ownerProfileId,
        topicSlug: p.topic,
        title: p.title,
        body: p.body,
        idempotencyKey: item.idempotencyKey,
      });
      // `held` is not a failure. A synced post that is still awaiting moderation is `synced`
      // as far as the QUEUE is concerned — it reached the server and left the phone's outbox.
      // Its moderation state is a separate axis, which is exactly what S12 renders.
      return { serverAssignedId: created.id };
    }

    case "answer": {
      const p = item.payload;
      const questionId = await resolveParentQuestion(ownerProfileId, p);
      const created = await createAnswer({
        questionId,
        authorProfileId: ownerProfileId,
        body: p.body,
        idempotencyKey: item.idempotencyKey,
      });
      return { serverAssignedId: created.id };
    }

    case "vote": {
      const p = item.payload;
      // Offline votes are represented ONLY as a queue row until this moment; the reputation
      // ledger never receives a client-supplied id or a merge (schema §4a). The server decides
      // the points here exactly as it does online (decisions/a6-vote-accept-semantics.md).
      const result =
        p.kind === "accept"
          ? await acceptAnswer({ actorProfileId: ownerProfileId, answerId: p.answerId })
          : await upvoteAnswer({ actorProfileId: ownerProfileId, answerId: p.answerId });
      return { serverAssignedId: result.answerId };
    }

    case "report": {
      const p = item.payload;
      // The per-profile report ceiling applies to offline reports too. Without this check the
      // sync route would be a way around it — the limiter is middleware on POST /reports, and
      // nothing in this path passes through that middleware. Over-budget is TRANSIENT: the
      // report is not invalid, it just arrived too fast.
      if (!reportLimiter.check(ownerProfileId)) {
        throw new SyncItemError(RATE_LIMITED, false);
      }
      const filed = await fileReport({
        reporterProfileId: ownerProfileId,
        target: p.questionId
          ? { type: "question", id: p.questionId }
          : { type: "answer", id: p.answerId! },
        reason: p.reason,
        isAnonymous: p.isAnonymous ?? false,
        idempotencyKey: item.idempotencyKey,
      });
      return { serverAssignedId: filed.reportId };
    }
  }
}
