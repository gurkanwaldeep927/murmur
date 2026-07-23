import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

/**
 * T55 — Identity non-disclosure NFR (TRD §7; R1/R2). "Anonymity is the product."
 *
 * Response-schema audit across A1 (POST /verification/initiate) and A2
 * (POST /verification/confirm): NO raw email, email_hash, email_encrypted,
 * verification token, or the internal identity_account_id link may appear anywhere in
 * any response body — success, blocked, or refused branch.
 *
 * Criterion-ID naming per QK-6. Requires a reachable test Postgres (DATABASE_URL).
 */

// Real campus format: the T6 ruleset derives the year from a trailing 2-digit
// admission segment (`.24` -> 2024). Updated when T6 replaced the placeholder rule.
const TEST_EMAIL = "student.cs.24@nitj.ac.in";

// Fields/values that must NEVER surface in a response.
const FORBIDDEN_KEYS = [
  "email",
  "email_hash",
  "emailHash",
  "email_encrypted",
  "emailEncrypted",
  "identity_account_id",
  "identityAccountId",
  "verification_token_hash",
  "token_hash",
];

function assertNoIdentityLeak(body: unknown, rawEmail: string): void {
  const json = JSON.stringify(body);
  // No raw email substring anywhere.
  expect(json.toLowerCase()).not.toContain(rawEmail.toLowerCase());
  expect(json.toLowerCase()).not.toContain("@nitj.ac.in");
  // No forbidden identity keys anywhere in the object graph.
  const walk = (v: unknown): void => {
    if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        expect(FORBIDDEN_KEYS).not.toContain(k);
        walk(val);
      }
    }
  };
  walk(body);
}

let app: import("express").Express;
let migrateTestDb: () => Promise<void>;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "identity-nondisclosure NFR requires DATABASE_URL pointing at a disposable test Postgres — this NFR must not silently skip (plan §5).",
    );
  }
  ({ migrateTestDb, truncateAll, closeDb, pool } = await import("../helpers/test-db.js"));
  const { createApp } = await import("../../server/src/app.js");
  await migrateTestDb();
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

/** Read the OTP the in-memory test provider captured for an address. */
async function capturedOtp(email: string): Promise<string> {
  const { memoryEmailProvider } = await import(
    "../../server/src/modules/notification/email-provider.js"
  );
  const otp = memoryEmailProvider?.lastToken(email.toLowerCase());
  if (!otp) throw new Error("no OTP captured — is EMAIL_PROVIDER=memory?");
  return otp;
}

describe("R1 identity non-disclosure", () => {
  it("test_R1_identity_nondisclosure_A1_initiate", async () => {
    const res = await request(app).post("/verification/initiate").send({ email: TEST_EMAIL });
    expect(res.status).toBe(202);
    assertNoIdentityLeak(res.body, TEST_EMAIL);
  });

  it("test_R1_identity_nondisclosure_A1_domain_refused", async () => {
    const res = await request(app)
      .post("/verification/initiate")
      .send({ email: "someone@gmail.com" });
    expect(res.status).toBe(403);
    assertNoIdentityLeak(res.body, "someone@gmail.com");
  });

  it("test_R1_identity_nondisclosure_A2_verified_success", async () => {
    await request(app).post("/verification/initiate").send({ email: TEST_EMAIL });
    const otp = await capturedOtp(TEST_EMAIL);
    const res = await request(app)
      .post("/verification/confirm")
      .send({ email: TEST_EMAIL, token: otp });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("verified");
    // Year 2024 derived from the trailing ".24" admission segment, never guessed.
    expect(res.body.profile.year_badge).toBe("2024");
    // The success payload is where a leak is most tempting — audit it hardest.
    assertNoIdentityLeak(res.body, TEST_EMAIL);
  });

  it("test_R1AC2_unparseable_year_blocked_never_guessed", async () => {
    // A local part with no trailing 2-digit admission year → blocked, never guessed.
    const badEmail = "principal@nitj.ac.in";
    await request(app).post("/verification/initiate").send({ email: badEmail });
    const otp = await capturedOtp(badEmail);
    const res = await request(app)
      .post("/verification/confirm")
      .send({ email: badEmail, token: otp });
    expect(res.status).toBe(422);
    expect(res.body.outcome).toBe("blocked_unparseable_year");
    // No year field present at all — a blocked account has no derived year to leak or guess.
    expect(JSON.stringify(res.body)).not.toMatch(/year_badge|derived_enrollment_year/);
    assertNoIdentityLeak(res.body, badEmail);
    // And no profile was created for a blocked account.
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM pseudonymous_profile");
    expect(rows[0]!.n).toBe(0);
  });

  it("test_R1_identity_nondisclosure_A2_invalid_token", async () => {
    await request(app).post("/verification/initiate").send({ email: TEST_EMAIL });
    const res = await request(app)
      .post("/verification/confirm")
      .send({ email: TEST_EMAIL, token: "999999" });
    expect([400, 422]).toContain(res.status);
    assertNoIdentityLeak(res.body, TEST_EMAIL);
  });
});
