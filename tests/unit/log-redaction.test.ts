import { Writable } from "node:stream";
import pino from "pino";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * SECREG-PRV-5 — credentials must never reach the log stream.
 *
 * The finding, confirmed against a real dev log on 2026-08-02: `pino-http` serializes
 * `req.headers` and `res.headers` wholesale, and the redact list covered only application
 * fields. So every authenticated request logged a live `Bearer` session token, every
 * sliding refresh logged a freshly minted one in `x-session-refresh`, and the client IP
 * went out with both — against a product whose entire promise is that a post cannot be
 * traced back to a student.
 *
 * This builds a logger from the SAME exported `REDACT_PATHS` the service uses and feeds it
 * a log object shaped like pino-http's, then asserts the secrets are absent from the raw
 * serialized line. Asserting on the string, not the object, is deliberate: redaction is a
 * serialization-time transform, so only the emitted bytes prove anything.
 */

/**
 * Canaries, not realistic tokens. An earlier version used JWT-shaped base64 values and
 * gitleaks — correctly, on the evidence available to it — failed the build for a
 * high-entropy secret in a committed file. Redaction keys off the PATH, never the value,
 * so the shape buys nothing; matching the repo's existing "not-a-real-secret" convention
 * keeps a blocking control honest instead of teaching it to ignore this file.
 */
const SESSION_TOKEN = "session-token-canary-must-not-appear-in-logs";
const REFRESHED_TOKEN = "refreshed-token-canary-must-not-appear-either";
const CLIENT_IP = "203.0.113.77"; // TEST-NET-3, reserved for documentation (RFC 5737)

let REDACT_PATHS: readonly string[];
let REDACT_CENSOR: string;

/** Serializes one log record through a real pino instance and returns the emitted line. */
function emit(record: Record<string, unknown>): string {
  let out = "";
  const sink = new Writable({
    write(chunk, _enc, cb) {
      out += String(chunk);
      cb();
    },
  });
  const log = pino(
    { redact: { paths: [...REDACT_PATHS], censor: REDACT_CENSOR } },
    sink,
  );
  log.info(record, "request completed");
  return out;
}

/** A log record shaped the way pino-http actually emits one. */
function httpRecord() {
  return {
    req: {
      id: 1,
      method: "GET",
      url: "/questions",
      headers: {
        host: "localhost:4000",
        authorization: `Bearer ${SESSION_TOKEN}`,
        cookie: "ext_name=abc123; session=should-not-leak",
        "user-agent": "Mozilla/5.0",
      },
      remoteAddress: CLIENT_IP,
      remotePort: 51234,
    },
    res: {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-session-refresh": REFRESHED_TOKEN,
      },
    },
  };
}

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  const mod = await import("../../server/src/shared/logger.js");
  REDACT_PATHS = mod.REDACT_PATHS;
  REDACT_CENSOR = mod.REDACT_CENSOR;
});

describe("SECREG-PRV-5: request/response logging", () => {
  it("test_PRV5_authorization_header_never_reaches_the_log_stream", () => {
    const line = emit(httpRecord());
    expect(line).not.toContain(SESSION_TOKEN);
    expect(line).toContain(REDACT_CENSOR);
  });

  it("test_PRV5_sliding_refresh_token_never_reaches_the_log_stream", () => {
    // The subtler half: this token is MINTED by the server and handed back in a response
    // header, so it leaks even on requests that arrived with no credential at all.
    expect(emit(httpRecord())).not.toContain(REFRESHED_TOKEN);
  });

  it("test_PRV5_cookie_header_never_reaches_the_log_stream", () => {
    expect(emit(httpRecord())).not.toContain("should-not-leak");
  });

  it("test_PRV5_client_ip_never_reaches_the_log_stream", () => {
    expect(emit(httpRecord())).not.toContain(CLIENT_IP);
  });

  it("test_PRV5_application_level_identity_fields_stay_redacted", () => {
    // The original list's job — kept covered so a future edit cannot drop it while
    // adding header paths.
    const line = emit({ email: "someone@nitj.ac.in", token: "otp-123456" });
    expect(line).not.toContain("someone@nitj.ac.in");
    expect(line).not.toContain("otp-123456");
  });

  it("test_PRV5_non_secret_fields_are_still_logged", () => {
    // Redaction that swallows everything is useless for operating the service. Method,
    // URL and status must survive — they are what makes a log worth keeping.
    const line = emit(httpRecord());
    expect(line).toContain("/questions");
    expect(line).toContain("200");
  });
});
