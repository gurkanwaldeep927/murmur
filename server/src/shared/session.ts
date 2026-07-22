import crypto from "node:crypto";
import { config } from "../config/index.js";

/**
 * Session tokens for the authenticated shell behind S5–S17.
 *
 * The FULL session mechanism (lifetime policy, refresh, persistence across app
 * restarts) is plan task T12 (M2, resolves UX OQ-14). M1's A2 only needs to RETURN a
 * short-lived session-bootstrap token so T12 does not have to retrofit the A2 response
 * shape (plan T8). This module issues + verifies that token now; T12 extends it.
 *
 * Token: base64url(payload).base64url(hmac). payload = {sub: profileId, exp: epochMs}.
 * Signed with the email-hash pepper's active secret (a server-held key already present);
 * T12 may introduce a dedicated session-signing key.
 */

interface SessionPayload {
  sub: string; // pseudonymous_profile id
  exp: number; // epoch ms
}

function signingKey(): string {
  // Reuse the active pepper secret as a signing key for M1's bootstrap token.
  const spec = config.emailHashPepperActive;
  const idx = spec.indexOf(":");
  return idx > 0 ? spec.slice(idx + 1) : spec;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

const BOOTSTRAP_TTL_MS = 15 * 60_000; // short-lived; T12 sets the real policy.

export function issueBootstrapToken(profileId: string, ttlMs = BOOTSTRAP_TTL_MS): string {
  const payload: SessionPayload = { sub: profileId, exp: Date.now() + ttlMs };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac("sha256", signingKey()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64url(crypto.createHmac("sha256", signingKey()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
