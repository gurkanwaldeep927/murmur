import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { SignedInUser } from "../helpers/auth.js";

/**
 * T21 — migration 003: the reputation ledger and the ban ledger.
 *
 * These tests go straight at the database with NO application code in the path, and that
 * is the point. `decisions/oq-schema-aggregates-and-vote-enforcement.md` decides that the
 * app layer produces the A6 error *message* while the schema is what makes the rule
 * *true* — self-voting and double-voting impossible even from a future code path that
 * forgets to check, and under two concurrent requests that both pass an app-layer read.
 *
 * A test that drove A6 would prove the app checks. It could not prove the database holds
 * the line on its own, which is the claim that decision rests on. A6 does not exist yet
 * (T22) in any case.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 * Locally this file is the one integration file worth running for T21; everything else
 * belongs to CI (docs/TASK-STATUS.md problem 11d).
 */

let app: import("express").Express;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;

let author: SignedInUser;
let voter: SignedInUser;
let questionId: string;
let answerId: string;
let secondAnswerId: string;

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  process.env.MODERATION_PROVIDER = "fixture";
  if (!process.env.DATABASE_URL) {
    throw new Error("T21 reputation-schema tests require DATABASE_URL (disposable test Postgres)");
  }
  const db = await import("../helpers/test-db.js");
  ({ truncateAll, closeDb, pool } = db);
  const { createApp } = await import("../../server/src/app.js");
  await db.migrateTestDb();
  app = createApp();
});

/**
 * Two real profiles come from the identity flow (that path is already proven by T55/T10);
 * the content rows are inserted directly, because A3/A4 would route them through the
 * moderation gateway and this file is not testing publication.
 */
async function seedContent(): Promise<void> {
  const { signIn } = await import("../helpers/auth.js");
  author = await signIn(app, "t21.author.24@nitj.ac.in");
  voter = await signIn(app, "t21.voter.25@nitj.ac.in");

  const topic = await pool.query<{ id: string }>(
    `SELECT id FROM topic_tag WHERE slug = 'advice'`,
  );
  const topicId = topic.rows[0]!.id;

  const q = await pool.query<{ id: string }>(
    `INSERT INTO question (author_profile_id, topic_tag_id, title, body, idempotency_key)
     VALUES ($1, $2, 'seed question', 'seed body', gen_random_uuid()) RETURNING id`,
    [author.profile.id, topicId],
  );
  questionId = q.rows[0]!.id;

  const a = await pool.query<{ id: string }>(
    `INSERT INTO answer (question_id, author_profile_id, body, idempotency_key)
     VALUES ($1, $2, 'seed answer', gen_random_uuid()) RETURNING id`,
    [questionId, author.profile.id],
  );
  answerId = a.rows[0]!.id;

  const a2 = await pool.query<{ id: string }>(
    `INSERT INTO answer (question_id, author_profile_id, body, idempotency_key)
     VALUES ($1, $2, 'second seed answer', gen_random_uuid()) RETURNING id`,
    [questionId, author.profile.id],
  );
  secondAnswerId = a2.rows[0]!.id;
}

function upvote(actorId: string | null, subjectId: string, targetAnswerId: string) {
  return pool.query(
    `INSERT INTO reputation_event (event_type, delta, actor_profile_id, subject_profile_id, answer_id)
     VALUES ('upvote', 1, $1, $2, $3)`,
    [actorId, subjectId, targetAnswerId],
  );
}

beforeEach(async () => {
  await truncateAll();
  await seedContent();
});

afterAll(async () => {
  await closeDb();
});

describe("reputation_event — the rules the database enforces itself", () => {
  it("refuses an upvote by the answer's own author (trg_prevent_self_vote)", async () => {
    await expect(upvote(author.profile.id, author.profile.id, answerId)).rejects.toThrow(
      /self-vote forbidden/i,
    );
  });

  it("accepts a genuine upvote from another student", async () => {
    await upvote(voter.profile.id, author.profile.id, answerId);
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM reputation_event WHERE event_type = 'upvote'`,
    );
    expect(rows[0]!.n).toBe("1");
  });

  it("refuses the same actor upvoting the same answer twice", async () => {
    await upvote(voter.profile.id, author.profile.id, answerId);
    // 23505 — uniq_reputation_event_actor_answer_upvote. This is the half an app-layer
    // read-then-write cannot cover: two concurrent requests both pass the read.
    await expect(upvote(voter.profile.id, author.profile.id, answerId)).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("lets the same actor upvote a different answer", async () => {
    await upvote(voter.profile.id, author.profile.id, answerId);
    await upvote(voter.profile.id, author.profile.id, secondAnswerId);
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM reputation_event WHERE actor_profile_id = $1`,
      [voter.profile.id],
    );
    expect(rows[0]!.n).toBe("2");
  });

  it("does not restrict accepted_answer to once per actor — the index is upvote-only", async () => {
    const acceptTwice = async () => {
      for (let i = 0; i < 2; i++) {
        await pool.query(
          `INSERT INTO reputation_event
             (event_type, delta, actor_profile_id, subject_profile_id, answer_id)
           VALUES ('accepted_answer', 15, $1, $2, $3)`,
          [voter.profile.id, author.profile.id, answerId],
        );
      }
    };
    await expect(acceptTwice()).resolves.toBeUndefined();
  });

  it("does not collide two system penalties, which carry no actor", async () => {
    const penalise = () =>
      pool.query(
        `INSERT INTO reputation_event
           (event_type, delta, actor_profile_id, subject_profile_id, question_id)
         VALUES ('violation_penalty', -20, NULL, $1, $2)`,
        [author.profile.id, questionId],
      );
    await penalise();
    await penalise();
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM reputation_event WHERE actor_profile_id IS NULL`,
    );
    expect(rows[0]!.n).toBe("2");
  });

  it("requires exactly one target — never both, never neither", async () => {
    const both = pool.query(
      `INSERT INTO reputation_event
         (event_type, delta, actor_profile_id, subject_profile_id, question_id, answer_id)
       VALUES ('upvote', 1, $1, $2, $3, $4)`,
      [voter.profile.id, author.profile.id, questionId, answerId],
    );
    await expect(both).rejects.toMatchObject({ constraint: "chk_reputation_event_one_target" });

    const neither = pool.query(
      `INSERT INTO reputation_event (event_type, delta, actor_profile_id, subject_profile_id)
       VALUES ('upvote', 1, $1, $2)`,
      [voter.profile.id, author.profile.id],
    );
    await expect(neither).rejects.toMatchObject({
      constraint: "chk_reputation_event_one_target",
    });
  });
});

describe("ban_record — durability by having no link to break", () => {
  it("has no foreign key to identity_account or pseudonymous_profile", async () => {
    // The structural assertion, not a behavioural one: a ban outliving account deletion
    // (T24, and the still-open SEC-016/PRV-2) works precisely because there is nothing
    // for a delete to cascade through. If someone later "tidies up" by adding an FK to
    // pseudonymous_profile, this fails — which is the entire reason it is written down.
    const { rows } = await pool.query<{ referenced: string }>(
      `SELECT ccu.table_name AS referenced
         FROM information_schema.table_constraints tc
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'ban_record' AND tc.constraint_type = 'FOREIGN KEY'`,
    );
    const referenced = rows.map((r) => r.referenced);
    expect(referenced).not.toContain("identity_account");
    expect(referenced).not.toContain("pseudonymous_profile");
    // The one link it IS allowed is the moderation case that produced it (schema §3.8).
    expect(referenced.every((t) => t === "moderation_case")).toBe(true);
  });

  it("refuses a second ban for the same email fingerprint", async () => {
    const ban = () =>
      pool.query(
        `INSERT INTO ban_record (email_hash, ban_reason) VALUES ('v1:deadbeef', 'test ban')`,
      );
    await ban();
    await expect(ban()).rejects.toMatchObject({ code: "23505" });
  });
});

describe("storage hardening carried by migration 003 (SEC-003)", () => {
  it("has row-level security enabled on both new tables", async () => {
    // Migration 008 already ran on the live database, so its catalogue loop will never see
    // these two tables. If 003's own hardening block is ever dropped as redundant, the
    // second layer silently disappears from exactly the tables that decide who is banned.
    const { rows } = await pool.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class
        WHERE relname IN ('ban_record', 'reputation_event') AND relkind = 'r'
        ORDER BY relname`,
    );
    expect(rows.map((r) => r.relname)).toEqual(["ban_record", "reputation_event"]);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });
});

describe("the harness itself", () => {
  it("clears ban_record between tests, which no cascade would do", async () => {
    // ban_record has no FK to the tables truncateAll cascades from, so it is only cleared
    // because it is named explicitly. A leftover ban would refuse the NEXT test's
    // registration, and the failure would point at identity, not at the harness.
    await pool.query(
      `INSERT INTO ban_record (email_hash, ban_reason) VALUES ('v1:leftover', 'leak check')`,
    );
    await truncateAll();
    const { rows } = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ban_record`);
    expect(rows[0]!.n).toBe("0");
    await seedContent(); // restore what beforeEach would have left in place
  });

  it("still serves the app it seeded against", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });
});
