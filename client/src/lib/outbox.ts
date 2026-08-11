/**
 * The offline outbox model (plan T28; TRD write_model[offline_write_queue]; UX F9).
 *
 * IMPORT-FREE BY DESIGN — see the note at the top of `format.ts`. This module carries the
 * decisions that decide whether a post written with no signal survives, so it is
 * deliberately the part of the client the root test suite can execute without a browser.
 *
 * ## The two identifiers, and why confusing them is the classic offline bug
 *
 * `clientLocalId` is the id the phone invents for its own queue row. Every result A10
 * returns is keyed by it, and it is what an offline answer uses to point at an offline
 * question that has no server id yet. `idempotencyKey` is a different thing entirely: it is
 * what A3/A4 use to recognise a REPLAY of the same post. Both are generated once, at
 * enqueue, and **neither is ever regenerated** — regenerating either turns a retry into a
 * second post, which is the failure the whole mechanism exists to prevent.
 *
 * ## Statuses
 *
 * `queued` is the client's own, and it means "no server has ever answered about this". The
 * other four are the server's own vocabulary (`sync_status_enum`), carried verbatim rather
 * than translated into a second dialect that could drift.
 *
 * There is deliberately **no persisted `sending`**. The server's enum has `syncing` and
 * nothing anywhere writes it — T32's watchdog watches for it precisely because a state
 * nothing writes is a state nobody would notice being written by mistake and never cleared.
 * A phone that died mid-flush with `sending` on disk would own exactly that bug: an item
 * that is not terminal and not sendable, invisible to every retry. In-flight is tracked in
 * memory by the runner (`sync.ts`) and dies with the process, which is the correct
 * lifetime for it.
 */

/** Mirrors `sync_entity_type_enum` (migration 004) and A10's discriminator. */
export type OutboxEntityType = "question" | "answer" | "vote" | "report";

/** Mirrors `sync.types.ts`. Kept structural rather than imported — this file is import-free. */
export interface QuestionPayload {
  topic: string;
  title: string;
  body: string;
}
export interface AnswerPayload {
  /** The server id, when the question was already live when they answered it. */
  questionId?: string;
  /** The phone's own id for the parent, when both were written offline. Exactly one of the two. */
  parentClientLocalId?: string;
  body: string;
}
export interface VotePayload {
  answerId: string;
  /** No score. The client sends WHICH answer and WHAT KIND; the server decides what it is worth. */
  kind: "upvote" | "accept";
}
export interface ReportPayload {
  questionId?: string;
  answerId?: string;
  reason: string;
  isAnonymous?: boolean;
}

/**
 * `queued` — never sent, or sent and the send itself failed before the server answered.
 * `pending` — the server has it recorded and something transient stopped it. Retry.
 * `synced` / `rejected` / `conflict` — terminal.
 */
export type OutboxStatus = "queued" | "pending" | "synced" | "rejected" | "conflict";

interface OutboxItemBase {
  clientLocalId: string;
  idempotencyKey: string;
  /** ISO-8601. The phone's own clock — A10 sorts a batch by it. */
  clientCreatedAt: string;
  status: OutboxStatus;
  /** Server-answered attempts. A send that never reached the server does not count. */
  attempts: number;
  errorReason: string | null;
  serverAssignedId: string | null;
}

export type OutboxItem =
  | (OutboxItemBase & { entityType: "question"; payload: QuestionPayload })
  | (OutboxItemBase & { entityType: "answer"; payload: AnswerPayload })
  | (OutboxItemBase & { entityType: "vote"; payload: VotePayload })
  | (OutboxItemBase & { entityType: "report"; payload: ReportPayload });

/** What actually goes on the wire — the local bookkeeping fields are not A10's business. */
export interface OutboxWireItem {
  clientLocalId: string;
  idempotencyKey: string;
  entityType: OutboxEntityType;
  payload: QuestionPayload | AnswerPayload | VotePayload | ReportPayload;
  clientCreatedAt: string;
}

/** One entry of A10's `results` array (`SyncItemResult` in `sync.service.ts`). */
export interface SyncItemResult {
  clientLocalId: string;
  status: string;
  serverAssignedId?: string;
  errorReason?: string;
  entityType?: string;
}

/**
 * Must equal `MAX_BATCH_ITEMS` in `server/src/modules/sync/sync.service.ts`. Sending more
 * is not a partial success — A10 answers a whole-batch 400 and every post in it stays
 * queued, so a drift here stalls the outbox permanently and silently.
 * `tests/unit/client-sync-contract.test.ts` compares the two numbers.
 */
export const MAX_BATCH_ITEMS = 50;

/** Reasons the client itself decides, so they cannot collide with a server error code. */
export const LOCAL_PARENT_REJECTED = "parent_rejected";
export const LOCAL_ACCOUNT_BANNED = "account_banned";

const TERMINAL: ReadonlySet<OutboxStatus> = new Set<OutboxStatus>([
  "synced",
  "rejected",
  "conflict",
]);

export function isTerminal(status: OutboxStatus): boolean {
  return TERMINAL.has(status);
}

export function isSendable(item: OutboxItem): boolean {
  return !isTerminal(item.status);
}

export function sendableCount(items: readonly OutboxItem[]): number {
  return items.filter(isSendable).length;
}

/**
 * A new queue row. `newId` is injected rather than imported so this module stays free of
 * `crypto` and therefore testable and importable anywhere; `api.ts` supplies the real
 * UUID factory at every call site.
 *
 * **`idempotencyKey` is an input, not always a fresh value, and that is the whole point of
 * the parameter.** A composer that tried to post online, timed out, and is now falling back
 * to the queue must carry the key it already used. The server may well have written that
 * post before the connection died; sending it again under a NEW key would create a second
 * copy of it, under the student's name, with nothing to tie the two together. Reusing the
 * key makes the queued send a replay of a write that may or may not have landed — which is
 * exactly the situation A3/A4's idempotent-replay branch was built for.
 */
export function newOutboxItem(
  input:
    | { entityType: "question"; payload: QuestionPayload }
    | { entityType: "answer"; payload: AnswerPayload }
    | { entityType: "vote"; payload: VotePayload }
    | { entityType: "report"; payload: ReportPayload },
  newId: () => string,
  now: Date = new Date(),
  idempotencyKey?: string,
): OutboxItem {
  const base = {
    clientLocalId: newId(),
    idempotencyKey: idempotencyKey ?? newId(),
    clientCreatedAt: now.toISOString(),
    status: "queued" as const,
    attempts: 0,
    errorReason: null,
    serverAssignedId: null,
  };
  return { ...base, ...input } as OutboxItem;
}

/** The local id of the parent this item waits on, or null when it waits on nothing. */
export function parentLocalIdOf(item: OutboxItem): string | null {
  return item.entityType === "answer" ? (item.payload.parentClientLocalId ?? null) : null;
}

function byClientCreatedAt(a: OutboxItem, b: OutboxItem): number {
  return a.clientCreatedAt < b.clientCreatedAt ? -1 : a.clientCreatedAt > b.clientCreatedAt ? 1 : 0;
}

/**
 * The next batch to send.
 *
 * Oldest-first, because that is the order A10 processes in and the order that lets an
 * answer written offline find the question it answers.
 *
 * **A child is never sent without its parent, and that rule protects a real post.** When an
 * answer names its parent by `parentClientLocalId`, A10 resolves it against the owner's
 * queue rows — and a local id the server has never seen is `parent_question_not_found`,
 * which is TERMINAL. So an answer that arrived one batch ahead of its own question would be
 * destroyed, permanently, for no reason but batch arithmetic. Holding it back costs one
 * round trip; the other arrangement costs the student their answer.
 *
 * The parent is naturally first (it was written first), so this only bites when the batch
 * cap cuts between them — and then the child simply goes next time.
 */
export function nextBatch(
  items: readonly OutboxItem[],
  max: number = MAX_BATCH_ITEMS,
): OutboxItem[] {
  const sendable = items.filter(isSendable).sort(byClientCreatedAt);
  const chosen: OutboxItem[] = [];
  const inBatch = new Set<string>();
  for (const item of sendable) {
    if (chosen.length >= max) break;
    const parent = parentLocalIdOf(item);
    if (parent !== null && !inBatch.has(parent)) continue;
    chosen.push(item);
    inBatch.add(item.clientLocalId);
  }
  return chosen;
}

export function toWire(item: OutboxItem): OutboxWireItem {
  return {
    clientLocalId: item.clientLocalId,
    idempotencyKey: item.idempotencyKey,
    entityType: item.entityType,
    payload: item.payload,
    clientCreatedAt: item.clientCreatedAt,
  };
}

/**
 * Fold one A10 result into one item.
 *
 * **An unrecognised status is treated as still-sendable, not as terminal**, mirroring the
 * server's own allowlist reasoning in `sync.service.ts`: the cost of a status nobody has
 * classified yet is a post that syncs one batch later; the cost of guessing terminal is a
 * post thrown away.
 */
function applyOne(item: OutboxItem, result: SyncItemResult): OutboxItem {
  const attempts = item.attempts + 1;
  switch (result.status) {
    case "synced":
      return {
        ...item,
        status: "synced",
        attempts,
        serverAssignedId: result.serverAssignedId ?? null,
        errorReason: null,
      };
    case "rejected":
      return {
        ...item,
        status: "rejected",
        attempts,
        errorReason: result.errorReason ?? "rejected",
      };
    case "conflict":
      // A10 asserts this cannot be produced today — nothing the queue carries is an edit.
      // Carried as its own terminal state rather than folded into `rejected`, because the
      // day it does appear, "two versions of this exist" is a different thing to tell a
      // student than "this was refused", and silently equating them would hide the arrival
      // of a rule nobody has designed yet.
      return { ...item, status: "conflict", attempts, errorReason: result.errorReason ?? null };
    default:
      return {
        ...item,
        status: "pending",
        attempts,
        errorReason: result.errorReason ?? null,
      };
  }
}

export interface ApplyOutcome {
  items: OutboxItem[];
  /** True when at least one item changed status — the runner's guard against looping forever. */
  progressed: boolean;
}

/**
 * Fold a whole `results` array into the queue.
 *
 * Two cascades run afterwards, and both exist so the client never depends on the server
 * still holding a queue row it wrote in an earlier batch:
 *
 *  - **A synced question rewrites its children's payloads** from `parentClientLocalId` to
 *    the real `questionId`. After that the answer is an ordinary post that would succeed
 *    even if every trace of the queue row were gone.
 *  - **A rejected question rejects its children locally**, with `parent_rejected` — the
 *    same code the server uses. Sending them would spend a round trip to be told exactly
 *    this, and leaving them queued would have T32's watchdog counting them forever.
 *
 * An item with no result in the response is left untouched and stays sendable. A result for
 * an item this queue does not have is ignored rather than invented into one.
 */
export function applyResults(
  items: readonly OutboxItem[],
  results: readonly SyncItemResult[],
): ApplyOutcome {
  const byLocalId = new Map(results.map((r) => [r.clientLocalId, r]));
  let progressed = false;

  let next = items.map((item) => {
    const result = byLocalId.get(item.clientLocalId);
    if (!result) return item;
    const updated = applyOne(item, result);
    if (updated.status !== item.status) progressed = true;
    return updated;
  });

  const syncedParents = new Map<string, string>();
  const rejectedParents = new Set<string>();
  for (const item of next) {
    if (item.entityType !== "question") continue;
    if (item.status === "synced" && item.serverAssignedId) {
      syncedParents.set(item.clientLocalId, item.serverAssignedId);
    } else if (item.status === "rejected" || item.status === "conflict") {
      rejectedParents.add(item.clientLocalId);
    }
  }

  next = next.map((item) => {
    if (item.entityType !== "answer") return item;
    const parent = item.payload.parentClientLocalId;
    if (!parent) return item;
    const serverId = syncedParents.get(parent);
    if (serverId) {
      return { ...item, payload: { body: item.payload.body, questionId: serverId } };
    }
    if (rejectedParents.has(parent) && isSendable(item)) {
      progressed = true;
      return { ...item, status: "rejected", errorReason: LOCAL_PARENT_REJECTED };
    }
    return item;
  });

  return { items: next, progressed };
}

/**
 * Every sendable item becomes terminally rejected.
 *
 * A10 refuses a banned caller's batch as a whole, by the same session gate every other
 * authenticated route uses — so the refusal arrives as a `403 account_banned` with no
 * per-item results at all. `sync.routes.ts` states the obligation this discharges: *"a
 * phone that retries on 403 would carry those posts forever"*. Nothing in the response body
 * can say that, which is why it is written here and tested.
 */
export function rejectAll(items: readonly OutboxItem[], reason: string): ApplyOutcome {
  let progressed = false;
  const next = items.map((item) => {
    if (!isSendable(item)) return item;
    progressed = true;
    return { ...item, status: "rejected" as const, errorReason: reason };
  });
  return { items: next, progressed };
}
