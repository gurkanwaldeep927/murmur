import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { signIn, auth, type SignedInUser } from "../helpers/auth.js";

/**
 * T15 (A3 create question), T16 (A4 create answer), T17 (A5 browse feed).
 *
 * The moderation-specific NFRs live in tests/nfr/moderation-coverage.test.ts (T56);
 * this suite covers the contracts themselves — validation, idempotent replay, threading,
 * attribution, and the browse feed's empty state.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

let app: import("express").Express;
let migrateTestDb: () => Promise<void>;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;
let user: SignedInUser;

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  process.env.MODERATION_PROVIDER = "fixture";
  if (!process.env.DATABASE_URL) {
    throw new Error("content integration tests require DATABASE_URL (disposable test Postgres)");
  }
  ({ migrateTestDb, truncateAll, closeDb, pool } = await import("../helpers/test-db.js"));
  const { createApp } = await import("../../server/src/app.js");
  await migrateTestDb();
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  user = await signIn(app, "t15.author.24@nitj.ac.in");
});

afterAll(async () => {
  await closeDb();
});

let keySeq = 0;
const key = () => `10000000-0000-4000-8000-${String(++keySeq).padStart(12, "0")}`;

async function ask(
  as: SignedInUser,
  over: Partial<{ topic: string; title: string; body: string; idempotencyKey: string }> = {},
) {
  return request(app)
    .post("/questions")
    .set(...auth(as))
    .send({
      topic: "placements",
      title: "How early should I start DSA prep?",
      body: "Second year, core branch. When did seniors start?",
      idempotencyKey: key(),
      ...over,
    });
}

// ---------------------------------------------------------------------------
// A3
// ---------------------------------------------------------------------------

describe("A3 POST /questions (T15)", () => {
  it("test_R3AC1_question_publishes_under_pseudonym_and_year_badge", async () => {
    const res = await ask(user);
    expect(res.status).toBe(201);
    expect(res.body.moderationStatus).toBe("published");
    expect(res.body.pendingReview).toBe(false);

    const thread = await request(app)
      .get(`/questions/${res.body.id}`)
      .set(...auth(user));
    expect(thread.status).toBe(200);
    expect(thread.body.question.author.pseudonym).toBe(user.profile.pseudonym);
    expect(thread.body.question.author.year_badge).toBe(user.profile.year_badge);
  });

  it("test_R2AC1_response_never_carries_identity_fields", async () => {
    const res = await ask(user);
    const thread = await request(app)
      .get(`/questions/${res.body.id}`)
      .set(...auth(user));

    const serialized = JSON.stringify(thread.body);
    for (const forbidden of [
      "identity_account",
      "author_profile_id",
      "email",
      "nitj.ac.in",
      "email_hash",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("test_R3_unknown_topic_is_rejected", async () => {
    const res = await ask(user, { topic: "not-a-real-topic" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("topic_invalid");
  });

  it("test_R3_empty_title_or_body_is_rejected", async () => {
    expect((await ask(user, { title: "   " })).status).toBe(400);
    expect((await ask(user, { body: "" })).status).toBe(400);
  });

  it("test_R3_missing_idempotency_key_is_rejected", async () => {
    const res = await request(app)
      .post("/questions")
      .set(...auth(user))
      .send({ topic: "placements", title: "t", body: "b" });
    expect(res.status).toBe(400);
  });

  it("test_R3_duplicate_idempotency_key_replays_without_creating_a_second_row", async () => {
    const k = key();
    const first = await ask(user, { idempotencyKey: k });
    const second = await ask(user, { idempotencyKey: k, title: "different title entirely" });

    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.replayed).toBe(true);

    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM question`);
    expect(rows[0]!.n).toBe(1);
  });

  it("test_R3_replay_of_another_users_key_is_refused_not_disclosed", async () => {
    const k = key();
    await ask(user, { idempotencyKey: k });
    const other = await signIn(app, "t15.other.23@nitj.ac.in");
    const res = await ask(other, { idempotencyKey: k });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("idempotency_key_conflict");
    expect(JSON.stringify(res.body)).not.toContain("How early should I start DSA prep?");
  });

  it("test_R3_unauthenticated_caller_cannot_post", async () => {
    const res = await request(app)
      .post("/questions")
      .send({ topic: "placements", title: "t", body: "b", idempotencyKey: key() });
    expect(res.status).toBe(401);
  });

  it("test_R5_banned_author_is_refused_by_the_session_guard", async () => {
    await pool.query(`UPDATE pseudonymous_profile SET status = 'banned' WHERE id = $1`, [
      user.profile.id,
    ]);
    const res = await ask(user);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("account_banned");
  });

  it("test_R6_auto_blocked_question_is_not_published", async () => {
    const res = await ask(user, { body: "[[moderation:block]] abusive content" });
    expect(res.status).toBe(201);
    expect(res.body.moderationStatus).toBe("blocked");

    const feed = await request(app)
      .get("/questions")
      .set(...auth(user));
    expect(feed.body.questions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// A4
// ---------------------------------------------------------------------------

describe("A4 POST /questions/:id/answers (T16)", () => {
  async function publishedQuestion() {
    const res = await ask(user);
    expect(res.body.moderationStatus).toBe("published");
    return res.body.id as string;
  }

  it("test_R3AC2_answer_threads_under_the_question_with_attribution", async () => {
    const questionId = await publishedQuestion();
    const responder = await signIn(app, "t16.responder.21@nitj.ac.in");

    const res = await request(app)
      .post(`/questions/${questionId}/answers`)
      .set(...auth(responder))
      .send({ body: "Started in third sem, that was enough.", idempotencyKey: key() });
    expect(res.status).toBe(201);

    const thread = await request(app)
      .get(`/questions/${questionId}`)
      .set(...auth(user));
    expect(thread.body.answers).toHaveLength(1);
    expect(thread.body.answers[0].author.pseudonym).toBe(responder.profile.pseudonym);
    expect(thread.body.answers[0].author.pseudonym).not.toBe(user.profile.pseudonym);
    expect(thread.body.question.answerCount).toBe(1);
  });

  it("test_R3_answer_to_a_missing_question_is_rejected", async () => {
    const res = await request(app)
      .post("/questions/00000000-0000-4000-8000-000000000999/answers")
      .set(...auth(user))
      .send({ body: "orphan", idempotencyKey: key() });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("parent_question_not_found");
  });

  it("test_R6_answer_to_an_unpublished_question_is_rejected", async () => {
    // A held question must not be answerable — doing so would disclose that it exists.
    const held = await ask(user, { body: "[[moderation:escalate]] ambiguous" });
    expect(held.body.moderationStatus).toBe("pending");

    const other = await signIn(app, "t16.other.22@nitj.ac.in");
    const res = await request(app)
      .post(`/questions/${held.body.id}/answers`)
      .set(...auth(other))
      .send({ body: "trying to answer a held question", idempotencyKey: key() });
    expect(res.status).toBe(404);
  });

  it("test_R3_answer_duplicate_idempotency_key_replays", async () => {
    const questionId = await publishedQuestion();
    const k = key();
    const first = await request(app)
      .post(`/questions/${questionId}/answers`)
      .set(...auth(user))
      .send({ body: "first", idempotencyKey: k });
    const second = await request(app)
      .post(`/questions/${questionId}/answers`)
      .set(...auth(user))
      .send({ body: "second, different body", idempotencyKey: k });

    expect(second.body.id).toBe(first.body.id);
    expect(second.body.replayed).toBe(true);
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM answer`);
    expect(rows[0]!.n).toBe(1);
  });

  it("test_R6_blocked_answer_does_not_increment_answer_count", async () => {
    const questionId = await publishedQuestion();
    await request(app)
      .post(`/questions/${questionId}/answers`)
      .set(...auth(user))
      .send({ body: "[[moderation:block]] abuse", idempotencyKey: key() });

    const { rows } = await pool.query(`SELECT answer_count FROM question WHERE id = $1`, [
      questionId,
    ]);
    expect(rows[0]!.answer_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A5 (browse)
// ---------------------------------------------------------------------------

describe("A5 GET /questions — browse feed (T17)", () => {
  it("test_R4AC2_empty_feed_returns_an_inviting_empty_state_not_an_error", async () => {
    const res = await request(app)
      .get("/questions")
      .set(...auth(user));
    expect(res.status).toBe(200);
    expect(res.body.empty).toBe(true);
    expect(res.body.questions).toEqual([]);
    expect(res.body.emptyMessage).toEqual(expect.any(String));
  });

  it("test_R4_feed_returns_published_questions_newest_first", async () => {
    const first = await ask(user, { title: "oldest" });
    const second = await ask(user, { title: "newest" });
    expect([first.status, second.status]).toEqual([201, 201]);

    const res = await request(app)
      .get("/questions")
      .set(...auth(user));
    expect(res.body.questions.map((q: { title: string }) => q.title)).toEqual([
      "newest",
      "oldest",
    ]);
    expect(res.body.empty).toBe(false);
  });

  it("test_R4_feed_excludes_pending_and_blocked_content", async () => {
    await ask(user, { title: "visible" });
    await ask(user, { title: "held", body: "[[moderation:escalate]] x" });
    await ask(user, { title: "blocked", body: "[[moderation:block]] y" });

    const res = await request(app)
      .get("/questions")
      .set(...auth(user));
    expect(res.body.questions.map((q: { title: string }) => q.title)).toEqual(["visible"]);
  });

  it("test_R4_feed_filters_by_topic", async () => {
    await ask(user, { title: "placement q", topic: "placements" });
    await ask(user, { title: "professor q", topic: "professors" });

    const res = await request(app)
      .get("/questions?topic=professors")
      .set(...auth(user));
    expect(res.body.questions.map((q: { title: string }) => q.title)).toEqual(["professor q"]);
  });

  it("test_R4_unknown_topic_filter_is_rejected", async () => {
    const res = await request(app)
      .get("/questions?topic=nope")
      .set(...auth(user));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("topic_invalid");
  });

  it("test_R4_feed_paginates_with_a_stable_cursor", async () => {
    for (let i = 0; i < 3; i++) await ask(user, { title: `q${i}` });

    const page1 = await request(app)
      .get("/questions?limit=2")
      .set(...auth(user));
    expect(page1.body.questions).toHaveLength(2);
    expect(page1.body.nextBefore).toEqual(expect.any(String));

    const page2 = await request(app)
      .get(`/questions?limit=2&before=${encodeURIComponent(page1.body.nextBefore)}`)
      .set(...auth(user));
    expect(page2.body.questions).toHaveLength(1);
    const ids = [...page1.body.questions, ...page2.body.questions].map(
      (q: { id: string }) => q.id,
    );
    expect(new Set(ids).size).toBe(3);
  });

  it("test_R6_author_can_see_their_own_held_question_but_the_feed_cannot", async () => {
    const held = await ask(user, { title: "mine, held", body: "[[moderation:escalate]] x" });

    // The author's own view: S6 must be able to show "pending review".
    const mine = await request(app)
      .get(`/questions/${held.body.id}`)
      .set(...auth(user));
    expect(mine.status).toBe(200);
    expect(mine.body.question.moderationStatus).toBe("pending");

    // Anyone else: not found, not "held".
    const other = await signIn(app, "t17.other.20@nitj.ac.in");
    const theirs = await request(app)
      .get(`/questions/${held.body.id}`)
      .set(...auth(other));
    expect(theirs.status).toBe(404);
  });

  it("test_R3_topics_endpoint_returns_the_seeded_set", async () => {
    const res = await request(app)
      .get("/topics")
      .set(...auth(user));
    expect(res.status).toBe(200);
    expect(res.body.topics.map((t: { slug: string }) => t.slug).sort()).toEqual([
      "advice",
      "courses",
      "internships",
      "placements",
      "professors",
    ]);
  });
});
