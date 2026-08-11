// Relative imports here carry an explicit `.js`, unlike the rest of `client/src`. These
// three modules are imported by `tests/unit/*`, which puts them inside the ROOT tsconfig
// program — and that one is NodeNext, where an extensionless relative import is an error.
// Vite resolves the same specifier back to the `.ts` file, so nothing changes at runtime.
import { ambientStorage, createJsonSlot, type KeyValueStorage } from "./local-store.js";
import { isSendable, isTerminal, type OutboxItem } from "./lib/outbox.js";

/**
 * Persistence for the offline outbox (plan T28).
 *
 * ## The store is scoped to one profile, and that is not tidiness
 *
 * The key carries the profile id. Two students share a phone more often than anyone plans
 * for, and a single shared queue would let the second one's session flush the first one's
 * posts — A10 attributes every item to `callerOf(req).id`, so those posts would be
 * published **under the wrong student's pseudonym**. In a product whose entire promise is
 * that a post cannot be traced to a person, mis-attributing one is the worst possible bug,
 * and it would look like a feature working. Scoping also mirrors the server, where
 * `uq_sync_queue_owner_local_id` is unique per owner rather than globally.
 *
 * A signed-out user has no queue. That is a deliberate limit, and it is stated in
 * `docs/TASK-STATUS.md`: composing while signed out is not a flow the product has.
 */

const KEY_PREFIX = "murmur.outbox.";

/**
 * `[ASSUMPTION]` — no upstream figure. A ceiling on stored items so a queue that never
 * drains cannot fill the origin's storage quota and start failing WRITES, which is the
 * failure mode that loses posts. Only TERMINAL items are ever dropped to stay under it —
 * a sendable post is never discarded to make room, whatever the count.
 */
export const MAX_STORED_ITEMS = 500;

export interface OutboxWriteResult {
  items: OutboxItem[];
  /** False means the queue is memory-only for this run — say so, do not show a tick. */
  persisted: boolean;
}

export interface OutboxStore {
  read(): OutboxItem[];
  enqueue(item: OutboxItem): OutboxWriteResult;
  replace(items: readonly OutboxItem[]): OutboxWriteResult;
  /** Drops finished items once the user has seen them (T31's dismiss). */
  forgetTerminal(): OutboxWriteResult;
}

/**
 * Oldest terminal items first, until the total fits. Sendable items are kept regardless,
 * so an over-full store degrades into "you can still post, you just lose the history"
 * rather than into "your post vanished".
 */
function trim(items: readonly OutboxItem[]): OutboxItem[] {
  if (items.length <= MAX_STORED_ITEMS) return [...items];
  const sendable = items.filter(isSendable);
  const terminal = items.filter((i) => isTerminal(i.status));
  const room = Math.max(0, MAX_STORED_ITEMS - sendable.length);
  const keptTerminal = terminal.slice(Math.max(0, terminal.length - room));
  // Original relative order is preserved rather than concatenating the two groups, because
  // T31 renders this list and a queue that reorders itself when it happens to be full reads
  // as a bug.
  const keep = new Set([...sendable, ...keptTerminal]);
  return items.filter((i) => keep.has(i));
}

export function createOutboxStore(
  profileId: string,
  storage: KeyValueStorage | null = ambientStorage(),
): OutboxStore {
  const slot = createJsonSlot<OutboxItem[]>(`${KEY_PREFIX}${profileId}`, storage);

  function read(): OutboxItem[] {
    const raw = slot.read();
    // A non-array under this key is a corrupt or foreign value, not an empty queue.
    return Array.isArray(raw) ? raw.filter(isOutboxItem) : [];
  }

  function persist(items: readonly OutboxItem[]): OutboxWriteResult {
    const trimmed = trim(items);
    return { items: trimmed, persisted: slot.write(trimmed) };
  }

  return {
    read,

    enqueue(item: OutboxItem): OutboxWriteResult {
      const current = read();
      // A duplicate local id would make two different posts share one result and mark both
      // as one — A10 refuses a batch containing one outright, which would stall the whole
      // queue rather than just this item.
      if (current.some((i) => i.clientLocalId === item.clientLocalId)) {
        return { items: current, persisted: true };
      }
      return persist([...current, item]);
    },

    replace(items: readonly OutboxItem[]): OutboxWriteResult {
      return persist(items);
    },

    forgetTerminal(): OutboxWriteResult {
      return persist(read().filter(isSendable));
    },
  };
}

/**
 * A stored value is only an outbox item if it still has the two ids and a payload. Anything
 * else came from a different version of this code or from something that is not us, and
 * sending it would earn a whole-batch 400 that stalls every real post behind it.
 */
function isOutboxItem(value: unknown): value is OutboxItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.clientLocalId === "string" &&
    typeof v.idempotencyKey === "string" &&
    typeof v.clientCreatedAt === "string" &&
    typeof v.entityType === "string" &&
    typeof v.status === "string" &&
    typeof v.payload === "object" &&
    v.payload !== null
  );
}
