import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

/**
 * T12 — session mechanism, end-to-end (`decisions/oq-14-session-mechanism.md`).
 *
 * The unit suite (tests/unit/session-token.test.ts) pins the token primitive. This
 * suite pins the half that only a database can prove: that the bootstrap token is
 * exchangeable exactly once for a real session, and that revocation works without a
 * session table because `pseudonymous_profile.status` is read live on every request
 * (decision §4).
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

// Must satisfy the T6 campus rule (local part ends in the 2-digit admission year),
// otherwise A2 returns blocked_unparseable_year and there is no session to test.
const TEST_EMAIL = "t12.session.24@nitj.ac.in";

let app: import("express").Express;
let migrateTestDb: () => Promise<void>;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  if (!process.env.DATABASE_URL) {
    throw new Error("session integration tests require DATABASE_URL (disposable test Postgres)");
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

/** Drive A1 + A2 to a verified profile, returning A2's bootstrap token. */
async function registerVerifiedUser(email = TEST_EMAIL) {
  await request(app).post("/verification/initiate").send({ email });
  const { memoryEmailProvider } = await import(
    "../../server/src/modules/notification/email-provider.js"
  );
  const otp = memoryEmailProvider?.lastToken(email.toLowerCase());
  if (!otp) throw new Error("no OTP captured — is EMAIL_PROVIDER=memory?");
  const res = await request(app).post("/verification/confirm").send({ email, token: otp });
  expect(res.status).toBe(200);
  return { bootstrapToken: res.body.sessionToken as string, profile: res.body.profile };
}

describe("bootstrap exchange (decision §2)", () => {
  it("test_OQ14_exchange_issues_session_and_returns_profile", async () => {
    const { bootstrapToken, profile } = await registerVerifiedUser();
    const res = await request(app)
      .post("/session/exchange")
      .set("authorization", `Bearer ${bootstrapToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sessionToken).toEqual(expect.any(String));
    expect(res.body.sessionToken).not.toBe(bootstrapToken);
    expect(res.body.profile.id).toBe(profile.id);
  });

  it("test_OQ14_bootstrap_token_is_not_a_session_credential", async () => {
    const { bootstrapToken } = await registerVerifiedUser();
    const res = await request(app).get("/session").set("authorization", `Bearer ${bootstrapToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("session_invalid_or_expired");
  });

  it("test_OQ14_session_token_cannot_be_replayed_at_the_exchange", async () => {
    const { bootstrapToken } = await registerVerifiedUser();
    const { body } = await request(app)
      .post("/session/exchange")
      .set("authorization", `Bearer ${bootstrapToken}`);
    const res = await request(app)
      .post("/session/exchange")
      .set("authorization", `Bearer ${body.sessionToken}`);
    expect(res.status).toBe(401);
  });
});

describe("authenticated shell", () => {
  it("test_OQ14_session_survives_and_identifies_the_caller", async () => {
    const { bootstrapToken, profile } = await registerVerifiedUser();
    const { body } = await request(app)
      .post("/session/exchange")
      .set("authorization", `Bearer ${bootstrapToken}`);
    const res = await request(app)
      .get("/session")
      .set("authorization", `Bearer ${body.sessionToken}`);
    expect(res.status).toBe(200);
    expect(res.body.profile.pseudonym).toBe(profile.pseudonym);
  });

  it("test_OQ14_missing_and_malformed_credentials_are_refused", async () => {
    const noHeader = await request(app).get("/session");
    expect(noHeader.status).toBe(401);
    expect(noHeader.body.error.code).toBe("session_required");

    const garbage = await request(app).get("/session").set("authorization", "Bearer nonsense");
    expect(garbage.status).toBe(401);
    expect(garbage.body.error.code).toBe("session_invalid_or_expired");
  });

  it("test_OQ14_no_identity_material_in_session_responses", async () => {
    const { bootstrapToken } = await registerVerifiedUser();
    const exchange = await request(app)
      .post("/session/exchange")
      .set("authorization", `Bearer ${bootstrapToken}`);
    const whoami = await request(app)
      .get("/session")
      .set("authorization", `Bearer ${exchange.body.sessionToken}`);
    for (const body of [exchange.body, whoami.body]) {
      const json = JSON.stringify(body).toLowerCase();
      expect(json).not.toContain("@nitj.ac.in");
      expect(json).not.toContain("identity_account");
      expect(json).not.toContain("email");
    }
  });
});

describe("revocation without a session table (decision §4)", () => {
  it("test_OQ14_ban_takes_effect_on_the_next_request", async () => {
    const { bootstrapToken, profile } = await registerVerifiedUser();
    const { body } = await request(app)
      .post("/session/exchange")
      .set("authorization", `Bearer ${bootstrapToken}`);
    const token = body.sessionToken;

    expect((await request(app).get("/session").set("authorization", `Bearer ${token}`)).status).toBe(
      200,
    );

    await pool.query("UPDATE pseudonymous_profile SET status = 'banned' WHERE id = $1", [
      profile.id,
    ]);

    const after = await request(app).get("/session").set("authorization", `Bearer ${token}`);
    expect(after.status).toBe(403);
    expect(after.body.error.code).toBe("account_banned");
  });

  it("test_OQ14_suspension_is_a_distinct_terminal_state", async () => {
    const { bootstrapToken, profile } = await registerVerifiedUser();
    const { body } = await request(app)
      .post("/session/exchange")
      .set("authorization", `Bearer ${bootstrapToken}`);
    await pool.query("UPDATE pseudonymous_profile SET status = 'suspended' WHERE id = $1", [
      profile.id,
    ]);
    const res = await request(app)
      .get("/session")
      .set("authorization", `Bearer ${body.sessionToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("account_suspended");
  });

  it("test_OQ14_soft_deleted_profile_reads_as_an_expired_session", async () => {
    const { bootstrapToken, profile } = await registerVerifiedUser();
    const { body } = await request(app)
      .post("/session/exchange")
      .set("authorization", `Bearer ${bootstrapToken}`);
    await pool.query("UPDATE pseudonymous_profile SET deleted_at = now() WHERE id = $1", [
      profile.id,
    ]);
    const res = await request(app)
      .get("/session")
      .set("authorization", `Bearer ${body.sessionToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("session_invalid_or_expired");
  });

  it("test_OQ14_ban_between_A2_and_exchange_never_yields_a_session", async () => {
    const { bootstrapToken, profile } = await registerVerifiedUser();
    await pool.query("UPDATE pseudonymous_profile SET status = 'banned' WHERE id = $1", [
      profile.id,
    ]);
    const res = await request(app)
      .post("/session/exchange")
      .set("authorization", `Bearer ${bootstrapToken}`);
    expect(res.status).toBe(403);
    expect(res.body.sessionToken).toBeUndefined();
  });
});

describe("sliding refresh (decision §3)", () => {
  it("test_OQ14_fresh_token_is_not_refreshed", async () => {
    const { bootstrapToken } = await registerVerifiedUser();
    const { body } = await request(app)
      .post("/session/exchange")
      .set("authorization", `Bearer ${bootstrapToken}`);
    const res = await request(app)
      .get("/session")
      .set("authorization", `Bearer ${body.sessionToken}`);
    expect(res.headers["x-session-refresh"]).toBeUndefined();
  });

  it("test_OQ14_aged_token_is_renewed_via_header_and_the_new_one_works", async () => {
    const { profile } = await registerVerifiedUser();
    // `issueSessionToken` always stamps iat=now, so a token old enough to trigger the
    // sliding window has to be minted here. This mirrors shared/session.ts's format on
    // purpose: if that format changes, this test must be updated deliberately.
    const { createHmac } = await import("node:crypto");
    const secret = process.env.SESSION_SIGNING_KEY!.split(":").slice(1).join(":");
    const now = Date.now();
    const payload = {
      sub: profile.id,
      typ: "session",
      iat: now - 20 * 86_400_000, // 20 days old: past the 7-day threshold...
      exp: now + 10 * 86_400_000, // ...but still inside the 30-day TTL
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const aged = `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;

    const res = await request(app).get("/session").set("authorization", `Bearer ${aged}`);
    expect(res.status).toBe(200);

    const refreshed = res.headers["x-session-refresh"];
    expect(refreshed).toEqual(expect.any(String));
    expect(refreshed).not.toBe(aged);

    // The replacement must itself authenticate, and must be fresh enough that it does
    // not immediately ask to be refreshed again.
    const reuse = await request(app).get("/session").set("authorization", `Bearer ${refreshed}`);
    expect(reuse.status).toBe(200);
    expect(reuse.headers["x-session-refresh"]).toBeUndefined();
  });
});
