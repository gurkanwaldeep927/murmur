import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

/**
 * SECREG-SEC-004 — the OTP guess budget (security-gate-M1, HIGH).
 *
 * The finding: A2 counted nothing. `verification_attempt_count` exists but counts SENDS
 * (A1's resend cooldown increments it), so a 6-digit code accepted unlimited guesses —
 * exhaustible in minutes. That defeats email verification, which is the gate every other
 * control in the product assumes held.
 *
 * This suite is DB-backed because the counter is a column and the fix turns on
 * transaction behaviour: the increment has to survive the rollback that A2's
 * invalid-token throw causes. A mocked test would have passed against the broken version.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

const TEST_EMAIL = "sec004.brute.24@nitj.ac.in";
const WRONG_OTP = "000000";

let app: import("express").Express;
let migrateTestDb: () => Promise<void>;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;
let maxAttempts: number;

/** The OTP the memory provider captured for the address. */
async function currentOtp(email: string): Promise<string> {
  const { memoryEmailProvider } = await import(
    "../../server/src/modules/notification/email-provider.js"
  );
  const otp = memoryEmailProvider?.lastToken(email.toLowerCase());
  if (!otp) throw new Error("no OTP captured — is EMAIL_PROVIDER=memory?");
  return otp;
}

async function confirmAttemptCount(email: string): Promise<number> {
  const { rows } = await pool.query<{ verification_confirm_attempt_count: number }>(
    `SELECT ia.verification_confirm_attempt_count
       FROM identity_account ia
      ORDER BY ia.created_at DESC
      LIMIT 1`,
  );
  return rows[0]?.verification_confirm_attempt_count ?? -1;
}

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  // The per-caller limiter is a separate control (SEC-007) with its own suite; keep its
  // ceiling out of the way so this one measures the per-token budget.
  process.env.RATE_LIMIT_INITIATE_PER_HOUR ??= "10000";
  process.env.RATE_LIMIT_CONFIRM_PER_HOUR ??= "10000";
  if (!process.env.DATABASE_URL) {
    throw new Error("SEC-004 integration tests require DATABASE_URL (disposable test Postgres)");
  }
  ({ migrateTestDb, truncateAll, closeDb, pool } = await import("../helpers/test-db.js"));
  const { createApp } = await import("../../server/src/app.js");
  await migrateTestDb();
  app = createApp();
  maxAttempts = (await import("../../server/src/config/index.js")).config
    .verificationMaxConfirmAttempts;
});

beforeEach(async () => {
  await truncateAll();
  const { eventsLimiter, initiateLimiter, confirmLimiter } = await import(
    "../../server/src/shared/rate-limit.js"
  );
  for (const l of [eventsLimiter, initiateLimiter, confirmLimiter]) l.reset();
});

afterAll(async () => {
  await closeDb();
});

describe("SECREG-SEC-004: OTP guessing is bounded", () => {
  it("test_SEC004_a_failed_guess_is_actually_recorded", async () => {
    // The subtle half of the fix. A2's invalid-token throw rolls its transaction back, so
    // an increment written inside that transaction would be discarded and the cap would
    // never engage — the same shape as RES-3's frozen counter. This asserts the counter
    // MOVED, not merely that the request was refused.
    await request(app).post("/verification/initiate").send({ email: TEST_EMAIL });
    expect(await confirmAttemptCount(TEST_EMAIL)).toBe(0);

    const res = await request(app)
      .post("/verification/confirm")
      .send({ email: TEST_EMAIL, token: WRONG_OTP });

    expect(res.status).toBe(400);
    expect(await confirmAttemptCount(TEST_EMAIL)).toBe(1);
  });

  it("test_SEC004_the_token_stops_working_after_the_budget_is_spent", async () => {
    await request(app).post("/verification/initiate").send({ email: TEST_EMAIL });
    const realOtp = await currentOtp(TEST_EMAIL);

    for (let i = 0; i < maxAttempts; i++) {
      const res = await request(app)
        .post("/verification/confirm")
        .send({ email: TEST_EMAIL, token: WRONG_OTP });
      expect(res.status).toBe(400);
    }

    // The attacker has spent the budget. The CORRECT code must now fail too — otherwise
    // the cap only slows guessing rather than ending it.
    const withReal = await request(app)
      .post("/verification/confirm")
      .send({ email: TEST_EMAIL, token: realOtp });
    expect(withReal.status).toBe(400);
    expect(withReal.body.error.code).toBe("token_invalid_or_expired");
  });

  it("test_SEC004_lockout_is_indistinguishable_from_a_wrong_code", async () => {
    // A distinct "too many attempts" reply would confirm the address is registered (the
    // SEC-008 oracle) and tell an attacker exactly when to request a fresh code.
    await request(app).post("/verification/initiate").send({ email: TEST_EMAIL });

    const first = await request(app)
      .post("/verification/confirm")
      .send({ email: TEST_EMAIL, token: WRONG_OTP });

    for (let i = 0; i < maxAttempts + 2; i++) {
      await request(app).post("/verification/confirm").send({ email: TEST_EMAIL, token: WRONG_OTP });
    }
    const afterLockout = await request(app)
      .post("/verification/confirm")
      .send({ email: TEST_EMAIL, token: WRONG_OTP });

    expect(afterLockout.status).toBe(first.status);
    expect(afterLockout.body).toEqual(first.body);
  });

  it("test_SEC004_an_unknown_address_answers_the_same_way", async () => {
    // Same uniformity requirement, from the other direction.
    const unknown = await request(app)
      .post("/verification/confirm")
      .send({ email: "sec004.nobody.24@nitj.ac.in", token: WRONG_OTP });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe("token_invalid_or_expired");
  });

  it("test_SEC004_requesting_a_new_code_restores_the_budget", async () => {
    // Guesses are scoped to the token they were made against. Carrying them over would
    // lock a legitimate student out of a code they had only just received — closing the
    // finding by breaking registration.
    await request(app).post("/verification/initiate").send({ email: TEST_EMAIL });
    for (let i = 0; i < maxAttempts; i++) {
      await request(app).post("/verification/confirm").send({ email: TEST_EMAIL, token: WRONG_OTP });
    }
    expect(await confirmAttemptCount(TEST_EMAIL)).toBeGreaterThanOrEqual(maxAttempts);

    // Resend: A1's own cooldown applies, so drive the reissue directly past it.
    await pool.query(
      `UPDATE identity_account SET last_verification_sent_at = now() - interval '1 day'`,
    );
    await request(app).post("/verification/initiate").send({ email: TEST_EMAIL });
    expect(await confirmAttemptCount(TEST_EMAIL)).toBe(0);

    const fresh = await currentOtp(TEST_EMAIL);
    const res = await request(app)
      .post("/verification/confirm")
      .send({ email: TEST_EMAIL, token: fresh });
    expect(res.status).toBe(200);
  });

  it("test_SEC004_a_correct_code_within_budget_still_verifies", async () => {
    // The control: the cap must not have broken the happy path.
    await request(app).post("/verification/initiate").send({ email: TEST_EMAIL });
    await request(app).post("/verification/confirm").send({ email: TEST_EMAIL, token: WRONG_OTP });

    const res = await request(app)
      .post("/verification/confirm")
      .send({ email: TEST_EMAIL, token: await currentOtp(TEST_EMAIL) });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("verified");
  });
});
