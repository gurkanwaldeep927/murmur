import pino from "pino";
import { config } from "../config/index.js";

/**
 * Fields scrubbed from every log line.
 *
 * Exported so `tests/unit/log-redaction.test.ts` pins the real list rather than a copy of
 * it — a regression test asserting against its own duplicate of the config proves nothing
 * about what the service actually logs.
 *
 * PRV-5 (fixed 2026-08-02). This list used to cover only application fields, which missed
 * the ones that actually leaked: `pino-http` serializes `req.headers` and `res.headers`
 * wholesale, so every authenticated request wrote a LIVE `Bearer` session token to stdout,
 * and every sliding refresh wrote a brand-new one back in the `x-session-refresh` response
 * header. Confirmed in a real dev log on 2026-08-02.
 *
 * Two properties of pino's redaction shape the list:
 *  - paths are case-SENSITIVE, and Node lowercases incoming header names while code
 *    setting a response header keeps its own casing (`SESSION_REFRESH_HEADER` is
 *    `X-Session-Refresh`), so both spellings are listed;
 *  - a wildcard covers exactly one level, hence explicit `req.`/`res.` entries rather
 *    than relying on `*.headers`.
 */
export const REDACT_PATHS = [
  // --- application fields ---
  "email",
  "*.email",
  "email_encrypted",
  "*.email_encrypted",
  "email_hash",
  "*.email_hash",
  "token",
  "*.token",
  "verification_token_hash",
  "*.verification_token_hash",

  // --- credentials carried in HTTP headers (PRV-5) ---
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["set-cookie"]',
  "res.headers.authorization",
  'res.headers["set-cookie"]',
  // The sliding-refresh header IS a session token (shared/require-session.ts).
  'res.headers["x-session-refresh"]',
  'res.headers["X-Session-Refresh"]',

  // --- client IP: personal data under DPDP, and a deanonymisation vector against a
  // product whose entire promise is that a post cannot be traced back to a student ---
  "req.remoteAddress",
  "req.remotePort",
] as const;

export const REDACT_CENSOR = "[redacted]";

/**
 * Structured logger. Identity/PII fields (email, email_hash, tokens) are NEVER logged —
 * NFR "identity non-disclosure" applies to logs as well as API responses (privacy-agent
 * T61 baseline). Log identifiers (profile ids), never raw email.
 */
export const logger = pino({
  level: config.logLevel,
  redact: { paths: [...REDACT_PATHS], censor: REDACT_CENSOR },
});
