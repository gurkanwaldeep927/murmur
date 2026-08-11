/**
 * The guarded JSON slot every client-side store is built on (plan T28).
 *
 * `session.ts` already carries this shape inline — read through a try/catch, fall back to
 * memory, treat a corrupt value as absent. The outbox and the draft store need the same
 * thing, and a third hand-rolled copy is how the three quietly stop agreeing. Extracted
 * rather than duplicated; `session.ts` is deliberately left alone, because it is a T12
 * surface and T62 is an open gate over the session path.
 *
 * ## Storage is injected
 *
 * The same reason `activity-ping.ts` takes its `document`: reaching for the `localStorage`
 * global makes the module unimportable under `environment: "node"`, which is where the unit
 * suite runs — and the outbox is the one part of the client where a persistence bug costs a
 * student a post, so it has to be the part that is testable.
 *
 * ## Why a failed write is reported rather than swallowed
 *
 * `session.ts` can swallow one: a session that fails to persist degrades to "signed in
 * until reload", which is annoying and not lossy. **An outbox that fails to persist loses
 * the post** — the exact thing the offline queue exists to prevent. So `write` returns
 * whether it actually landed, and the caller is expected to say so rather than show a tick.
 */

/** The slice of `localStorage` this needs — declared locally so no DOM library is required. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface JsonSlot<T> {
  read(): T | null;
  /** True when the value reached durable storage. False means memory-only for this run. */
  write(value: T): boolean;
  clear(): void;
}

/**
 * Resolves the ambient `localStorage` when there is one. Private-mode Safari and disabled
 * storage both throw on access rather than returning null, so even reaching for it is
 * guarded.
 */
export function ambientStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function createJsonSlot<T>(key: string, storage: KeyValueStorage | null): JsonSlot<T> {
  // Survives a storage that is absent, full, or throwing, so the app still works for one
  // run. It is not a substitute for persistence and the return value of `write` says so.
  let memory: T | null = null;

  return {
    read(): T | null {
      let raw: string | null = null;
      try {
        raw = storage?.getItem(key) ?? null;
      } catch {
        return memory;
      }
      if (raw === null) return memory;
      try {
        return JSON.parse(raw) as T;
      } catch {
        // A corrupt entry is treated as absent AND removed. Left in place it would be
        // re-parsed and re-discarded on every read, and any later "why is this empty"
        // investigation would find a key that looks populated.
        this.clear();
        return null;
      }
    },

    write(value: T): boolean {
      memory = value;
      try {
        storage?.setItem(key, JSON.stringify(value));
        return storage !== null;
      } catch {
        return false;
      }
    },

    clear(): void {
      memory = null;
      try {
        storage?.removeItem(key);
      } catch {
        /* nothing else to do */
      }
    },
  };
}
