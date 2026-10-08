// Relative imports here carry an explicit `.js`, unlike the rest of `client/src`. These
// three modules are imported by `tests/unit/*`, which puts them inside the ROOT tsconfig
// program — and that one is NodeNext, where an extensionless relative import is an error.
// Vite resolves the same specifier back to the `.ts` file, so nothing changes at runtime.
import {
  LOCAL_ACCOUNT_BANNED,
  MAX_BATCH_ITEMS,
  applyResults,
  nextBatch,
  rejectAll,
  sendableCount,
  toWire,
  type OutboxWireItem,
  type SyncItemResult,
} from "./lib/outbox.js";
import type { OutboxStore } from "./outbox-store.js";

/**
 * The flush runner (plan T28) — what actually drains the outbox into A10.
 *
 * ## Why the transport is injected as a RESULT, not as a throwing call
 *
 * `sendBatch` returns a union instead of throwing `ApiCallError`. That keeps this module
 * free of `api.ts`, and therefore free of `fetch` and `import.meta.env` — which is what
 * lets the unit suite (`environment: "node"`) execute the retry decisions directly. The
 * adapter that turns a real HTTP failure into one of these three reasons lives in `api.ts`,
 * next to the error class it reads. This is the same trade `activity-ping.ts` made with
 * `document`.
 *
 * ## The three failure reasons, and why they are not one
 *
 *  - **`banned`** — a `403 account_banned`. A10 refuses a banned caller's batch as a whole
 *    rather than per item, so there are no results to fold. `sync.routes.ts` states the
 *    obligation this discharges: the queue must go terminal locally, because *"a phone that
 *    retries on 403 would carry those posts forever"*.
 *  - **`session_lost`** — a 401. The queue is **left exactly as it is.** It belongs to a
 *    profile, not to a session, and the same student signing back in must find their posts
 *    still queued. Deleting it here would be the offline-mode equivalent of losing the post.
 *  - **`unreachable`** — anything else: no network, a 5xx, a timeout. Stop and try later.
 *    Nothing is marked, because the server never answered and an attempt the server never
 *    saw is not an attempt.
 */

export type SendResult =
  | { ok: true; results: SyncItemResult[] }
  | { ok: false; reason: "banned" | "session_lost" | "unreachable" };

export interface SyncRunnerDeps {
  store: OutboxStore;
  sendBatch(items: OutboxWireItem[]): Promise<SendResult>;
  isOnline(): boolean;
  /** Subscribes to "the network came back"; returns a teardown. */
  onOnline(listener: () => void): () => void;
  maxBatchItems?: number;
  /** Safety stop for the multi-batch loop. A queue larger than this drains over more flushes. */
  maxRounds?: number;
}

export type FlushOutcome =
  | { outcome: "busy" }
  | { outcome: "offline"; remaining: number }
  | { outcome: "idle" }
  | { outcome: "done"; remaining: number; persisted: boolean }
  | { outcome: "banned"; rejected: number }
  | { outcome: "session_lost"; remaining: number }
  | { outcome: "unreachable"; remaining: number };

export interface SyncRunner {
  flush(): Promise<FlushOutcome>;
  /** Flushes now, and again whenever the network returns. Returns a teardown. */
  start(): () => void;
  pendingCount(): number;
}

export const DEFAULT_MAX_ROUNDS = 20;

export function createSyncRunner(deps: SyncRunnerDeps): SyncRunner {
  const max = deps.maxBatchItems ?? MAX_BATCH_ITEMS;
  const maxRounds = deps.maxRounds ?? DEFAULT_MAX_ROUNDS;

  // Single-flight. Two overlapping flushes would send the same batch twice: harmless on the
  // server (A10 replays idempotently) but the second one's results are computed from a
  // queue snapshot taken before the first one wrote, so folding them would resurrect items
  // the first flush had already finished.
  let running = false;

  async function flush(): Promise<FlushOutcome> {
    if (running) return { outcome: "busy" };
    if (!deps.isOnline()) {
      return { outcome: "offline", remaining: sendableCount(deps.store.read()) };
    }

    running = true;
    try {
      let persisted = true;
      let anySent = false;

      for (let round = 0; round < maxRounds; round++) {
        const items = deps.store.read();
        const batch = nextBatch(items, max);
        if (batch.length === 0) {
          return anySent
            ? { outcome: "done", remaining: sendableCount(items), persisted }
            : { outcome: "idle" };
        }

        const sent = await deps.sendBatch(batch.map(toWire));

        // Composing does not stop while a request is in flight. Fold the reply into
        // the current queue, otherwise replacing the pre-request snapshot silently
        // discards every post added during the await (OFFLINE-LOSS-1).
        const current = deps.store.read();

        if (!sent.ok) {
          if (sent.reason === "banned") {
            const rejected = rejectAll(current, LOCAL_ACCOUNT_BANNED);
            deps.store.replace(rejected.items);
            return {
              outcome: "banned",
              rejected: sendableCount(current) - sendableCount(rejected.items),
            };
          }
          const remaining = sendableCount(current);
          return sent.reason === "session_lost"
            ? { outcome: "session_lost", remaining }
            : { outcome: "unreachable", remaining };
        }

        anySent = true;
        const applied = applyResults(current, sent.results);
        const written = deps.store.replace(applied.items);
        persisted = persisted && written.persisted;

        // Another round is only worth a round trip if the queue actually shrank. Without
        // this, a batch that comes back entirely `pending` — an outage, a rate limit —
        // would be re-sent up to `maxRounds` times in one flush, turning a server that is
        // already struggling into one being hammered by every phone at once.
        if (sendableCount(written.items) >= sendableCount(current)) {
          return { outcome: "done", remaining: sendableCount(written.items), persisted };
        }
      }

      return { outcome: "done", remaining: sendableCount(deps.store.read()), persisted };
    } finally {
      running = false;
    }
  }

  return {
    flush,

    start(): () => void {
      void flush();
      // `online` is the browser's own "a network appeared" signal and it is the cheapest
      // correct trigger there is. It is not a guarantee of reachability — a captive portal
      // fires it too — which is why an unreachable flush costs nothing but one request and
      // leaves the queue untouched.
      return deps.onOnline(() => {
        void flush();
      });
    },

    pendingCount(): number {
      return sendableCount(deps.store.read());
    },
  };
}
