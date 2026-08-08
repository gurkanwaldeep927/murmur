import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { auth, type SignedInUser } from "../helpers/auth.js";

/**
 * T22 — A6 vote / accept.
 *
 * Two things are being proved here, and they are different claims:
 *
 *  1. the endpoint applies the A6 contract (server-authoritative delta, the four named
 *     errors, plus the two accept rules decided in decisions/a6-vote-accept-semantics.md);
 *  2. the cached score and vote count agree with the ledger afterwards — AND the query that
 *     checks that would actually notice if they did not. An "all clear" from a reconciliation
 *     nobody has watched fail is worth nothing, which is the lesson of TASK-STATUS problems
 *     8–11e in another costume.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

let app: import("express").Express;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;
let repo: typeof import("../../server/src/modules/reputation/reputation.repo.js");

let asker: SignedInUser; // asks the question
let answerer: SignedInUser; // writes the answer, so earns the reputation
let bystander: SignedInUser; // a third student who may upvote but may not accept

let questionId: string;
let answerId: string;

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  process.env.MODERATION_PROVIDER = "fixture";
  if (!process.env.DATABASE_URL) {
    throw new Error("T22 vote tests require DATABASE_URL (disposable test Postgres)");
  }
  const db = await import("../helpers/test-db.js");
  ({ truncateAll, closeDb, pool } = db);
  repo = await import("../../server/src/modules/reputation/reputation.repo.js");
  const { createApp } = await import("../../server/src/app.js");
  await db.migrateTestDb();
  app = createApp();
});

/**
 * Content is inserted directly and marked published, rather than posted through A3/A4.
 * Going through the gateway would make every assertion here depend on the fixture adapter's
 * verdict, so a moderation change would break vote tests for reasons that have nothing to do
 * with voting.
 */
async function seed(status = "published"): Promise<void> {
  const { signIn } = await import("../helpers/auth.js");
  asker = await signIn(app, "t22.asker.24@nitj.ac.in");
  answerer = await signIn(app, "t22.answerer.23@nitj.ac.in");
  bystander = await signIn(app, "t22.bystander.25@nitj.ac.in");

  const topic = await pool.query<{ id: string }>(`SELECT id FROM topic_tag WHERE slug='advice'`);
  const q = await pool.query<{ id: string }>(
    `INSERT INTO question (author_profile_id, topic_tag_id, title, body, idempotency_key,
                           moderation_status, published_at)
     VALUES ($1, $2, 'how do placements work', 'asking for a friend', gen_random_uuid(),
             'published', now()) RETURNING id`,
    [asker.profile.id, topic.rows[0]!.id],
  );
  questionId = q.rows[0]!.id;

  const a = await pool.query<{ id: string }>(
    `INSERT INTO answer (question_id, author_profile_id, body, idempotency_key, moderation_status)
     VALUES ($1, $2, 'here is what actually happens', gen_random_uuid(), $3) RETURNING id`,
    [questionId, answerer.profile.id, status],
  );
  answerId = a.rows[0]!.id;
}

async function scoreOf(profileId: string): Promise<number> {
  const { rows } = await pool.query<{ reputation_score: number }>(
    `SELECT reputation_score FROM pseudonymous_profile WHERE id = $1`,
    [profileId],
  );
  return rows[0]!.reputation_score;
}

async function assertNoDrift(): Promise<void> {
  expect(await repo.findScoreDrift(pool)).toEqual([]);
  expect(await repo.findVoteCountDrift(pool)).toEqual([]);
}

beforeEach(async () => {
  await truncateAll();
  await seed();
});

afterAll(async () => {
  await closeDb();
});

describe("A6 — upvote", () => {
  it("credits the answer's author, not the voter", async () => {
    const res = await request(app).post(`/answers/${answerId}/vote`).set(...auth(bystander));

    expect(res.status).toBe(200);
    expect(res.body.voteCount).toBe(1);
    expect(res.body.authorReputationScore).toBe(1);
    expect(await scoreOf(answerer.profile.id)).toBe(1);
    expect(await scoreOf(bystander.profile.id)).toBe(0);
    await assertNoDrift();
  });

  it("never lets the client choose the delta", async () => {
    // The body is ignored entirely: A6's inputs are the actor and the target, and the
    // points are the server's to decide (R5 — "so nobody can cheat").
    const res = await request(app)
      .post(`/answers/${answerId}/vote`)
      .set(...auth(bystander))
      .send({ delta: 9999, voteCount: 9999 });

    expect(res.status).toBe(200);
    expect(res.body.authorReputationScore).toBe(1);
  });

  it("refuses an author upvoting their own answer", async () => {
    const res = await request(app).post(`/answers/${answerId}/vote`).set(...auth(answerer));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("self_vote_forbidden");
    expect(await scoreOf(answerer.profile.id)).toBe(0);
  });

  it("refuses the same student upvoting twice, and does not double-count", async () => {
    await request(app).post(`/answers/${answerId}/vote`).set(...auth(bystander));
    const second = await request(app).post(`/answers/${answerId}/vote`).set(...auth(bystander));

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("duplicate_vote_forbidden");
    expect(await scoreOf(answerer.profile.id)).toBe(1);
    await assertNoDrift();
  });

  it("adds up across different voters", async () => {
    await request(app).post(`/answers/${answerId}/vote`).set(...auth(bystander));
    await request(app).post(`/answers/${answerId}/vote`).set(...auth(asker));
    expect(await scoreOf(answerer.profile.id)).toBe(2);
    await assertNoDrift();
  });

  it("returns not-found for an answer that does not exist", async () => {
    const res = await request(app)
      .post("/answers/00000000-0000-4000-8000-000000000001/vote")
      .set(...auth(bystander));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("answer_not_found");
  });

  it("requires a session", async () => {
    const res = await request(app).post(`/answers/${answerId}/vote`);
    expect(res.status).toBe(401);
  });
});

describe("A6 — accept", () => {
  it("lets the person who asked mark an answer accepted, worth more than an upvote", async () => {
    const res = await request(app).post(`/answers/${answerId}/accept`).set(...auth(asker));

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
    expect(res.body.authorReputationScore).toBe(15);
    await assertNoDrift();
  });

  it("refuses anyone who did not ask the question", async () => {
    const res = await request(app).post(`/answers/${answerId}/accept`).set(...auth(bystander));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("accept_not_question_author");
    expect(await scoreOf(answerer.profile.id)).toBe(0);
  });

  it("refuses accepting your own answer to your own question", async () => {
    // The gap migration 009 closed: the frozen trigger guarded 'upvote' only, so this was
    // +15 reputation manufactured from nothing.
    const own = await pool.query<{ id: string }>(
      `INSERT INTO answer (question_id, author_profile_id, body, idempotency_key, moderation_status)
       VALUES ($1, $2, 'answering myself', gen_random_uuid(), 'published') RETURNING id`,
      [questionId, asker.profile.id],
    );
    const res = await request(app)
      .post(`/answers/${own.rows[0]!.id}/accept`)
      .set(...auth(asker));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("self_vote_forbidden");
    expect(await scoreOf(asker.profile.id)).toBe(0);
  });

  it("allows only one accepted answer per question", async () => {
    const other = await pool.query<{ id: string }>(
      `INSERT INTO answer (question_id, author_profile_id, body, idempotency_key, moderation_status)
       VALUES ($1, $2, 'a second answer', gen_random_uuid(), 'published') RETURNING id`,
      [questionId, bystander.profile.id],
    );
    const first = await request(app).post(`/answers/${answerId}/accept`).set(...auth(asker));
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/answers/${other.rows[0]!.id}/accept`)
      .set(...auth(asker));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("answer_already_accepted");
    expect(await scoreOf(bystander.profile.id)).toBe(0);
    await assertNoDrift();
  });

  it("stacks with upvotes on the same answer", async () => {
    await request(app).post(`/answers/${answerId}/vote`).set(...auth(bystander));
    await request(app).post(`/answers/${answerId}/accept`).set(...auth(asker));
    expect(await scoreOf(answerer.profile.id)).toBe(16);
    await assertNoDrift();
  });
});

describe("unpublished content earns nothing", () => {
  it("refuses a vote on an answer still held for review", async () => {
    await truncateAll();
    await seed("pending");
    const res = await request(app).post(`/answers/${answerId}/vote`).set(...auth(bystander));
    // Deliberately not-found rather than a distinct code: a held answer is invisible, and a
    // different error would confirm to an ID-guesser that the row exists.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("answer_not_found");
    expect(await scoreOf(answerer.profile.id)).toBe(0);
  });

  it("refuses an accept on a blocked answer", async () => {
    await truncateAll();
    await seed("blocked");
    const res = await request(app).post(`/answers/${answerId}/accept`).set(...auth(asker));
    expect(res.status).toBe(404);
  });
});

describe("the reconciliation query the T21 decision required", () => {
  it("reports nothing after ordinary voting", async () => {
    await request(app).post(`/answers/${answerId}/vote`).set(...auth(bystander));
    await request(app).post(`/answers/${answerId}/accept`).set(...auth(asker));
    await assertNoDrift();
  });

  it("catches a cached score that disagrees with the ledger", async () => {
    // Corrupting the cache on purpose is the only way this test means anything. Without it,
    // an "empty result" would be indistinguishable from a query that can never report.
    await request(app).post(`/answers/${answerId}/vote`).set(...auth(bystander));
    await pool.query(`UPDATE pseudonymous_profile SET reputation_score = 500 WHERE id = $1`, [
      answerer.profile.id,
    ]);

    const drift = await repo.findScoreDrift(pool);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ profile_id: answerer.profile.id, cached: 500, ledger: 1 });
  });

  it("catches a cached vote count that disagrees with the ledger", async () => {
    await request(app).post(`/answers/${answerId}/vote`).set(...auth(bystander));
    await pool.query(`UPDATE answer SET vote_count = 42 WHERE id = $1`, [answerId]);

    const drift = await repo.findVoteCountDrift(pool);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ answer_id: answerId, cached: 42, ledger: 1 });
  });

  it("catches a score that drifted upward from zero with no ledger at all", async () => {
    // The LEFT JOIN case: a profile with no events whose cache is non-zero. An INNER JOIN
    // would skip exactly the row most likely to be wrong.
    await pool.query(`UPDATE pseudonymous_profile SET reputation_score = 7 WHERE id = $1`, [
      bystander.profile.id,
    ]);
    const drift = await repo.findScoreDrift(pool);
    expect(drift).toEqual([{ profile_id: bystander.profile.id, cached: 7, ledger: 0 }]);
  });
});
