import { beforeEach, describe, expect, it } from "vitest";
import { MAX_STORED_ITEMS, createOutboxStore } from "../../client/src/outbox-store.js";
import { newOutboxItem, sendableCount, type OutboxItem } from "../../client/src/lib/outbox.js";
import type { KeyValueStorage } from "../../client/src/local-store.js";

/**
 * T28 — outbox persistence.
 *
 * The two things being defended here are the two that cannot be seen from the outside: a
 * queue that quietly belongs to the wrong student, and a write that quietly did not happen.
 */

class FakeStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  /** When set, every write throws — a full or blocked storage, which is a real device state. */
  failWrites = false;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("QuotaExceededError");
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

let counter = 0;
const nextId = (): string => `id-${String(++counter).padStart(4, "0")}`;

function item(at = "2026-08-11T09:00:00.000Z", overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    ...newOutboxItem(
      { entityType: "question", payload: { topic: "placements", title: "t", body: "b" } },
      nextId,
      new Date(at),
    ),
    ...overrides,
  } as OutboxItem;
}

let storage: FakeStorage;
beforeEach(() => {
  storage = new FakeStorage();
});

describe("the queue belongs to a profile, not to a device", () => {
  it("test_two_students_on_one_phone_do_not_share_a_queue", () => {
    // This is the assertion with the worst failure behind it. A10 attributes every queued
    // item to whoever is signed in when it flushes — so a shared queue publishes one
    // student's post under the other's pseudonym, in a product whose entire promise is that
    // a post cannot be traced to a person. It would look exactly like the app working.
    const asha = createOutboxStore("profile-asha", storage);
    const bilal = createOutboxStore("profile-bilal", storage);

    asha.enqueue(item());
    expect(asha.read()).toHaveLength(1);
    expect(bilal.read()).toHaveLength(0);

    bilal.enqueue(item());
    expect(asha.read()).toHaveLength(1);
    expect(bilal.read()).toHaveLength(1);
  });

  it("test_a_new_store_for_the_same_profile_sees_what_the_last_one_wrote", () => {
    createOutboxStore("profile-asha", storage).enqueue(item());
    expect(createOutboxStore("profile-asha", storage).read()).toHaveLength(1);
  });
});

describe("what a failed write reports", () => {
  it("test_a_write_that_did_not_land_says_so_instead_of_being_swallowed", () => {
    // session.ts can swallow a failed write — a session that does not persist is annoying.
    // An outbox that does not persist LOSES THE POST, so the caller is told and shows the
    // honest message (QUEUED_UNSAVED_MESSAGE) rather than a reassuring one.
    const store = createOutboxStore("profile-asha", storage);
    storage.failWrites = true;
    expect(store.enqueue(item()).persisted).toBe(false);
  });

  it("test_a_post_that_could_not_be_persisted_is_still_held_for_this_run", () => {
    const store = createOutboxStore("profile-asha", storage);
    storage.failWrites = true;
    store.enqueue(item());
    // Memory fallback: it can still be flushed before the app closes, which is better than
    // nothing and is exactly what the message promises.
    expect(store.read()).toHaveLength(1);
  });

  it("test_a_store_with_no_storage_at_all_still_works_for_one_run", () => {
    const store = createOutboxStore("profile-asha", null);
    expect(store.enqueue(item()).persisted).toBe(false);
    expect(store.read()).toHaveLength(1);
  });
});

describe("what is refused into the queue", () => {
  it("test_a_repeated_local_id_is_not_stored_twice", () => {
    // A10 refuses a whole batch containing two items with the same local id, which stalls
    // every other post in it. The duplicate is dropped here, where it costs nothing.
    const store = createOutboxStore("profile-asha", storage);
    const one = item();
    store.enqueue(one);
    store.enqueue(one);
    expect(store.read()).toHaveLength(1);
  });

  it("test_a_corrupt_stored_value_reads_as_an_empty_queue_rather_than_crashing", () => {
    storage.map.set("murmur.outbox.profile-asha", "{not json");
    expect(createOutboxStore("profile-asha", storage).read()).toEqual([]);
  });

  it("test_a_non_array_under_the_key_is_not_treated_as_a_queue", () => {
    storage.map.set("murmur.outbox.profile-asha", JSON.stringify({ hello: "world" }));
    expect(createOutboxStore("profile-asha", storage).read()).toEqual([]);
  });

  it("test_entries_missing_the_fields_a10_requires_are_dropped_not_sent", () => {
    // A malformed item earns a whole-batch 400 that stalls every real post behind it.
    storage.map.set(
      "murmur.outbox.profile-asha",
      JSON.stringify([{ clientLocalId: "x" }, item()]),
    );
    expect(createOutboxStore("profile-asha", storage).read()).toHaveLength(1);
  });
});

describe("the stored-item ceiling", () => {
  it("test_finished_items_are_dropped_before_any_unsent_post_is", () => {
    const store = createOutboxStore("profile-asha", storage);
    const finished = Array.from({ length: MAX_STORED_ITEMS }, (_, i) =>
      item(`2026-08-10T09:${String(i % 60).padStart(2, "0")}:00.000Z`, { status: "synced" }),
    );
    const unsent = Array.from({ length: 10 }, () => item("2026-08-11T09:00:00.000Z"));
    const { items } = store.replace([...finished, ...unsent]);

    expect(items.length).toBeLessThanOrEqual(MAX_STORED_ITEMS);
    // Every unsent post survives. A queue that discards a post to make room for the history
    // of posts that already succeeded has its priorities exactly backwards.
    expect(sendableCount(items)).toBe(10);
  });

  it("test_nothing_is_dropped_when_the_queue_is_below_the_ceiling", () => {
    const store = createOutboxStore("profile-asha", storage);
    const some = Array.from({ length: 5 }, () => item());
    expect(store.replace(some).items).toHaveLength(5);
  });

  it("test_forget_terminal_keeps_only_what_still_has_to_be_sent", () => {
    const store = createOutboxStore("profile-asha", storage);
    store.replace([item("2026-08-11T09:00:00.000Z", { status: "synced" }), item()]);
    expect(store.forgetTerminal().items).toHaveLength(1);
    expect(store.read()[0]!.status).toBe("queued");
  });
});
