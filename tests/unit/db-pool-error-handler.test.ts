import { beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";

/**
 * TASK-STATUS problem #4 — a dropped idle connection must not take the process down, and
 * must never print the database password.
 *
 * Two distinct failures came out of the same missing listener, and each needs its own
 * assertion:
 *
 *  1. **Availability.** `pg.Pool` emits `error` when a client sitting idle in the pool
 *     dies. Against a remote database that happens routinely. With no listener, Node's
 *     EventEmitter contract throws it as an unhandled error and the API process exits.
 *  2. **Disclosure.** A pg error raised on a connection references the `Client` that
 *     raised it, and a `Client` holds `connectionParameters.password` — parsed straight
 *     out of `DATABASE_URL`. Anything that serializes the error object wholesale prints
 *     that password in clear text. Observed in test output on 2026-08-05.
 *
 * DB-free by construction: constructing a `pg.Pool` opens no socket, so this belongs in
 * the fast local subset. Nothing here connects.
 */

let pool: pg.Pool;
let poolErrorFields: (err: unknown) => { message: string; code?: string };

/** The canary. If this string ever reaches a log line, the disclosure bug is back. */
const PASSWORD_CANARY = "pool-password-canary-must-not-appear-in-logs";

/** An error shaped the way pg raises one on a dying connection: it carries the client. */
function connectionError(): Error {
  return Object.assign(new Error("Connection terminated unexpectedly"), {
    code: "ECONNRESET",
    client: {
      connectionParameters: {
        user: "postgres.projectref",
        password: PASSWORD_CANARY,
        host: "aws-0-ap-southeast-2.pooler.supabase.com",
        database: "postgres",
      },
    },
  });
}

beforeAll(async () => {
  // Same shape as tests/unit/log-redaction.test.ts: config refuses to start without these,
  // and no connection is ever attempted with them.
  process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  const mod = await import("../../server/src/db/pool.js");
  pool = mod.pool;
  poolErrorFields = mod.poolErrorFields;
});

describe("db pool: idle-connection errors", () => {
  it("test_pool_has_an_error_listener_attached", () => {
    // The defect was the absence of this listener, so assert on the registration itself
    // and not only on behaviour — this is the line that fails if someone removes it.
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
  });

  it("test_pool_error_does_not_throw_out_of_the_process", () => {
    // With no listener this same call throws (EventEmitter's unhandled-'error' contract),
    // which in production is the process exiting. Emitting with the client argument pg
    // really passes, so the test exercises the real signature.
    expect(() => pool.emit("error", connectionError(), {} as pg.PoolClient)).not.toThrow();
  });

  it("test_pool_error_log_fields_never_carry_the_connection_password", () => {
    // Asserting on the serialized string, not the object: disclosure happens at
    // serialization time, so only the bytes prove anything.
    const serialized = JSON.stringify(poolErrorFields(connectionError()));
    expect(serialized).not.toContain(PASSWORD_CANARY);
    expect(serialized).not.toContain("connectionParameters");
  });

  it("test_pool_error_log_fields_keep_what_makes_the_line_actionable", () => {
    // Redaction that swallows everything is useless for operating the service: without the
    // code and message this log line cannot tell a recycled connection apart from a
    // credential failure.
    const fields = poolErrorFields(connectionError());
    expect(fields.message).toBe("Connection terminated unexpectedly");
    expect(fields.code).toBe("ECONNRESET");
  });

  it("test_pool_error_fields_handle_a_non_error_rejection", () => {
    // pg is not the only thing that can emit here, and a handler that throws while
    // handling an error puts us back where we started.
    expect(poolErrorFields("socket hang up")).toEqual({ message: "socket hang up" });
  });
});
