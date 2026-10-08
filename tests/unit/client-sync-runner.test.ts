import { describe, expect, it } from "vitest";
import { createSyncRunner, type SendResult } from "../../client/src/sync.js";
import { createOutboxStore } from "../../client/src/outbox-store.js";
import {
  newOutboxItem,
  sendableCount,
  type OutboxItem,
  type OutboxWireItem,
} from "../../client/src/lib/outbox.js";
import type { KeyValueStorage } from "../../client/src/local-store.js";

/**
 * T28 — the flush runner.
 *
 * Three of these tests are about NOT doing something: not deleting a queue on a 401, not
 * re-sending a batch that went nowhere, not running two flushes at once. Those are the
 * failures that cost either a student's post or a struggling server a stampede, and none of
 * them would show up as an error anywhere.
 */

class FakeStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

let counter = 0;
const nextId = (): string => `id-${String(++counter).padStart(4, "0")}`;

function item(at = "2026-08-11T09:00:00.000Z"): OutboxItem {
  return newOutboxItem(
    { entityType: "question", payload: { topic: "placements", title: "t", body: "b" } },
    nextId,
    new Date(at),
  );
}

interface Harness {
  store: ReturnType<typeof createOutboxStore>;
  sent: OutboxWireItem[][];
  runner: ReturnType<typeof createSyncRunner>;
}

function harness(opts: {
  queue: OutboxItem[];
  reply: (batch: OutboxWireItem[], call: number) => SendResult | Promise<SendResult>;
  online?: boolean;
  maxBatchItems?: number;
}): Harness {
  const store = createOutboxStore("profile-asha", new FakeStorage());
  store.replace(opts.queue);
  const sent: OutboxWireItem[][] = [];
  const runner = createSyncRunner({
    store,
    sendBatch: async (batch) => {
      sent.push(batch);
      return opts.reply(batch, sent.length);
    },
    isOnline: () => opts.online ?? true,
    onOnline: () => () => undefined,
    ...(opts.maxBatchItems !== undefined ? { maxBatchItems: opts.maxBatchItems } : {}),
  });
  return { store, sent, runner };
}

const allSynced = (batch: OutboxWireItem[]): SendResult => ({
  ok: true,
  results: batch.map((i, n) => ({
    clientLocalId: i.clientLocalId,
    status: "synced",
    serverAssignedId: `server-${n}`,
  })),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("regression OFFLINE-LOSS-1: edits while a flush is in flight", () => {
  it("regression_OFFLINE-LOSS-1_late_answer_is_sent_after_parent_with_server_reference", async () => {
    const parent = item();
    const answer = newOutboxItem({ entityType: "answer", payload: { parentClientLocalId: parent.clientLocalId, body: "late answer" } }, nextId, new Date("2026-08-11T10:00:00.000Z"));
    const response = deferred<SendResult>();
    const h = harness({ queue: [parent], reply: (batch, call) => call === 1 ? response.promise : allSynced(batch) });
    const flush = h.runner.flush();
    h.store.enqueue(answer);
    response.resolve(allSynced(h.sent[0]!));
    expect(await flush).toEqual({ outcome: "done", remaining: 0, persisted: true });
    expect(h.sent).toHaveLength(2);
    expect(h.sent[1]).toEqual([expect.objectContaining({
      clientLocalId: answer.clientLocalId,
      entityType: "answer",
      payload: { questionId: "server-0", body: "late answer" },
    })]);
    expect(h.store.read()).toHaveLength(2);
    expect(h.store.read().every((post) => post.status === "synced")).toBe(true);
  });
  it("regression_OFFLINE-LOSS-1_preserves_and_drains_a_late_enqueue_even_when_sendable_count_is_unchanged", async () => {
    const original = item();
    const late = item("2026-08-11T10:00:00.000Z");
    const response = deferred<SendResult>();
    const h = harness({ queue: [original], reply: (batch, call) => call === 1 ? response.promise : allSynced(batch) });
    const flush = h.runner.flush();
    expect(h.sent).toHaveLength(1);
    h.store.enqueue(late);
    response.resolve(allSynced(h.sent[0]!));

    expect(await flush).toEqual({ outcome: "done", remaining: 0, persisted: true });
    expect(h.sent.map((batch) => batch.map((post) => post.clientLocalId))).toEqual([
      [original.clientLocalId], [late.clientLocalId],
    ]);
    expect(h.store.read().map((post) => ({ id: post.clientLocalId, status: post.status }))).toEqual([
      { id: original.clientLocalId, status: "synced" },
      { id: late.clientLocalId, status: "synced" },
    ]);
  });

  it("regression_OFFLINE-LOSS-1_preserves_late_enqueue_without_retrying_an_all_pending_batch", async () => {
    const original = item();
    const late = item("2026-08-11T10:00:00.000Z");
    const response = deferred<SendResult>();
    const h = harness({ queue: [original], reply: () => response.promise });
    const flush = h.runner.flush();
    h.store.enqueue(late);
    response.resolve({ ok: true, results: [{ clientLocalId: original.clientLocalId, status: "pending", errorReason: "internal_error" }] });

    expect(await flush).toEqual({ outcome: "done", remaining: 2, persisted: true });
    expect(h.sent).toHaveLength(1);
    expect(h.store.read().map((post) => ({ id: post.clientLocalId, status: post.status, attempts: post.attempts }))).toEqual([
      { id: original.clientLocalId, status: "pending", attempts: 1 },
      { id: late.clientLocalId, status: "queued", attempts: 0 },
    ]);
  });

  it("regression_OFFLINE-LOSS-1_ban_rejects_late_enqueue_and_counts_only_new_rejections", async () => {
    const original = item();
    const terminal: OutboxItem = { ...item(), status: "rejected", errorReason: "validation_failed" };
    const late = item("2026-08-11T10:00:00.000Z");
    const response = deferred<SendResult>();
    const h = harness({ queue: [original, terminal], reply: () => response.promise });
    const flush = h.runner.flush();
    h.store.enqueue(late);
    response.resolve({ ok: false, reason: "banned" });

    expect(await flush).toEqual({ outcome: "banned", rejected: 2 });
    expect(h.sent).toHaveLength(1);
    expect(h.runner.pendingCount()).toBe(0);
    expect(h.store.read()).toHaveLength(3);
    expect(h.store.read().find((post) => post.clientLocalId === terminal.clientLocalId)).toEqual(terminal);
    for (const post of [original, late]) {
      expect(h.store.read().find((stored) => stored.clientLocalId === post.clientLocalId)).toMatchObject({
        status: "rejected", errorReason: "account_banned",
      });
    }
  });
});

describe("when there is no network", () => {
  it("test_offline_sends_nothing_and_keeps_the_queue", async () => {
    const h = harness({
      queue: [item()],
      reply: allSynced,
      online: false,
    });
    const outcome = await h.runner.flush();
    expect(outcome).toEqual({ outcome: "offline", remaining: 1 });
    expect(h.sent).toHaveLength(0);
  });

  it("test_an_empty_queue_is_idle_rather_than_a_request", async () => {
    const h = harness({ queue: [], reply: allSynced });
    expect(await h.runner.flush()).toEqual({ outcome: "idle" });
    expect(h.sent).toHaveLength(0);
  });
});

describe("a normal drain", () => {
  it("test_a_synced_batch_leaves_nothing_to_send", async () => {
    const h = harness({ queue: [item(), item("2026-08-11T09:01:00.000Z")], reply: allSynced });
    const outcome = await h.runner.flush();
    expect(outcome).toEqual({ outcome: "done", remaining: 0, persisted: true });
    expect(h.store.read().every((i) => i.status === "synced")).toBe(true);
  });

  it("test_a_queue_larger_than_one_batch_drains_over_several_rounds_in_one_flush", async () => {
    const queue = Array.from({ length: 7 }, (_, i) =>
      item(`2026-08-11T09:0${i}:00.000Z`),
    );
    const h = harness({ queue, reply: allSynced, maxBatchItems: 3 });
    const outcome = await h.runner.flush();
    expect(h.sent.map((b) => b.length)).toEqual([3, 3, 1]);
    expect(outcome).toEqual({ outcome: "done", remaining: 0, persisted: true });
  });

  it("test_the_oldest_post_goes_first", async () => {
    const older = item("2026-08-11T08:00:00.000Z");
    const newer = item("2026-08-11T09:00:00.000Z");
    const h = harness({ queue: [newer, older], reply: allSynced });
    await h.runner.flush();
    expect(h.sent[0]![0]!.clientLocalId).toBe(older.clientLocalId);
  });
});

describe("a batch that goes nowhere", () => {
  it("test_an_all_pending_batch_is_not_re_sent_in_the_same_flush", async () => {
    // Without this guard an outage would have every phone re-sending the same batch up to
    // `maxRounds` times in one flush — a server that is already struggling being hammered
    // hardest at the worst moment. The queue shrank by nothing, so there is nothing to gain.
    const h = harness({
      queue: [item(), item("2026-08-11T09:01:00.000Z")],
      reply: (batch) => ({
        ok: true,
        results: batch.map((i) => ({
          clientLocalId: i.clientLocalId,
          status: "pending",
          errorReason: "internal_error",
        })),
      }),
    });
    const outcome = await h.runner.flush();
    expect(h.sent).toHaveLength(1);
    expect(outcome).toEqual({ outcome: "done", remaining: 2, persisted: true });
  });

  it("test_a_partly_successful_batch_does_go_round_again", async () => {
    const stubborn = item("2026-08-11T08:00:00.000Z");
    const fine = item("2026-08-11T09:00:00.000Z");
    const h = harness({
      queue: [stubborn, fine],
      maxBatchItems: 2,
      reply: (batch, call) =>
        call === 1
          ? {
              ok: true,
              results: batch.map((i) => ({
                clientLocalId: i.clientLocalId,
                status: i.clientLocalId === stubborn.clientLocalId ? "pending" : "synced",
                ...(i.clientLocalId === fine.clientLocalId ? { serverAssignedId: "s1" } : {}),
              })),
            }
          : {
              ok: true,
              results: batch.map((i) => ({
                clientLocalId: i.clientLocalId,
                status: "synced",
                serverAssignedId: "s2",
              })),
            },
    });
    await h.runner.flush();
    expect(h.sent).toHaveLength(2);
    expect(sendableCount(h.store.read())).toBe(0);
  });
});

describe("the three transport failures, which are not one failure", () => {
  it("test_a_ban_takes_the_whole_queue_terminal_so_the_phone_stops_carrying_it", async () => {
    // sync.routes.ts: "a phone that retries on 403 would carry those posts forever."
    const h = harness({
      queue: [item(), item("2026-08-11T09:01:00.000Z")],
      reply: () => ({ ok: false, reason: "banned" }),
    });
    const outcome = await h.runner.flush();
    expect(outcome).toEqual({ outcome: "banned", rejected: 2 });
    expect(sendableCount(h.store.read())).toBe(0);
    expect(h.store.read().every((i) => i.errorReason === "account_banned")).toBe(true);
  });

  it("test_a_dead_session_leaves_the_queue_exactly_where_it_was", async () => {
    // The queue belongs to a PROFILE, not a session. The same student signing back in must
    // find their posts still there; clearing here would be losing the post by another name.
    const h = harness({
      queue: [item()],
      reply: () => ({ ok: false, reason: "session_lost" }),
    });
    expect(await h.runner.flush()).toEqual({ outcome: "session_lost", remaining: 1 });
    expect(h.store.read()[0]!.status).toBe("queued");
    expect(h.store.read()[0]!.attempts).toBe(0);
  });

  it("test_an_unreachable_server_marks_nothing_because_it_answered_nothing", async () => {
    // An attempt the server never saw is not an attempt. Counting it would inflate the
    // retry history of a post that was never actually refused by anyone.
    const h = harness({
      queue: [item()],
      reply: () => ({ ok: false, reason: "unreachable" }),
    });
    expect(await h.runner.flush()).toEqual({ outcome: "unreachable", remaining: 1 });
    expect(h.store.read()[0]!.attempts).toBe(0);
    expect(h.store.read()[0]!.status).toBe("queued");
  });
});

describe("two flushes at once", () => {
  it("test_a_second_flush_is_refused_while_the_first_is_in_flight", async () => {
    // Both would read the same pre-flush snapshot, so folding the second one's results
    // would resurrect items the first had already finished.
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = harness({
      queue: [item()],
      reply: async (batch) => {
        await gate;
        return allSynced(batch);
      },
    });

    const first = h.runner.flush();
    const second = await h.runner.flush();
    expect(second).toEqual({ outcome: "busy" });
    release!();
    await first;
    expect(h.sent).toHaveLength(1);
  });
});

describe("the network coming back", () => {
  it("test_start_flushes_now_and_again_on_every_online_event", async () => {
    const store = createOutboxStore("profile-asha", new FakeStorage());
    store.replace([item()]);
    let listener: (() => void) | null = null;
    let calls = 0;
    const runner = createSyncRunner({
      store,
      sendBatch: async (batch) => {
        calls++;
        return allSynced(batch);
      },
      isOnline: () => true,
      onOnline: (l) => {
        listener = l;
        return () => undefined;
      },
    });

    const teardown = runner.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);

    store.replace([item("2026-08-11T10:00:00.000Z")]);
    listener!();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
    teardown();
  });
});
