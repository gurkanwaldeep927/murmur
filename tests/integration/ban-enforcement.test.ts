import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { auth, type SignedInUser } from "../helpers/auth.js";

/**
 * T23 — A11 ban enforcement, end to end.
 *
 * Two halves, and they are enforced in different places on purpose:
 *
 *  - **Re-registration** is refused by A2 calling the A11 lookup (identity module).
 *  - **Everything an account can do afterwards** — asking, answering, voting — is refused
 *    by `requireSession`, which loads the profile LIVE on every request. No route
 *    re-implements the check, which is what makes it impossible for a new route to
 *    forget it. This file proves that claim rather than restating it, and it proves it
 *    for A6 too, which did not exist when the middleware was written.
 *
 * The normalization cases are RR-7 in executable form: a ban that stops matching because
 * of a capital letter is a ban that does not exist. The dot case is here to pin a
 * DELIBERATE non-match, not an oversight — see its own test.
 *
 * A retired pepper is configured for this suite (RR-13): a ban written before a rotation
 * must still match after one, and nothing else in the suite covers that against a real row.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

const ACTIVE_PEPPER = "v2:t23-active-pepper";
const RETIRED_PEPPER = "v1:t23-retired-pepper";

let app: import("express").Express;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;
let hashNormalizedEmail: (normalized: string) => string;
let normalizeEmail: (raw: string) => { normalized: string; domain: string } | null;

beforeAll(async () => {
  // Set BEFORE config is first imported — it reads env once.
  process.env.EMAIL_HASH_PEPPER_ACTIVE = ACTIVE_PEPPER;
  process.env.EMAIL_HASH_PEPPER_RETIRED = RETIRED_PEPPER;
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  process.env.MODERATION_PROVIDER = "fixture";
  if (!process.env.DATABASE_URL) {
    throw new Error("T23 ban tests require DATABASE_URL (disposable test Postgres)");
  }
  const db = await import("../helpers/test-db.js");
  ({ truncateAll, closeDb, pool } = db);
  ({ hashNormalizedEmail, normalizeEmail } = await import(
    "../../server/src/shared/email-identity.js"
  ));
  const { createApp } = await import("../../server/src/app.js");
  await db.migrateTestDb();
  app = createApp();
});

/** Write a ban keyed by the same procedure A1/A2/A11 all use (T50). */
async function banEmail(raw: string, reason = "harassment"): Promise<void> {
  const n = normalizeEmail(raw);
  if (!n) throw new Error(`test wrote a malformed email: ${raw}`);
  await pool.query(`INSERT INTO ban_record (email_hash, ban_reason) VALUES ($1, $2)`, [
    hashNormalizedEmail(n.normalized),
    reason,
  ]);
}

/** Drive A1 + A2 and return the confirm response, whatever its outcome. */
async function tryRegister(email: string) {
  await request(app).post("/verification/initiate").send({ email });
  const { memoryEmailProvider } = await import(
    "../../server/src/modules/notification/email-provider.js"
  );
  const otp = memoryEmailProvider?.lastToken(email.toLowerCase());
  if (!otp) throw new Error(`no OTP captured for ${email} — is EMAIL_PROVIDER=memory?`);
  return request(app).post("/verification/confirm").send({ email, token: otp });
}

async function setStatus(profileId: string, status: string): Promise<void> {
  await pool.query(`UPDATE pseudonymous_profile SET status = $2 WHERE id = $1`, [
    profileId,
    status,
  ]);
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe("A11 — a banned address cannot register again", () => {
  it("refuses the exact address", async () => {
    await banEmail("banned.student.24@nitj.ac.in");
    const res = await tryRegister("banned.student.24@nitj.ac.in");
    expect(res.status).toBe(403);
    expect(res.body.outcome).toBe("refused");
    // The refusal deliberately does not say "you are banned" or why (identity.routes.ts).
    expect(JSON.stringify(res.body)).not.toMatch(/harassment/i);
  });

  it("refuses a differently-capitalised address", async () => {
    await banEmail("first.last.24@nitj.ac.in");
    const res = await tryRegister("First.Last.24@NITJ.ac.in");
    expect(res.status).toBe(403);
  });

  it("refuses a plus-addressed variant", async () => {
    await banEmail("first.last.24@nitj.ac.in");
    const res = await tryRegister("first.last.24+newaccount@nitj.ac.in");
    expect(res.status).toBe(403);
  });

  it("does NOT collapse dots on a campus domain, and that is deliberate", async () => {
    // Gmail treats f.i.r.s.t@ and first@ as one mailbox; a college's addressing scheme
    // usually does not, and collapsing dots there would refuse a real, different student
    // who happens to share a dotless spelling. So the normalizer strips dots only for
    // domains known to alias them (email-identity.ts DOT_ALIASING_DOMAINS).
    //
    // The cost is real and belongs on the record: if a campus DOES alias dots, a banned
    // person returns by removing one. Closing that means adding the domain to that set
    // after the founder confirms the scheme (T6) — not loosening the matcher globally.
    await banEmail("first.last.24@nitj.ac.in");
    const res = await tryRegister("firstlast24@nitj.ac.in");
    expect(res.status).toBe(200);
  });

  it("still matches a ban written under a retired pepper (RR-13)", async () => {
    // Write the hash the way the OLD pepper would have, bypassing the active-pepper helper.
    const [version, secret] = [RETIRED_PEPPER.slice(0, 2), RETIRED_PEPPER.slice(3)];
    const normalized = normalizeEmail("rotated.student.24@nitj.ac.in")!.normalized;
    const oldHash = `${version}$${createHmac("sha256", secret).update(normalized).digest("hex")}`;
    await pool.query(`INSERT INTO ban_record (email_hash, ban_reason) VALUES ($1, 'old ban')`, [
      oldHash,
    ]);

    const res = await tryRegister("rotated.student.24@nitj.ac.in");
    expect(res.status).toBe(403);
  });

  it("lets an unbanned student through", async () => {
    await banEmail("someone.else.24@nitj.ac.in");
    const res = await tryRegister("clean.student.24@nitj.ac.in");
    expect(res.status).toBe(200);
  });
});

describe("a ban takes effect on the very next request, everywhere", () => {
  let user: SignedInUser;
  let questionId: string;
  let answerId: string;

  beforeEach(async () => {
    const { signIn } = await import("../helpers/auth.js");
    user = await signIn(app, "active.student.24@nitj.ac.in");
    const author = await signIn(app, "other.student.23@nitj.ac.in");

    const topic = await pool.query<{ id: string }>(`SELECT id FROM topic_tag WHERE slug='advice'`);
    const q = await pool.query<{ id: string }>(
      `INSERT INTO question (author_profile_id, topic_tag_id, title, body, idempotency_key,
                             moderation_status, published_at)
       VALUES ($1, $2, 't', 'b', gen_random_uuid(), 'published', now()) RETURNING id`,
      [author.profile.id, topic.rows[0]!.id],
    );
    questionId = q.rows[0]!.id;
    const a = await pool.query<{ id: string }>(
      `INSERT INTO answer (question_id, author_profile_id, body, idempotency_key, moderation_status)
       VALUES ($1, $2, 'b', gen_random_uuid(), 'published') RETURNING id`,
      [questionId, author.profile.id],
    );
    answerId = a.rows[0]!.id;
  });

  it("refuses asking a question", async () => {
    await setStatus(user.profile.id, "banned");
    const res = await request(app)
      .post("/questions")
      .set(...auth(user))
      .send({ topic: "advice", title: "hello", body: "hello", idempotencyKey: randomUUID() });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("account_banned");
  });

  it("refuses answering", async () => {
    await setStatus(user.profile.id, "banned");
    const res = await request(app)
      .post(`/questions/${questionId}/answers`)
      .set(...auth(user))
      .send({ body: "hello", idempotencyKey: randomUUID() });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("account_banned");
  });

  it("refuses voting — the route that did not exist when the guard was written", async () => {
    await setStatus(user.profile.id, "banned");
    const res = await request(app)
      .post(`/answers/${answerId}/vote`)
      .set(...auth(user));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("account_banned");
    // And no ledger row snuck in.
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM reputation_event`,
    );
    expect(rows[0]!.n).toBe("0");
  });

  it("refuses accepting — and refuses it AS a ban, not as 'you didn't ask this'", async () => {
    // This caller is not the question's author, so accept would be refused anyway. The
    // assertion is on the CODE: requireSession runs before the handler, so the ban is the
    // reason given. If that order ever flipped, a banned account would be told it simply
    // lacks permission, and the ban would stop being the thing that stopped it.
    await setStatus(user.profile.id, "banned");
    const res = await request(app)
      .post(`/answers/${answerId}/accept`)
      .set(...auth(user));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("account_banned");
  });

  it("refuses a suspended account too, with its own distinct message", async () => {
    await setStatus(user.profile.id, "suspended");
    const res = await request(app)
      .post(`/answers/${answerId}/vote`)
      .set(...auth(user));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("account_suspended");
  });

  it("uses a session issued BEFORE the ban — the token is not the authority", async () => {
    // The session was signed while the account was in good standing and has not expired.
    // If the guard trusted the token's claims instead of re-reading the profile, this
    // would pass. The profile is loaded live on every request precisely so it cannot.
    const beforeBan = await request(app)
      .post(`/answers/${answerId}/vote`)
      .set(...auth(user));
    expect(beforeBan.status).toBe(200);

    await setStatus(user.profile.id, "banned");
    const afterBan = await request(app)
      .post(`/answers/${answerId}/vote`)
      .set(...auth(user));
    expect(afterBan.status).toBe(403);
    expect(afterBan.body.error.code).toBe("account_banned");
  });
});
