/**
 * The ONLY event names A12 accepts from an unauthenticated client (PRV-7 / SEC-009).
 *
 * `POST /events` is public by necessity — the registration funnel it measures happens
 * before anyone has a session (R8). That makes it the app's one unauthenticated write,
 * so what it accepts has to be enumerated rather than described.
 *
 * Server-side instrumentation does NOT go through this list: `emit()` writes directly and
 * can use any name in `registration-events.ts` / `content-events.ts`. This is purely the
 * boundary for input that arrives over the network.
 *
 * Keep it in step with the `emitEvent(...)` calls in `client/src/`. A name missing here is
 * a dropped metric; a name here that the client never sends is harmless.
 */
export const CLIENT_EVENT_TYPES = new Set<string>([
  // Registration funnel (T45) — emitted from client/src/screens/verification-flow.ts
  "client.registration.verification_initiated",
  "client.registration.verification_resent",
  "client.registration.verification_confirmed",
  // M2 Q&A (T19/T51) — emitted from client/src/screens/app-shell.ts
  "client.content.question_submitted",
  "client.content.answer_submitted",
]);

/**
 * Metadata limits. The table is append-only and nothing deletes from it (PRV-1), so
 * anything accepted here is retained indefinitely — which makes an open `Record<string,
 * unknown>` a permanent store for whatever a caller chose to send, including the raw email
 * addresses the entire product exists to keep out of the database.
 */
export const METADATA_MAX_KEYS = 10;
export const METADATA_MAX_VALUE_LENGTH = 200;

/** Looks like an email address. Cheap, deliberately over-eager. */
const EMAIL_SHAPED = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export type MetadataSanitizeResult =
  | { ok: true; value: Record<string, string | number | boolean> | undefined }
  | { ok: false; reason: string };

/**
 * Reduce client metadata to flat primitives, bounded in count and length, with anything
 * email-shaped refused outright.
 *
 * Refusing rather than stripping is deliberate: silently dropping a field would let a
 * caller keep probing to find what gets through, and a client sending PII here is a bug
 * that should surface as a 400 rather than be quietly absorbed.
 */
export function sanitizeMetadata(raw: unknown): MetadataSanitizeResult {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "metadata must be an object" };
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > METADATA_MAX_KEYS) {
    return { ok: false, reason: `metadata may not exceed ${METADATA_MAX_KEYS} keys` };
  }

  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of entries) {
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(key)) {
      return { ok: false, reason: `metadata key is not permitted: ${key.slice(0, 40)}` };
    }
    // Nested structures are refused rather than flattened: they are the easiest way to
    // smuggle bulk content past a per-value length cap.
    if (typeof value === "object" && value !== null) {
      return { ok: false, reason: `metadata value must be a primitive: ${key}` };
    }
    if (typeof value === "string") {
      if (value.length > METADATA_MAX_VALUE_LENGTH) {
        return { ok: false, reason: `metadata value too long: ${key}` };
      }
      if (EMAIL_SHAPED.test(value)) {
        return { ok: false, reason: "metadata may not contain an email address" };
      }
      out[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (value !== undefined) {
      return { ok: false, reason: `metadata value must be a primitive: ${key}` };
    }
  }
  return { ok: true, value: Object.keys(out).length ? out : undefined };
}
