/**
 * Display formatting shared by the ported screens (T10, T19).
 *
 * IMPORT-FREE BY DESIGN. Root `tsc` compiles with `lib: ["ES2022"]` and
 * `module: NodeNext`; the client compiles with DOM libs and bundler resolution. A module
 * that imports nothing, touches no DOM type and reads no `import.meta` is valid under
 * both, which is what lets the root test suite cover it. Keep it that way — the moment
 * this file needs `document`, its logic stops being verifiable by the ladder.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Relative timestamps in the exact forms the designs use: "just now", "34m ago",
 * "2h ago", "yesterday", "6d ago", then an absolute date once "Nd ago" stops being
 * useful to a reader.
 */
export function relativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const elapsed = now - then;
  // Clock skew between phone and server: a few seconds in the future is not "in 3s".
  if (elapsed < 60_000) return "just now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`;

  const days = Math.floor(elapsed / DAY_MS);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * The API stores a bare enrollment year — `identity.service.ts` calls
 * `createProfile(..., String(parsed.year))`, so the value is "2026". Every design renders
 * that chip as "'26 batch" (S4, S5, S7, S8). This is the one place that gap is closed.
 *
 * Anything that is not a four-digit year passes through untouched: a future campus rule
 * could produce a different badge, and mangling it would be worse than showing it raw.
 */
export function formatYearBadge(raw: string): string {
  const year = /^\d{4}$/.exec(raw.trim());
  return year ? `'${raw.trim().slice(2)} batch` : raw;
}

/**
 * The designs give each author a small animal avatar, chosen in the mock by a hardcoded
 * map from pseudonym ("QuietFalcon" -> falcon). Real pseudonyms are `adjective-noun-NNNN`
 * (server/src/modules/profile/pseudonym.ts, e.g. "quiet-otter-4821") drawn from a 20-noun
 * list that is mostly not animals, so that map cannot survive contact with real data.
 *
 * Selection is a stable hash into the designers' own palette: the same author always gets
 * the same avatar (that persistence IS the point of a pseudonym), and no new visual choice
 * is made here. Which emoji represent the product is Claude Design's call — see
 * docs/design-prompts/T19-round-3.md gap 4.
 */
const AVATARS = ["🐦", "🦅", "🐈", "🌿", "🦉"] as const;

export function avatarFor(pseudonym: string): string {
  // FNV-1a. Any stable hash works; this one is short and has no dependencies.
  let hash = 0x811c9dc5;
  for (let i = 0; i < pseudonym.length; i++) {
    hash ^= pseudonym.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return AVATARS[hash % AVATARS.length]!;
}

/** "1 answer" / "4 answers" — the designs never render a bare count. */
export function answerCountLabel(count: number): string {
  return count === 1 ? "1 answer" : `${count} answers`;
}
