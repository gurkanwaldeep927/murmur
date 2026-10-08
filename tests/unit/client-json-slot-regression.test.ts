import { describe, expect, it } from "vitest";
import { createJsonSlot, type KeyValueStorage } from "../../client/src/local-store.js";
import { createOutboxStore } from "../../client/src/outbox-store.js";
import { newOutboxItem } from "../../client/src/lib/outbox.js";

class QuotaStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  quotaFull = false;
  readsFail = false;
  removalsFail = false;
  getItem(key: string): string | null {
    if (this.readsFail) throw new Error("Storage unavailable");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.quotaFull) throw new Error("QuotaExceededError");
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    if (this.removalsFail) throw new Error("Storage unavailable");
    this.values.delete(key);
  }
}

describe("regression OFFLINE-LOSS-2: JSON slot memory fallback", () => {
  it("regression_OFFLINE-LOSS-2_failed_clear_does_not_resurrect_durable_value", () => {
    const storage = new QuotaStorage();
    storage.setItem("posts", JSON.stringify(["old-post"]));
    const slot = createJsonSlot<string[]>("posts", storage);
    expect(slot.read()).toEqual(["old-post"]);
    storage.removalsFail = true;
    slot.clear();
    expect(slot.read()).toBeNull();
    storage.readsFail = true;
    expect(slot.read()).toBeNull();
    storage.readsFail = false;
    expect(slot.write(["new-post"])).toBe(true);
    expect(createJsonSlot<string[]>("posts", storage).read()).toEqual(["new-post"]);
  });

  it("regression_OFFLINE-LOSS-2_successful_read_survives_later_storage_read_failure", () => {
    const storage = new QuotaStorage();
    storage.setItem("posts", JSON.stringify(["durable-post"]));
    const slot = createJsonSlot<string[]>("posts", storage);
    expect(slot.read()).toEqual(["durable-post"]);
    storage.readsFail = true;
    expect(slot.read()).toEqual(["durable-post"]);
  });

  it("regression_OFFLINE-LOSS-2_duplicate_enqueue_does_not_claim_failed_persistence_succeeded", () => {
    const storage = new QuotaStorage();
    const store = createOutboxStore("quota-profile", storage);
    let id = 0;
    const post = newOutboxItem({ entityType: "question", payload: { topic: "placements", title: "t", body: "b" } }, () => `quota-${++id}`, new Date("2026-08-11T09:00:00.000Z"));
    storage.quotaFull = true;
    expect(store.enqueue(post).persisted).toBe(false);
    expect(store.enqueue(post).persisted).toBe(false);
    expect(store.read()).toEqual([post]);
    storage.quotaFull = false;
    expect(store.enqueue(post).persisted).toBe(true);
    expect(createOutboxStore("quota-profile", storage).read()).toEqual([post]);
  });
  it("regression_OFFLINE-LOSS-2_failed_writes_keep_latest_memory_and_recovery_restores_durability", () => {
    const storage = new QuotaStorage();
    storage.setItem("posts", JSON.stringify(["durable-original"]));
    const slot = createJsonSlot<string[]>("posts", storage);
    expect(slot.read()).toEqual(["durable-original"]);
    storage.quotaFull = true;

    expect(slot.write([...slot.read()!, "first-memory-post"])).toBe(false);
    expect(slot.read()).toEqual(["durable-original", "first-memory-post"]);
    // The next read/modify/write must preserve the first unsaved post too.
    expect(slot.write([...slot.read()!, "second-memory-post"])).toBe(false);
    expect(slot.read()).toEqual(["durable-original", "first-memory-post", "second-memory-post"]);

    storage.quotaFull = false;
    const recovered = [...slot.read()!, "recovered-post"];
    expect(slot.write(recovered)).toBe(true);
    expect(slot.read()).toEqual(recovered);
    expect(createJsonSlot<string[]>("posts", storage).read()).toEqual(recovered);
  });

  it("regression_OFFLINE-LOSS-2_absent_storage_reports_memory_only_and_preserves_latest_value", () => {
    const slot = createJsonSlot<string[]>("posts", null);
    expect(slot.read()).toBeNull();
    expect(slot.write(["first"])).toBe(false);
    expect(slot.read()).toEqual(["first"]);
    expect(slot.write([...slot.read()!, "second"])).toBe(false);
    expect(slot.read()).toEqual(["first", "second"]);
  });
});
