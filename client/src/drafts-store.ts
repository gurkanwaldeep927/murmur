// Relative imports here carry an explicit `.js`, unlike the rest of `client/src`. These
// three modules are imported by `tests/unit/*`, which puts them inside the ROOT tsconfig
// program — and that one is NodeNext, where an extensionless relative import is an error.
// Vite resolves the same specifier back to the `.ts` file, so nothing changes at runtime.
import { ambientStorage, createJsonSlot, type KeyValueStorage } from "./local-store.js";
import { draftKeyOf, isEmptyDraft, mergeDraft, type Draft } from "./lib/drafts.js";

/**
 * Persistence for draft autosave (plan T28).
 *
 * Profile-scoped for the same reason the outbox is (`outbox-store.ts`): a half-written
 * thought is the most private thing this product ever holds — more private than a published
 * post, because the student never chose to show it to anyone — and the second person to use
 * the phone must not open the composer onto it. Migration 004 says the same thing about the
 * server-side table in its own header comment.
 *
 * The slot holds a MAP keyed by `draftKeyOf`, which is how the two unique indexes in
 * migration 004 are reproduced locally: saving overwrites the one slot instead of appending
 * a row per keystroke-batch.
 */

const KEY_PREFIX = "murmur.drafts.";

export interface DraftStore {
  read(key: string): Draft | null;
  /** Upsert. Saving an empty draft deletes it — an emptied composer has no draft. */
  save(draft: Draft): boolean;
  discard(key: string): boolean;
  all(): Draft[];
}

export function createDraftStore(
  profileId: string,
  storage: KeyValueStorage | null = ambientStorage(),
): DraftStore {
  const slot = createJsonSlot<Record<string, Draft>>(`${KEY_PREFIX}${profileId}`, storage);

  function readAll(): Record<string, Draft> {
    const raw = slot.read();
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }

  return {
    read(key: string): Draft | null {
      return readAll()[key] ?? null;
    },

    save(draft: Draft): boolean {
      const key = draftKeyOf(draft);
      const all = readAll();
      if (isEmptyDraft(draft)) {
        if (!(key in all)) return true;
        delete all[key];
        return slot.write(all);
      }
      // Merged rather than assigned: two tabs on the same origin share this storage, and
      // the later `updatedAt` is the only thing that can say which one is real.
      all[key] = mergeDraft(all[key] ?? null, draft);
      return slot.write(all);
    },

    discard(key: string): boolean {
      const all = readAll();
      if (!(key in all)) return true;
      delete all[key];
      return slot.write(all);
    },

    all(): Draft[] {
      return Object.values(readAll());
    },
  };
}
