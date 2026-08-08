import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth, type SignedInUser } from "../helpers/auth.js";

/**
 * T29 — A10 `POST /sync/batch`.
 *
 * The two properties everything else serves:
 *
 *  1. **nothing is silently lost.** A failure is terminal or transient, and treating a
 *     transient one as terminal destroys a post that was never going to be refused;
 *  2. **sync does not bypass moderation.** Not because a check says so, but because sync has
 *     no publish path — it calls A3/A4 like the online path does.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

let app: import("express").Express;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;

let student: SignedInUser;
let other: SignedInUser;
let liveQuestionId: string;
let liveAnswerId: string;

let seq = 0;
/** A distinct uuid per call, so a test never accidentally reuses a local id. */
function id(prefix: string): string {
  seq += 1;
  return `${prefix}${String(seq).padStart(4, "0")}-0000-4000-8000-000000000001`.slice(0, 36);
}
const localId = () => id("1111");
const key = () => id("2222");

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  process.env.MODERATION_PROVIDER = "fixture";
  if (!process.env.DATABASE_URL) {
    throw new Error("T29 sync-batch tests require DATABASE_URL (disposable test Postgres)");
  }
  const db = await import("../helpers/test-db.js");
  ({ truncateAll, closeDb, pool } = db);
  const { createApp } = await import("../../server/src/app.js");
  await db.migrateTestDb();
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  seq = 0;
  const { signIn } = await import("../helpers/auth.js");
  student = await signIn(app, "t29.student.24@nitj.ac.in");
  other = await signIn(app, "t29.other.23@nitj.ac.in");

  const topic = await pool.query<{ id: string }>(`SELECT id FROM topic_tag WHERE slug='advice'`);
  const q = await pool.query<{ id: string }>(
    `INSERT INTO question (author_profile_id, topic_tag_id, title, body, idempotency_key,
                           moderation_status, published_at)
     VALUES ($1, $2, 'live q', 'live body', gen_random_uuid(), 'published', now()) RETURNING id`,
    [other.profile.id, topic.rows[0]!.id],
  );
  liveQuestionId = q.rows[0]!.id;
  const a = await pool.query<{ id: string }>(
    `INSERT INTO answer (question_id, author_profile_id, body, idempotency_key, moderation_status)
     VALUES ($1, $2, 'live answer', gen_random_uuid(), 'published') RETURNING id`,
    [liveQuestionId, other.profile.id],
  );
  liveAnswerId = a.rows[0]!.id;
});

afterAll(async () => {
  await closeDb();
});

const T0 = Date.parse("2026-08-09T09:00:00.000Z");
/** Minutes after a fixed base, so "the phone wrote this first" is explicit in each test. */
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

function batch(user: SignedInUser, items: unknown[]) {
  return request(app)
    .post("/sync/batch")
    .set(...auth(user))
    .send({ items });
}

function question(overrides: Record<string, unknown> = {}) {
  return {
    clientLocalId: localId(),
    idempotencyKey: key(),
    entityType: "question",
    clientCreatedAt: at(0),
    payload: { topic: "advice", title: "offline title", body: "offline body" },
    ...overrides,
  };
}

async function queueRow(clientLocalId: string) {
  const { rows } = await pool.query<{
    sync_status: string;
    server_assigned_id: string | null;
    error_reason: string | null;
    retry_count: number;
  }>(
    `SELECT sync_status, server_assigned_id, error_reason, retry_count
       FROM sync_queue_item WHERE client_local_id = $1`,
    [clientLocalId],
  );
  return rows[0];
}

describe("a batch of writes made offline", () => {
  it("gives every item its own outcome and records each in the outbox", async () => {
    const q = question();
    const v = {
      clientLocalId: localId(),
      idempotencyKey: key(),
      entityType: "vote",
      clientCreatedAt: at(1),
      payload: { answerId: liveAnswerId, kind: "upvote" },
    };
    const res = await batch(student, [q, v]);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results.every((r: { status: string }) => r.status === "synced")).toBe(true);
    expect(await queueRow(q.clientLocalId)).toMatchObject({ sync_status: "synced" });
    expect(await queueRow(v.clientLocalId)).toMatchObject({ sync_status: "synced" });
  });

  it("answers in the order the client sent, not the order it processed", async () => {
    // The phone matches results to its own queue positions. Silently returning them in
    // processing order (oldest-first) invites an off-by-one there.
    const later = question({ clientCreatedAt: at(10) });
    const earlier = question({ clientCreatedAt: at(1) });
    const res = await batch(student, [later, earlier]);
    expect(res.body.results.map((r: { clientLocalId: string }) => r.clientLocalId)).toEqual([
      later.clientLocalId,
      earlier.clientLocalId,
    ]);
  });

  it("does not let one bad item cost the student the good ones", async () => {
    // "Partial-batch failure is expected, not exceptional" (TRD apis[A10]). If this rolled
    // back, one typo'd topic would throw away everything else the phone had been holding.
    const good = question();
    const bad = question({ payload: { topic: "no-such-topic", title: "t", body: "b" } });
    const res = await batch(student, [good, bad]);

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(
      res.body.results.map((r: { clientLocalId: string }) => [r.clientLocalId, r]),
    );
    expect(byId[good.clientLocalId].status).toBe("synced");
    expect(byId[bad.clientLocalId]).toMatchObject({
      status: "rejected",
      errorReason: "topic_invalid",
    });
  });
});

describe("replay", () => {
  it("returns the first outcome instead of posting twice", async () => {
    const q = question();
    const first = await batch(student, [q]);
    const again = await batch(student, [q]);

    expect(again.body.results[0].status).toBe("synced");
    expect(again.body.results[0].serverAssignedId).toBe(first.body.results[0].serverAssignedId);

    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM question WHERE author_profile_id = $1`,
      [student.profile.id],
    );
    // The whole reason the outbox is keyed by (owner, client_local_id): a phone that comes
    // back online and re-sends its queue must not double-post.
    expect(rows[0]!.n).toBe("1");
  });

  it("does not let a replay overwrite what was first submitted", async () => {
    const q = question();
    await batch(student, [q]);
    await batch(student, [{ ...q, payload: { topic: "advice", title: "CHANGED", body: "b" } }]);

    const { rows } = await pool.query<{ title: string }>(
      `SELECT title FROM question WHERE author_profile_id = $1`,
      [student.profile.id],
    );
    // A client re-sending different content is not editing, it is confused. Accepting the
    // second version would make the outbox disagree with what was actually processed.
    expect(rows[0]!.title).toBe("offline title");
  });

  it("refuses a batch that uses one local id twice", async () => {
    const q = question();
    const res = await batch(student, [q, { ...q, idempotencyKey: key() }]);
    // Both cannot be honoured: the second would silently return the first's result and the
    // phone would mark two different posts as one.
    expect(res.status).toBe(400);
  });
});

describe("an answer written offline to a question also written offline", () => {
  it("finds its parent through the local id the phone invented", async () => {
    // The case sync_queue_item exists for (schema §4a): the question had no server id when the
    // answer was written, so the answer can only name it by the phone's own id.
    const q = question({ clientCreatedAt: at(1) });
    const a = {
      clientLocalId: localId(),
      idempotencyKey: key(),
      entityType: "answer",
      clientCreatedAt: at(2),
      payload: { parentClientLocalId: q.clientLocalId, body: "my own follow-up" },
    };
    const res = await batch(student, [q, a]);
    const results = Object.fromEntries(
      res.body.results.map((r: { clientLocalId: string }) => [r.clientLocalId, r]),
    );
    expect(results[a.clientLocalId].status).toBe("synced");

    const { rows } = await pool.query<{ question_id: string }>(
      `SELECT question_id FROM answer WHERE body = 'my own follow-up'`,
    );
    expect(rows[0]!.question_id).toBe(results[q.clientLocalId].serverAssignedId);
  });

  it("resolves the parent even when the batch arrives out of order", async () => {
    // Sent child-first; processed oldest-first by the phone's clock.
    const q = question({ clientCreatedAt: at(1) });
    const a = {
      clientLocalId: localId(),
      idempotencyKey: key(),
      entityType: "answer",
      clientCreatedAt: at(2),
      payload: { parentClientLocalId: q.clientLocalId, body: "out of order" },
    };
    const res = await batch(student, [a, q]);
    expect(res.body.results[0].status).toBe("synced");
  });

  it("rejects an answer whose question was itself rejected", async () => {
    const q = question({
      clientCreatedAt: at(1),
      payload: { topic: "no-such-topic", title: "t", body: "b" },
    });
    const a = {
      clientLocalId: localId(),
      idempotencyKey: key(),
      entityType: "answer",
      clientCreatedAt: at(2),
      payload: { parentClientLocalId: q.clientLocalId, body: "orphan" },
    };
    const res = await batch(student, [q, a]);
    const results = Object.fromEntries(
      res.body.results.map((r: { clientLocalId: string }) => [r.clientLocalId, r]),
    );
    // Terminal, and correctly so: there is nothing for it to ever attach to.
    expect(results[a.clientLocalId]).toMatchObject({
      status: "rejected",
      errorReason: "parent_rejected",
    });
  });

  it("leaves an answer PENDING when its parent has not landed yet", async () => {
    // The distinction the reliability NFR rests on. This answer's only problem is its position
    // in a queue; rejecting it would throw away a post that was going to succeed.
    const parentLocal = localId();
    await pool.query(
      `INSERT INTO sync_queue_item (owner_profile_id, client_local_id, idempotency_key,
                                    entity_type, payload, client_created_at)
       VALUES ($1, $2, gen_random_uuid(), 'question', '{}'::jsonb, now())`,
      [student.profile.id, parentLocal],
    );
    const a = {
      clientLocalId: localId(),
      idempotencyKey: key(),
      entityType: "answer",
      clientCreatedAt: at(2),
      payload: { parentClientLocalId: parentLocal, body: "waiting on my parent" },
    };
    const res = await batch(student, [a]);
    expect(res.body.results[0]).toMatchObject({
      status: "pending",
      errorReason: "parent_pending",
    });
    // Counted as an attempt, not written off.
    expect(await queueRow(a.clientLocalId)).toMatchObject({
      sync_status: "pending",
      retry_count: 1,
    });
  });

  it("rejects an answer naming a local id the phone never sent", async () => {
    const a = {
      clientLocalId: localId(),
      idempotencyKey: key(),
      entityType: "answer",
      clientCreatedAt: at(2),
      payload: { parentClientLocalId: localId(), body: "nowhere" },
    };
    const res = await batch(student, [a]);
    expect(res.body.results[0]).toMatchObject({
      status: "rejected",
      errorReason: "parent_question_not_found",
    });
  });

  it("still accepts an answer that names a real, live question", async () => {
    const a = {
      clientLocalId: localId(),
      idempotencyKey: key(),
      entityType: "answer",
      clientCreatedAt: at(2),
      payload: { questionId: liveQuestionId, body: "answering something already live" },
    };
    expect((await batch(student, [a])).body.results[0].status).toBe("synced");
  });
});

describe("sync does not bypass moderation", () => {
  it("routes a synced post through the gateway like any other", async () => {
    // Not asserted by reading a flag: the fixture provider's own marker decides the verdict,
    // which only happens if the gateway actually ran.
    const held = question({
      payload: { topic: "advice", title: "held one", body: "[[moderation:escalate]] hmm" },
    });
    const res = await batch(student, [held]);
    expect(res.body.results[0].status).toBe("synced");

    const { rows } = await pool.query<{ moderation_status: string }>(
      `SELECT moderation_status FROM question WHERE id = $1`,
      [res.body.results[0].serverAssignedId],
    );
    // "synced" is about the OUTBOX — it reached the server and left the phone. Whether it is
    // published is a separate axis, which is exactly what S12 renders.
    expect(rows[0]!.moderation_status).toBe("pending");

    const cases = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM moderation_case WHERE question_id = $1`,
      [res.body.results[0].serverAssignedId],
    );
    expect(cases.rows[0]!.n).toBe("1");
  });

  it("marks a blocked post synced, because the queue's job is done either way", async () => {
    const blocked = question({
      payload: { topic: "advice", title: "bad", body: "[[moderation:block]] nope" },
    });
    const res = await batch(student, [blocked]);
    expect(res.body.results[0].status).toBe("synced");
    const { rows } = await pool.query<{ moderation_status: string }>(
      `SELECT moderation_status FROM question WHERE id = $1`,
      [res.body.results[0].serverAssignedId],
    );
    expect(rows[0]!.moderation_status).toBe("blocked");
  });
});

describe("votes and reports made offline", () => {
  it("lets the server decide the points, exactly as it does online", async () => {
    const v = {
      clientLocalId: localId(),
      idempotencyKey: key(),
      entityType: "vote",
      clientCreatedAt: at(1),
      // A delta in the payload is not part of the contract and must not become one.
      payload: { answerId: liveAnswerId, kind: "upvote", delta: 9999 },
    };
    expect((await batch(student, [v])).body.results[0].status).toBe("synced");
    const { rows } = await pool.query<{ delta: number }>(
      `SELECT delta FROM reputation_event WHERE answer_id = $1`,
      [liveAnswerId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.delta).toBe(1);
  });

  it("rejects an offline vote on your own answer", async () => {
    const mine = await pool.query<{ id: string }>(
      `INSERT INTO answer (question_id, author_profile_id, body, idempotency_key,
                           moderation_status)
       VALUES ($1, $2, 'mine', gen_random_uuid(), 'published') RETURNING id`,
      [liveQuestionId, student.profile.id],
    );
    const v = {
      clientLocalId: localId(),
      idempotencyKey: key(),
      entityType: "vote",
      clientCreatedAt: at(1),
      payload: { answerId: mine.rows[0]!.id, kind: "upvote" },
    };
    // Terminal: being your own answer is not a condition that changes on retry.
    expect((await batch(student, [v])).body.results[0]).toMatchObject({
      status: "rejected",
      errorReason: "self_vote_forbidden",
    });
  });

  it("files a real grievance ticket for an offline report", async () => {
    const r = {
      clientLocalId: localId(),
      idempotencyKey: key(),
      entityType: "report",
      clientCreatedAt: at(1),
      payload: { questionId: liveQuestionId, reason: "harassment" },
    };
    const res = await batch(student, [r]);
    expect(res.body.results[0].status).toBe("synced");

    const { rows } = await pool.query<{ acknowledged_at: Date | null; reason: string }>(
      `SELECT acknowledged_at, reason FROM grievance_report WHERE id = $1`,
      [res.body.results[0].serverAssignedId],
    );
    // Including the acknowledgement, because it happens in the intake write and sync uses the
    // same intake.
    expect(rows[0]!.reason).toBe("harassment");
    expect(rows[0]!.acknowledged_at).not.toBeNull();
  });

  it("refuses a reason the vocabulary does not contain, before it reaches the database", async () => {
    const r = {
      clientLocalId: localId(),
      idempotencyKey: key(),
      entityType: "report",
      clientCreatedAt: at(1),
      payload: { questionId: liveQuestionId, reason: "i dislike it" },
    };
    // Whole-batch 400: the item's shape is unreadable, so there is nothing to report per item.
    expect((await batch(student, [r])).status).toBe(400);
  });
});

describe("the batch as a whole", () => {
  it("refuses an empty batch and one over the ceiling", async () => {
    expect((await batch(student, [])).status).toBe(400);
    const { MAX_BATCH_ITEMS } = await import("../../server/src/modules/sync/sync.service.js");
    const many = Array.from({ length: MAX_BATCH_ITEMS + 1 }, () => question());
    expect((await batch(student, many)).status).toBe(400);
  });

  it("refuses a banned caller outright, rather than per item", async () => {
    await pool.query(`UPDATE pseudonymous_profile SET status = 'banned' WHERE id = $1`, [
      student.profile.id,
    ]);
    const res = await batch(student, [question()]);
    // A ban applies to the actor, not to a post, so there is no per-item variation to report.
    // The obligation this puts on T28/T31 is written down in sync.routes.ts: a 403 here means
    // the client's queue must go terminal, not retry.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("account_banned");
  });

  it("requires a session", async () => {
    const res = await request(app).post("/sync/batch").send({ items: [question()] });
    expect(res.status).toBe(401);
  });
});

describe("last-write-wins, and the status that has nothing to produce it", () => {
  it("never returns 'conflict', because no queueable write is an edit", async () => {
    // Worth an assertion rather than a comment. The write model (schema §4a) specifies
    // last-write-wins for free-text EDITS, and `sync_status` has a `conflict` value for it —
    // but every entity type the queue can carry (question, answer, vote, report) is a CREATE.
    // Nothing in the plan builds editing at all. So `conflict` is unreachable today, and this
    // fails the moment editing arrives, which is when the LWW rule needs designing rather
    // than inheriting.
    const q = question({ clientCreatedAt: at(1) });
    const a = {
      clientLocalId: localId(),
      idempotencyKey: key(),
      entityType: "answer",
      clientCreatedAt: at(2),
      payload: { questionId: liveQuestionId, body: "b" },
    };
    const v = {
      clientLocalId: localId(),
      idempotencyKey: key(),
      entityType: "vote",
      clientCreatedAt: at(3),
      payload: { answerId: liveAnswerId, kind: "upvote" },
    };
    const res = await batch(student, [q, a, v]);
    expect(
      res.body.results.every((r: { status: string }) => r.status !== "conflict"),
    ).toBe(true);

    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM sync_queue_item WHERE sync_status = 'conflict'`,
    );
    expect(rows[0]!.n).toBe("0");
  });
});

describe("the reconciliation query T32 will alert on", () => {
  it("finds an item that has been sitting non-terminal, and ignores finished ones", async () => {
    const stuck = localId();
    await pool.query(
      `INSERT INTO sync_queue_item (owner_profile_id, client_local_id, idempotency_key,
                                    entity_type, payload, client_created_at, created_at)
       VALUES ($1, $2, gen_random_uuid(), 'question', '{}'::jsonb, now(), now() - interval '2 days')`,
      [student.profile.id, stuck],
    );
    await batch(student, [question()]); // a healthy, synced one

    const { findStuckItems } = await import("../../server/src/modules/sync/sync.repo.js");
    const found = await findStuckItems(pool, 24 * 3_600_000);
    // An all-clear from a check nobody has seen fail is not evidence — same lesson as the
    // reputation drift queries in T22.
    expect(found).toHaveLength(1);
  });
});
