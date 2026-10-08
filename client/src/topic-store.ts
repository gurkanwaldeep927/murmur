import { ambientStorage, createJsonSlot, type KeyValueStorage } from "./local-store.js";
import type { TopicRef } from "./lib/content-view.js";

/** Public reference data only: no feed, profile, session, or draft belongs here.
 * Previously fetched slugs let a returning student compose offline after a
 * reload. The server still validates the topic when the queued post is sent.
 */
export function createTopicStore(storage: KeyValueStorage | null = ambientStorage()): {
  read(): TopicRef[];
  save(topics: readonly TopicRef[]): boolean;
} {
  const slot = createJsonSlot<unknown>("murmur.topics.v1", storage);

  return {
    read(): TopicRef[] {
      const value = slot.read();
      if (!Array.isArray(value)) return [];
      return value.filter((topic): topic is TopicRef =>
        typeof topic === "object" && topic !== null &&
        typeof topic.slug === "string" && topic.slug.length > 0 &&
        typeof topic.label === "string" && topic.label.length > 0,
      ).map(({ slug, label }) => ({ slug, label }));
    },
    save(topics: readonly TopicRef[]): boolean {
      return slot.write(topics.map(({ slug, label }) => ({ slug, label })));
    },
  };
}
