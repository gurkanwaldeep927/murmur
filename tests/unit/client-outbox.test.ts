import { describe, expect, it } from "vitest";
import {
  LOCAL_ACCOUNT_BANNED,
  LOCAL_PARENT_REJECTED,
  MAX_BATCH_ITEMS,
  applyResults,
  isSendable,
  isTerminal,
  newOutboxItem,
  nextBatch,
  rejectAll,
  sendableCount,
  toWire,
  type OutboxItem,
} from "../../client/src/lib/outbox.js";

/**
 * T28 — the offline outbox model.
 *
 * Every assertion here is about a post surviving. The failures this file exists to catch do
 * not throw and do not log: a duplicated post, a queue that spins, an answer destroyed for
 * arriving one batch ahead of its own question. They would all look like the app working.
 */

let counter = 0;
const nextId = (): string => `id-${String(++counter).padStart(4, "0")}`;

function question(at: string, overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    ...newOutboxItem(
      { entityType: "question", payload: { topic: "placements", title: "t", body: "b" } },
      nextId,
      new Date(at),
    ),
    ...overrides,
  } as OutboxItem;
}

function answerTo(parentLocalId: string, at: string, overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    ...newOutboxItem(
      { entityType: "answer", payload: { parentClientLocalId: parentLocalId, body: "b" } },
      nextId,
      new Date(at),
    ),
    ...overrides,
  } as OutboxItem;
}

describe("outbox item creation", () => {
  it("test_local_id_and_idempotency_key_are_two_different_values", () => {
    const item = question("2026-08-11T10:00:00.000Z");
    expect(item.clientLocalId).not.toEqual(item.idempotencyKey);
    expect(item.status).toBe("queued");
    expect(item.attempts).toBe(0);
  });

  it("test_a_supplied_idempotency_key_is_reused_not_replaced", () => {
    // The composer tried online first and may already have been written server-side. A
    // fresh key here posts the same question twice under the student's own name, with
    // nothing tying the two copies together — the single worst bug this task can ship.
    const carried = "key-from-the-online-attempt";
    const item = newOutboxItem(
      { entityType: "question", payload: { topic: "placements", title: "t", body: "b" } },
      nextId,
      new Date("2026-08-11T10:00:00.000Z"),
      carried,
    );
    expect(item.idempotencyKey).toBe(carried);
    expect(item.clientLocalId).not.toBe(carried);
  });
});

describe("what counts as finished", () => {
  it("test_only_synced_rejected_and_conflict_are_terminal", () => {
    expect(isTerminal("synced")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("conflict")).toBe(true);
    expect(isTerminal("queued")).toBe(false);
    // `pending` means the SERVER has it and something transient stopped it. Treating it as
    // finished would abandon a post that was always going to succeed.
    expect(isTerminal("pending")).toBe(false);
  });
});

describe("choosing the next batch", () => {
  it("test_batch_is_ordered_oldest_first_by_the_phones_own_clock", () => {
    const late = question("2026-08-11T12:00:00.000Z");
    const early = question("2026-08-11T09:00:00.000Z");
    const batch = nextBatch([late, early]);
    expect(batch.map((i) => i.clientLocalId)).toEqual([early.clientLocalId, late.clientLocalId]);
  });

  it("test_terminal_items_are_never_re_sent", () => {
    const done = question("2026-08-11T09:00:00.000Z", { status: "synced" });
    const live = question("2026-08-11T10:00:00.000Z");
    expect(nextBatch([done, live]).map((i) => i.clientLocalId)).toEqual([live.clientLocalId]);
  });

  it("test_batch_never_exceeds_the_cap", () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      question(`2026-08-11T10:${String(i % 60).padStart(2, "0")}:00.000Z`),
    );
    expect(nextBatch(many).length).toBe(MAX_BATCH_ITEMS);
    expect(nextBatch(many, 7).length).toBe(7);
  });

  it("test_an_answer_is_never_sent_without_the_question_it_names", () => {
    // A10 resolves `parentClientLocalId` against the owner's queue rows, and a local id the
    // server has never seen is `parent_question_not_found` — TERMINAL. So an answer that
    // arrives one batch ahead of its own question is DESTROYED, permanently, by nothing but
    // batch arithmetic. This is the test that stops that.
    const parent = question("2026-08-11T09:00:00.000Z");
    // A phone's clock is not a source of truth — it drifts, it gets set by hand, it jumps on
    // a timezone change. So the child can genuinely carry an EARLIER timestamp than the
    // question it answers, and ordering alone would then put it first and destroy it. This
    // is the case the guard exists for, so it is the case the test uses.
    const skewedChild = answerTo(parent.clientLocalId, "2026-08-11T08:00:00.000Z");

    const first = nextBatch([parent, skewedChild], 10);
    expect(first.map((i) => i.clientLocalId)).toEqual([parent.clientLocalId]);

    // Once the question is in a batch of its own, the answer follows on the next pass.
    const afterParentSynced = nextBatch(
      [{ ...parent, status: "synced" as const }, { ...skewedChild }],
      10,
    );
    expect(afterParentSynced).toHaveLength(0); // still holding: nothing rewrote the reference

    // And with the cap cutting between them, the child waits rather than jumping ahead.
    const filler = question("2026-08-11T07:00:00.000Z");
    const capped = nextBatch([filler, parent, skewedChild], 2);
    expect(capped.map((i) => i.clientLocalId)).toEqual([filler.clientLocalId, parent.clientLocalId]);
  });

  it("test_an_orphan_answer_is_held_rather_than_sent_to_be_destroyed", () => {
    const orphan = answerTo("a-parent-that-is-not-in-this-queue", "2026-08-11T09:00:00.000Z");
    expect(nextBatch([orphan])).toEqual([]);
    // Held, not discarded — it is still the student's answer.
    expect(sendableCount([orphan])).toBe(1);
  });

  it("test_every_local_id_in_a_batch_is_unique", () => {
    // A10 refuses a whole batch containing a repeated local id, which stalls every real
    // post behind it rather than just the offender.
    const batch = nextBatch([
      question("2026-08-11T09:00:00.000Z"),
      question("2026-08-11T09:01:00.000Z"),
      question("2026-08-11T09:02:00.000Z"),
    ]);
    expect(new Set(batch.map((i) => i.clientLocalId)).size).toBe(batch.length);
  });
});

describe("the wire shape", () => {
  it("test_local_bookkeeping_never_goes_on_the_wire", () => {
    const wire = toWire(question("2026-08-11T09:00:00.000Z", { attempts: 4, errorReason: "x" }));
    expect(Object.keys(wire).sort()).toEqual(
      ["clientCreatedAt", "clientLocalId", "entityType", "idempotencyKey", "payload"].sort(),
    );
  });
});

describe("folding A10 results back into the queue", () => {
  it("test_synced_carries_the_server_id_and_is_final", () => {
    const item = question("2026-08-11T09:00:00.000Z");
    const { items, progressed } = applyResults(
      [item],
      [{ clientLocalId: item.clientLocalId, status: "synced", serverAssignedId: "server-1" }],
    );
    expect(items[0]!.status).toBe("synced");
    expect(items[0]!.serverAssignedId).toBe("server-1");
    expect(progressed).toBe(true);
  });

  it("test_an_unrecognised_status_stays_sendable_rather_than_being_guessed_terminal", () => {
    // Mirrors the server's own allowlist reasoning. A status nobody has classified yet
    // costs a retry if we guess "keep"; it costs the student their post if we guess "done".
    const item = question("2026-08-11T09:00:00.000Z");
    const { items } = applyResults(
      [item],
      [{ clientLocalId: item.clientLocalId, status: "something_invented_next_year" }],
    );
    expect(items[0]!.status).toBe("pending");
    expect(isSendable(items[0]!)).toBe(true);
  });

  it("test_conflict_is_kept_as_its_own_state_and_not_folded_into_rejected", () => {
    // A10 asserts conflict cannot be produced today. The day it can, "two versions of this
    // exist" is a different thing to tell a student than "this was refused".
    const item = question("2026-08-11T09:00:00.000Z");
    const { items } = applyResults(
      [item],
      [{ clientLocalId: item.clientLocalId, status: "conflict" }],
    );
    expect(items[0]!.status).toBe("conflict");
  });

  it("test_a_result_for_an_unknown_item_is_ignored_not_invented_into_one", () => {
    const item = question("2026-08-11T09:00:00.000Z");
    const { items } = applyResults([item], [{ clientLocalId: "never-heard-of-it", status: "synced" }]);
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe("queued");
  });

  it("test_an_item_with_no_result_is_left_untouched_and_still_sendable", () => {
    const item = question("2026-08-11T09:00:00.000Z");
    const { items } = applyResults([item], []);
    expect(items[0]!.status).toBe("queued");
    expect(items[0]!.attempts).toBe(0);
  });

  it("test_a_synced_question_rewrites_its_childrens_parent_reference_to_the_server_id", () => {
    // After this the answer is an ordinary post that would succeed even if every trace of
    // the server-side queue row were gone — the client stops depending on it.
    const parent = question("2026-08-11T09:00:00.000Z");
    const child = answerTo(parent.clientLocalId, "2026-08-11T09:05:00.000Z");
    const { items } = applyResults(
      [parent, child],
      [{ clientLocalId: parent.clientLocalId, status: "synced", serverAssignedId: "server-9" }],
    );
    const updated = items[1]!;
    expect(updated.entityType).toBe("answer");
    if (updated.entityType !== "answer") throw new Error("unreachable");
    expect(updated.payload.questionId).toBe("server-9");
    expect(updated.payload.parentClientLocalId).toBeUndefined();
    expect(updated.status).toBe("queued");
  });

  it("test_a_rejected_question_rejects_its_children_locally_instead_of_queueing_them_forever", () => {
    const parent = question("2026-08-11T09:00:00.000Z");
    const child = answerTo(parent.clientLocalId, "2026-08-11T09:05:00.000Z");
    const { items, progressed } = applyResults(
      [parent, child],
      [{ clientLocalId: parent.clientLocalId, status: "rejected", errorReason: "topic_invalid" }],
    );
    expect(items[1]!.status).toBe("rejected");
    expect(items[1]!.errorReason).toBe(LOCAL_PARENT_REJECTED);
    expect(progressed).toBe(true);
  });

  it("test_a_still_pending_parent_leaves_its_child_queued_rather_than_rejecting_it", () => {
    // The child's only problem is where it sits in a queue. Rejecting it here would throw
    // away a perfectly good answer.
    const parent = question("2026-08-11T09:00:00.000Z");
    const child = answerTo(parent.clientLocalId, "2026-08-11T09:05:00.000Z");
    const { items } = applyResults(
      [parent, child],
      [{ clientLocalId: parent.clientLocalId, status: "pending", errorReason: "internal_error" }],
    );
    expect(items[0]!.status).toBe("pending");
    expect(items[1]!.status).toBe("queued");
  });
});

describe("a banned caller's queue", () => {
  it("test_every_sendable_item_goes_terminal_so_the_phone_stops_retrying", () => {
    // sync.routes.ts states the obligation: "a phone that retries on 403 would carry those
    // posts forever". Nothing in the response body can say it, so it is asserted here.
    const done = question("2026-08-11T08:00:00.000Z", { status: "synced" });
    const live = question("2026-08-11T09:00:00.000Z");
    const { items, progressed } = rejectAll([done, live], LOCAL_ACCOUNT_BANNED);
    expect(sendableCount(items)).toBe(0);
    expect(items[1]!.errorReason).toBe(LOCAL_ACCOUNT_BANNED);
    expect(progressed).toBe(true);
    // An already-synced post is a fact and is not rewritten by a later ban.
    expect(items[0]!.status).toBe("synced");
    expect(items[0]!.errorReason).toBeNull();
  });
});
