import crypto from "node:crypto";
import { config } from "../config/index.js";

/**
 * Session tokens for the authenticated shell behind S5–S17.
 *
 * Design + rationale: `decisions/oq-14-session-mechanism.md` (plan T12, resolves the
 * repeat-session gap carried by UX OQ-14 and UI open_questions[repeat-session]).
 * Summary of what this module implements:
 *
 *   - Stateless signed tokens; no session table (the schema is frozen at 14 tables).
 *   - Two types: `bootstrap` (15 min, A2's response, exchangeable once for a session)
 *     and `session` (30 days, sliding). `typ` is signed and checked at every use site,
 *     so a bootstrap token is never accepted as a session token.
 *   - Dedicated versioned signing key (`v<n>:secret`), NOT the email-hash pepper that
 *     M1 borrowed — see the decision's §5.
 *   - Revocation is not this module's job: it is the live `pseudonymous_profile.status`
 *     read done by `requireSession` (decision §4).
 *
 * Token: base64url(payload).base64url(hmac).
 * `sub` is the pseudonymous_profile id and NOTHING else — the payload is readable by
 * anyone holding the token, so no identity material may enter it (NFR identity
 * non-disclosure).
 */

export type TokenType = "bootstrap" | "session";

export interface SessionPayload {
  sub: string; // pseudonymous_profile.id — never identity_account_id, never an email
  typ: TokenType;
  iat: number; // issued-at, epoch ms
  exp: number; // expiry, epoch ms
}

const BOOTSTRAP_TTL_MS = 15 * 60_000;

function ttlMsFor(typ: TokenType): number {
  return typ === "bootstrap" ? BOOTSTRAP_TTL_MS : config.sessionTtlDays * 86_400_000;
}

/**
 * Signing keys, versioned like the email pepper (RR-13) so a rotation does not log
 * every user out mid-flight: issue with the active key, verify against active +
 * retired. Spec form is `v<n>:<secret>`; a bare secret is tolerated for local dev.
 */
function secretOf(spec: string): string {
  const idx = spec.indexOf(":");
  return idx > 0 ? spec.slice(idx + 1) : spec;
}

function activeKey(): string {
  return secretOf(config.sessionSigningKey);
}

function verificationKeys(): string[] {
  const keys = [activeKey()];
  if (config.sessionSigningKeyRetired) keys.push(secretOf(config.sessionSigningKeyRetired));
  return keys.filter(Boolean);
}

function sign(body: string, key: string): string {
  return crypto.createHmac("sha256", key).update(body).digest("base64url");
}

function signatureMatches(body: string, presented: string): boolean {
  const a = Buffer.from(presented);
  let matched = false;
  for (const key of verificationKeys()) {
    const b = Buffer.from(sign(body, key));
    // Constant-time compare; do not short-circuit the loop on a match, so the work
    // done does not depend on which key verified.
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) matched = true;
  }
  return matched;
}

function issue(profileId: string, typ: TokenType, ttlMs = ttlMsFor(typ)): string {
  const now = Date.now();
  const payload: SessionPayload = { sub: profileId, typ, iat: now, exp: now + ttlMs };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, activeKey())}`;
}

/** A2's short-lived token. Only `POST /session/exchange` accepts it. */
export function issueBootstrapToken(profileId: string, ttlMs?: number): string {
  return issue(profileId, "bootstrap", ttlMs);
}

/** The real session credential, issued by the exchange and by sliding refresh. */
export function issueSessionToken(profileId: string, ttlMs?: number): string {
  return issue(profileId, "session", ttlMs);
}

/**
 * Verify a token AS a specific type. `expected` is required rather than optional:
 * an "is this token valid" check that does not say valid-for-what is how bootstrap
 * tokens get accepted as session credentials.
 */
export function verifyToken(token: string, expected: TokenType): SessionPayload | null {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!signatureMatches(body, sig)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  if (typeof payload.sub !== "string" || payload.sub === "") return null;
  if (payload.typ !== expected) return null;
  if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
  if (typeof payload.iat !== "number" || payload.iat > Date.now() + 60_000) return null;
  return payload;
}

/**
 * Sliding-window refresh (decision §3): once a session token is older than the
 * threshold, the next authenticated response hands back a fresh one via
 * `X-Session-Refresh`. Active users never expire; idle ones do, at `exp`.
 */
export function shouldRefresh(payload: SessionPayload, now = Date.now()): boolean {
  if (payload.typ !== "session") return false;
  return now - payload.iat >= config.sessionRefreshAfterDays * 86_400_000;
}

/** Extracts the credential from an `Authorization: Bearer <token>` header. */
export function bearerFrom(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match ? match[1]!.trim() : null;
}
