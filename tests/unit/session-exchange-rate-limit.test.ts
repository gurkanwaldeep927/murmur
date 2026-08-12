import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

/**
 * SEC-023 (T62 fix-list) — `POST /session/exchange` had no rate limit at all.
 *
 * It was the last credential-handling endpoint in the app with no ceiling. It cannot sit
 * behind `requireSession` — a bootstrap token is the credential it accepts — so the
 * per-address limiter used by A1/A2 is the only kind available here.
 *
 * What this is NOT defending against, stated so the test is not misread: a forged
 * bootstrap token. The signature is HMAC-SHA256 and guessing it is infeasible, so a budget
 * would not be what stopped that. What it defends is the unauthenticated database read
 * every allowed call performs (`findProfileById`) — an unbounded route that reads Postgres
 * for free is an amplifier, which is the same reason A12 has a ceiling.
 *
 * DB-free by construction, and that is itself the property under test: the limiter must
 * refuse an over-budget caller BEFORE the handler reaches the database. If these tests ever
 * start needing a live Postgres, the middleware has been registered in the wrong order.
 */

let app: import("express").Express;
let limiter: (typeof import("../../server/src/shared/rate-limit.js"))["exchangeLimiter"];

const BUDGET = 3;

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.RATE_LIMIT_EXCHANGE_PER_HOUR ??= String(BUDGET);
  app = (await import("../../server/src/app.js")).createApp();
  ({ exchangeLimiter: limiter } = await import("../../server/src/shared/rate-limit.js"));
});

beforeEach(() => limiter.reset());

/** An unusable token: rejected by the handler, so a 401 proves the limiter let it past. */
const exchange = () => request(app).post("/session/exchange").send({ token: "not.a.real.token" });

describe("SEC-023: the exchange route is bounded", () => {
  it("test_SEC023_calls_within_budget_are_not_rate_limited", async () => {
    // The failure that matters most in practice is the opposite of a missing limit: a limit
    // so tight that a student with a flaky connection cannot sign in to their own account.
    // Every call inside the budget must reach the handler and fail on the token, not on 429.
    for (let i = 0; i < BUDGET; i++) {
      const res = await exchange();
      expect(res.status).not.toBe(429);
      expect(res.status).toBe(401);
    }
  });

  it("test_SEC023_the_call_after_the_budget_is_refused_with_429", async () => {
    for (let i = 0; i < BUDGET; i++) await exchange();
    const res = await exchange();
    expect(res.status).toBe(429);
  });

  it("test_SEC023_the_refusal_happens_before_any_database_read", async () => {
    // DATABASE_URL points at port 1 and nothing is listening. A 429 therefore proves the
    // limiter short-circuits ahead of findProfileById: if the handler were reached first
    // this would surface as a 5xx connection error instead. This is the ordering property
    // that a future refactor moving the middleware would break silently.
    for (let i = 0; i < BUDGET; i++) await exchange();
    const res = await exchange();
    expect(res.status).toBe(429);
    expect(res.status).not.toBeGreaterThanOrEqual(500);
  });

  it("test_SEC023_one_caller_cannot_exhaust_another_students_budget", async () => {
    // Buckets are per address. Supertest sends every request from the same caller, so this
    // asserts the property at the limiter, which is where the key is actually computed.
    for (let i = 0; i < BUDGET; i++) await exchange();
    expect((await exchange()).status).toBe(429);
    expect(limiter.check("a-different-student")).toBe(true);
  });

  it("test_SEC023_the_limiter_is_reset_by_the_shared_test_harness_helper", async () => {
    // resetRateLimiters() is what stops one integration file's sign-ins from exhausting the
    // next file's budget. A new limiter that is not in that list produces 429s in unrelated
    // suites, which reads as a broken feature rather than as an exhausted bucket — the
    // failure mode is a day lost to the wrong question.
    const { resetRateLimiters } = await import("../../server/src/shared/rate-limit.js");
    for (let i = 0; i < BUDGET; i++) await exchange();
    expect((await exchange()).status).toBe(429);

    resetRateLimiters();
    expect((await exchange()).status).toBe(401);
  });
});
