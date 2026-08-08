import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { auth, type SignedInUser } from "../helpers/auth.js";

/**
 * T24 — issuing a ban, and proving it outlives the account that earned it.
 *
 * This is the half that never existed: `pseudonymous_profile.status = 'banned'` and
 * `identity_account.ban_status` were columns nothing in the product ever wrote, while A11
 * and requireSession had always been reading them.
 *
 * The durability claim is the point. A ban record with a foreign key to the account would
 * disappear with the account, which is problem #7 (SEC-016 / PRV-2). It has none, so there
 * is nothing for a delete to travel along — and the test below deletes the account to show
 * it, rather than reasoning about the schema.
 *
 * NOTE ON THE DELETION STEP, because it would otherwise read as a shortcut: the product has
 * no account-deletion endpoint. There is no DELETE /account and no erasure route — checked
 * against the route table, not assumed — and no task in docs/07-plan.md builds one, even
 * though T57 is specified as "delete account → re-register → refused". The gap is recorded
 * in TASK-STATUS and decisions/t24-ban-issuance-policy.md §5. So these tests remove the rows
 * directly and do not pretend otherwise — and they distinguish the two shapes an erasure could
 * take, because only one of them lets the ban be the thing that refuses:
 *
 *   soft delete (flag the row) -> A1 refuses first, on the address already existing;
 *   hard erase  (remove it)    -> A1 accepts, and the A11 ban check is what refuses.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

let app: import("express").Express;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;
let withTransaction: typeof import("../../server/src/db/pool.js").withTransaction;
let banIdentity: typeof import("../../server/src/modules/identity/ban-issuance.js").banIdentity;

const OFFENDER = "offender.student.24@nitj.ac.in";

let offender: SignedInUser;

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  process.env.MODERATION_PROVIDER = "fixture";
  if (!process.env.DATABASE_URL) {
    throw new Error("T24 ban-issuance tests require DATABASE_URL (disposable test Postgres)");
  }
  const db = await import("../helpers/test-db.js");
  ({ truncateAll, closeDb, pool } = db);
  ({ withTransaction } = await import("../../server/src/db/pool.js"));
  ({ banIdentity } = await import("../../server/src/modules/identity/ban-issuance.js"));
  const { createApp } = await import("../../server/src/app.js");
  await db.migrateTestDb();
  app = createApp();
});

function ban(profileId: string, reason = "repeated harassment", caseId: string | null = null) {
  return withTransaction((client) =>
    banIdentity(client, {
      profileId,
      reason,
      originatingModerationCaseId: caseId,
    }),
  );
}

/** What an erasure path will do. See the note at the top of this file. */
async function softDeleteAccount(profileId: string): Promise<void> {
  await pool.query(
    `UPDATE identity_account SET deleted_at = now()
      WHERE id = (SELECT identity_account_id FROM pseudonymous_profile WHERE id = $1)`,
    [profileId],
  );
  await pool.query(`UPDATE pseudonymous_profile SET deleted_at = now() WHERE id = $1`, [
    profileId,
  ]);
}

/**
 * What a DPDP erasure will do once it exists: the identity row is gone, not flagged.
 * Only then does A1 accept the address again and the A11 ban check get to speak.
 */
async function hardEraseAccount(profileId: string): Promise<void> {
  const { rows } = await pool.query<{ identity_account_id: string }>(
    `SELECT identity_account_id FROM pseudonymous_profile WHERE id = $1`,
    [profileId],
  );
  // An erasure cannot just drop the profile row: analytics_event and reputation_event both
  // hold foreign keys to it, and CI's first run of this test failed on exactly that
  // (analytics_event_actor_profile_id_fkey). That is a REAL constraint on whatever T70
  // builds — a DPDP erasure has to decide, per table, between deleting the rows and
  // nulling the reference, and nulling loses the ability to count a cohort while deleting
  // rewrites history. Recorded in TASK-STATUS; this test deletes, because it only needs the
  // account gone.
  await pool.query(`DELETE FROM analytics_event WHERE actor_profile_id = $1`, [profileId]);
  await pool.query(
    `DELETE FROM reputation_event WHERE actor_profile_id = $1 OR subject_profile_id = $1`,
    [profileId],
  );
  await pool.query(`DELETE FROM pseudonymous_profile WHERE id = $1`, [profileId]);
  await pool.query(`DELETE FROM identity_account WHERE id = $1`, [
    rows[0]!.identity_account_id,
  ]);
}

async function tryRegister(email: string) {
  await request(app).post("/verification/initiate").send({ email });
  const { memoryEmailProvider } = await import(
    "../../server/src/modules/notification/email-provider.js"
  );
  const { normalizeEmail } = await import("../../server/src/shared/email-identity.js");
  const key = normalizeEmail(email)?.normalized ?? email.toLowerCase();
  const otp = memoryEmailProvider?.lastToken(key);
  if (!otp) throw new Error(`no OTP captured for ${key}`);
  return request(app).post("/verification/confirm").send({ email, token: otp });
}

beforeEach(async () => {
  await truncateAll();
  const { signIn } = await import("../helpers/auth.js");
  offender = await signIn(app, OFFENDER);
});

afterAll(async () => {
  await closeDb();
});

describe("issuing a ban writes all three, or none", () => {
  it("records the ban and marks both the profile and the account", async () => {
    const result = await ban(offender.profile.id);
    expect(result).toEqual({ banned: true, newRecord: true });

    const { rows } = await pool.query<{ status: string; ban_status: boolean; reason: string }>(
      `SELECT p.status, ia.ban_status, br.ban_reason AS reason
         FROM pseudonymous_profile p
         JOIN identity_account ia ON ia.id = p.identity_account_id
         JOIN ban_record br ON br.email_hash = ia.email_hash
        WHERE p.id = $1`,
      [offender.profile.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "banned",
      ban_status: true,
      reason: "repeated harassment",
    });
  });

  it("takes effect on the offender's very next request", async () => {
    await ban(offender.profile.id);
    const res = await request(app)
      .get("/questions")
      .set(...auth(offender));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("account_banned");
  });

  it("rolls back everything if the transaction fails", async () => {
    // The three writes are only worth anything together. If a caller's transaction aborts
    // after banIdentity, nothing may survive -- a stray ban_record with an active profile
    // would silently refuse a future registration for someone still using the app.
    await expect(
      withTransaction(async (client) => {
        await banIdentity(client, { profileId: offender.profile.id, reason: "will roll back" });
        throw new Error("caller failed after the ban");
      }),
    ).rejects.toThrow("caller failed after the ban");

    const bans = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ban_record`);
    expect(bans.rows[0]!.n).toBe("0");
    const profile = await pool.query<{ status: string }>(
      `SELECT status FROM pseudonymous_profile WHERE id = $1`,
      [offender.profile.id],
    );
    expect(profile.rows[0]!.status).toBe("active");
  });

  it("refuses to ban something that is not a profile", async () => {
    await expect(ban("00000000-0000-4000-8000-000000000001")).rejects.toThrow(/no identity/i);
  });
});

describe("banning twice", () => {
  it("keeps the original reason and reports that the record already existed", async () => {
    await ban(offender.profile.id, "the specific, evidenced reason");
    const second = await ban(offender.profile.id, "vague later reason");

    expect(second).toEqual({ banned: true, newRecord: false });
    const { rows } = await pool.query<{ ban_reason: string; n: string }>(
      `SELECT ban_reason, count(*) OVER () AS n FROM ban_record`,
    );
    expect(rows).toHaveLength(1);
    // The record is the only evidence of WHY someone was removed; a later, vaguer reason
    // overwriting a specific one destroys it.
    expect(rows[0]!.ban_reason).toBe("the specific, evidenced reason");
  });

  it("heals a profile that drifted back to active", async () => {
    await ban(offender.profile.id);
    await pool.query(`UPDATE pseudonymous_profile SET status = 'active' WHERE id = $1`, [
      offender.profile.id,
    ]);

    await ban(offender.profile.id);
    const { rows } = await pool.query<{ status: string }>(
      `SELECT status FROM pseudonymous_profile WHERE id = $1`,
      [offender.profile.id],
    );
    expect(rows[0]!.status).toBe("banned");
  });
});

describe("the ban outlives the account — problem #7", () => {
  it("keeps the ban row itself through the deletion", async () => {
    await ban(offender.profile.id);
    await softDeleteAccount(offender.profile.id);
    const { rows } = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ban_record`);
    expect(rows[0]!.n).toBe("1");
  });

  it("refuses re-registration after a HARD erasure — the ban is what stops them", async () => {
    // This is the real problem-#7 proof, and it needs the identity row actually gone.
    // With the row merely soft-deleted (the test below), A1 refuses first and the ban check
    // never runs — so a soft-delete test would "pass" while proving nothing about the ban.
    await ban(offender.profile.id, "the reason they were removed");
    await hardEraseAccount(offender.profile.id);

    const remaining = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM identity_account`,
    );
    expect(remaining.rows[0]!.n).toBe("0");

    const res = await tryRegister(OFFENDER);
    expect(res.status).toBe(403);
    expect(res.body.outcome).toBe("refused");
  });

  it("still refuses a capitalised or plus-addressed retry after erasure", async () => {
    await ban(offender.profile.id);
    await hardEraseAccount(offender.profile.id);

    expect((await tryRegister("Offender.Student.24@NITJ.ac.in")).status).toBe(403);
    expect((await tryRegister("offender.student.24+again@nitj.ac.in")).status).toBe(403);
  });

  it("lets an unrelated student register after the erasure", async () => {
    // The negative half: a ban must not become a blanket refusal.
    await ban(offender.profile.id);
    await hardEraseAccount(offender.profile.id);
    expect((await tryRegister("innocent.student.25@nitj.ac.in")).status).toBe(200);
  });

  it("refuses a SOFT-deleted address truthfully rather than crashing", async () => {
    // Found by this suite on 2026-08-08. A soft-deleted account is invisible to A1's
    // duplicate check (which filters deleted_at IS NULL) but still holds the UNIQUE index
    // on email_hash, so the insert raised 23505 and the caller got a 500 — and the A2 ban
    // check never ran at all.
    //
    // The refusal is `email_already_registered`, NOT the ban: with the row still present,
    // the prior account is what stops them. Asserting the code, not just the status, is the
    // difference between proving that and assuming it.
    await ban(offender.profile.id);
    await softDeleteAccount(offender.profile.id);

    const res = await request(app).post("/verification/initiate").send({ email: OFFENDER });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_already_registered");
  });
});

describe("nothing bans anyone automatically", () => {
  it("has no caller in the running product", async () => {
    // decisions/t24-ban-issuance-policy.md §2: banning on a single automated content
    // verdict would let one false positive permanently remove a real student, and the
    // false-positive rate is unmeasured until T54/M6. The trigger is a human, arriving
    // with the M5 operator console.
    //
    // This asserts the current, deliberate state of the product. When T35/T41 wire the
    // operator trigger, this test is expected to be replaced by one that exercises it —
    // failing here is the reminder that the decision above needs updating too.
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");

    const roots = ["server/src/modules", "server/src/worker", "server/src/shared"];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".ts") && entry.name !== "ban-issuance.ts") {
          if (/\bbanIdentity\s*\(/.test(readFileSync(full, "utf8"))) hits.push(full);
        }
      }
    };
    roots.forEach(walk);
    expect(hits).toEqual([]);
  });
});
