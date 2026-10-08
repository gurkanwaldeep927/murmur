import { describe, expect, it } from "vitest";
import { createTopicStore } from "../../client/src/topic-store.js";
import type { KeyValueStorage } from "../../client/src/local-store.js";

class TopicStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  quotaFull = false;
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void {
    if (this.quotaFull) throw new Error("QuotaExceededError");
    this.values.set(key, value);
  }
  removeItem(key: string): void { this.values.delete(key); }
}

const topics = [{ slug: "placements", label: "Placements" }, { slug: "campus", label: "Campus" }];

describe("regression OFFLINE-COMPOSE-1: safe offline topic catalogue", () => {
  it("regression_OFFLINE-COMPOSE-1_saved_topics_survive_a_new_store_instance", () => {
    const storage = new TopicStorage();
    expect(createTopicStore(storage).save(topics)).toBe(true);
    expect(createTopicStore(storage).read()).toEqual(topics);
  });

  it("regression_OFFLINE-COMPOSE-1_only_slug_and_label_are_persisted", () => {
    const storage = new TopicStorage();
    const store = createTopicStore(storage);
    const serverTopics = [{ ...topics[0]!, privateMetadata: "must not cache", id: "server-id" }];
    expect(store.save(serverTopics)).toBe(true);
    expect(store.read()).toEqual([topics[0]]);
    expect(JSON.parse(storage.getItem("murmur.topics.v1")!)).toEqual([topics[0]]);
  });

  it.each(["not json", "null", '{}', '[{"slug":7,"label":"Wrong"}]', '[{"slug":"campus"}]', '[{"slug":"","label":"Empty slug"}]', '[{"slug":"campus","label":""}]', '[null]'])(
    "regression_OFFLINE-COMPOSE-1_malformed_cached_catalogue_%s_is_ignored",
    (raw) => {
      const storage = new TopicStorage();
      storage.setItem("murmur.topics.v1", raw);
      expect(createTopicStore(storage).read()).toEqual([]);
    },
  );

  it("regression_OFFLINE-COMPOSE-1_cached_extra_fields_are_not_exposed", () => {
    const storage = new TopicStorage();
    storage.setItem("murmur.topics.v1", JSON.stringify([{ ...topics[0]!, privateMetadata: "old cache" }]));
    expect(createTopicStore(storage).read()).toEqual([topics[0]]);
  });

  it("regression_OFFLINE-COMPOSE-1_quota_failure_keeps_updated_topics_in_memory", () => {
    const storage = new TopicStorage();
    const store = createTopicStore(storage);
    expect(store.save([topics[0]!])).toBe(true);
    storage.quotaFull = true;
    expect(store.save(topics)).toBe(false);
    expect(store.read()).toEqual(topics);
    storage.quotaFull = false;
    expect(store.save(store.read())).toBe(true);
    expect(createTopicStore(storage).read()).toEqual(topics);
  });

  it("regression_OFFLINE-COMPOSE-1_absent_storage_reports_false_and_keeps_memory_topics", () => {
    const store = createTopicStore(null);
    expect(store.read()).toEqual([]);
    expect(store.save(topics)).toBe(false);
    expect(store.read()).toEqual(topics);
  });
});
