import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SignedInUser } from "../helpers/auth.js";

/**
 * T27 — migration 004: the offline outbox and the draft autosave table.
 *
 * These go at the database directly. Nothing calls these tables yet — the client queue is T28
 * and batch sync is T29 — so what is pinned here is what the schema is supposed to guarantee
 * no matter which of those writes it first. The two that would cost the most to get wrong:
 *
 *  - **the replay guard.** A phone that syncs the same queue twice must collide, not duplicate.
 *    If that is not true, an offline post appears twice and the fix arrives after the damage;
 *  - **the draft upsert targets.** The frozen schema's index table requires them and its DDL
 *    block omits them, and the failure is silent — autosave just grows rows forever.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

let app: import("express").Express;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;

let owner: SignedInUser;
let other: SignedInUser;
let questionId: string;
let topicId: string;

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  process.env.MODERATION_PROVIDER = "fixture";
  if (!process.env.DATABASE_URL) {
    throw new Error("T27 offline-queue tests require DATABASE_URL (disposable test Postgres)");
  }
  const db = await import("../helpers/test-db.js");
  ({ truncateAll, closeDb, pool } = db);
  const { createApp } = await import("../../server/src/app.js");
  await db.migrateTestDb();
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  const { signIn } = await import("../helpers/auth.js");
  owner = await signIn(app, "t27.owner.24@nitj.ac.in");
  other = await signIn(app, "t27.other.24@nitj.ac.in");
  const topic = await pool.query<{ id: string }>(`SELECT id FROM topic_tag WHERE slug='advice'`);
  topicId = topic.rows[0]!.id;
  const q = await pool.query<{ id: string }>(
    `INSERT INTO question (author_profile_id, topic_tag_id, title, body, idempotency_key,
                           moderation_status, published_at)
     VALUES ($1, $2, 't', 'b', gen_random_uuid(), 'published', now()) RETURNING id`,
    [other.profile.id, topicId],
  );
  questionId = q.rows[0]!.id;
});

afterAll(async () => {
  await closeDb();
});

const LOCAL_A = "aaaaaaaa-0000-4000-8000-000000000001";
const LOCAL_B = "bbbbbbbb-0000-4000-8000-000000000002";

function queueItem(profileId: string, localId: string, extra: Record<string, unknown> = {}) {
  return pool.query<{ id: string; sync_status: string; retry_count: number }>(
    `INSERT INTO sync_queue_item
       (owner_profile_id, client_local_id, idempotency_key, entity_type, payload,
        client_created_at)
     VALUES ($1, $2, $3, $4, $5, now())
     RETURNING id, sync_status, retry_count`,
    [
      profileId,
      localId,
      (extra.idempotencyKey as string) ?? "cccccccc-0000-4000-8000-000000000003",
      (extra.entityType as string) ?? "question",
      JSON.stringify(extra.payload ?? { title: "t", body: "b" }),
    ],
  );
}

describe("sync_queue_item — the replay guard", () => {
  it("refuses the same local id twice from the same phone", async () => {
    // The whole point of the outbox. A phone that comes back online and re-sends its queue
    // must collide here rather than posting the same question a second time.
    await queueItem(owner.profile.id, LOCAL_A);
    await expect(queueItem(owner.profile.id, LOCAL_A)).rejects.toMatchObject({
      code: "23505",
      constraint: "uq_sync_queue_owner_local_id",
    });
  });

  it("lets two different students use the same local id", async () => {
    // Two phones can independently invent the same local id, and that is not one person
    // replaying — a globally unique constraint here would reject a stranger's genuine post.
    await queueItem(owner.profile.id, LOCAL_A);
    const second = await queueItem(other.profile.id, LOCAL_A);
    expect(second.rows[0]!.id).toBeTruthy();
  });

  it("starts pending with no retries and nothing assigned by the server yet", async () => {
    const { rows } = await queueItem(owner.profile.id, LOCAL_B);
    expect(rows[0]).toMatchObject({ sync_status: "pending", retry_count: 0 });
    const { rows: full } = await pool.query<{ server_assigned_id: null; error_reason: null }>(
      `SELECT server_assigned_id, error_reason FROM sync_queue_item WHERE id = $1`,
      [rows[0]!.id],
    );
    expect(full[0]).toEqual({ server_assigned_id: null, error_reason: null });
  });

  it("accepts every entity type the offline queue can carry", async () => {
    // 'vote' and 'report' are in the enum because the write model says votes and reports are
    // queueable too — not only posts. A missing one would surface as a crash at T29, offline.
    for (const [i, type] of ["question", "answer", "vote", "report"].entries()) {
      const res = await queueItem(owner.profile.id, `dddddddd-0000-4000-8000-00000000000${i}`, {
        entityType: type,
      });
      expect(res.rows[0]!.id).toBeTruthy();
    }
  });

  it("refuses an entity type that is not one of those four", async () => {
    await expect(
      queueItem(owner.profile.id, LOCAL_B, { entityType: "profile_update" }),
    ).rejects.toMatchObject({ code: "22P02" }); // invalid_text_representation
  });

  it("insists a queued item belongs to somebody", async () => {
    await expect(
      pool.query(
        `INSERT INTO sync_queue_item (client_local_id, idempotency_key, entity_type, payload,
                                      client_created_at)
         VALUES ($1, $1, 'question', '{}'::jsonb, now())`,
        [LOCAL_A],
      ),
    ).rejects.toMatchObject({ code: "23502" }); // not_null_violation
  });
});

describe("content_draft — one draft to come back to, not a pile", () => {
  const draft = (profileId: string, extra: Record<string, unknown> = {}) =>
    pool.query<{ id: string }>(
      `INSERT INTO content_draft (profile_id, entity_type, parent_question_id, topic_tag_id,
                                  title, body)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        profileId,
        (extra.entityType as string) ?? "question",
        (extra.parentQuestionId as string | null) ?? null,
        (extra.topicTagId as string | null) ?? null,
        (extra.title as string | null) ?? "half a question",
        (extra.body as string | null) ?? "half a body",
      ],
    );

  it("allows only one question draft per student", async () => {
    // Without this index — which the frozen DDL block omits and the frozen index table
    // requires — autosave has nothing to upsert against, and every save from the composer
    // inserts another row. Nothing errors; the table just grows, and reopening the composer
    // faces a pile of drafts with no defensible way to pick one.
    await draft(owner.profile.id);
    await expect(draft(owner.profile.id)).rejects.toMatchObject({
      code: "23505",
      constraint: "uq_content_draft_one_question_per_profile",
    });
  });

  it("still lets a different student have their own question draft", async () => {
    await draft(owner.profile.id);
    const second = await draft(other.profile.id);
    expect(second.rows[0]!.id).toBeTruthy();
  });

  it("allows one answer draft per question, and a second on a different question", async () => {
    const q2 = await pool.query<{ id: string }>(
      `INSERT INTO question (author_profile_id, topic_tag_id, title, body, idempotency_key,
                             moderation_status, published_at)
       VALUES ($1, $2, 't2', 'b2', gen_random_uuid(), 'published', now()) RETURNING id`,
      [other.profile.id, topicId],
    );

    await draft(owner.profile.id, { entityType: "answer", parentQuestionId: questionId });
    await expect(
      draft(owner.profile.id, { entityType: "answer", parentQuestionId: questionId }),
    ).rejects.toMatchObject({ constraint: "uq_content_draft_one_answer_per_question" });

    // Answering two different threads at once is normal, not a conflict.
    const onOther = await draft(owner.profile.id, {
      entityType: "answer",
      parentQuestionId: q2.rows[0]!.id,
    });
    expect(onOther.rows[0]!.id).toBeTruthy();
  });

  it("does not let a question draft and an answer draft collide with each other", async () => {
    // Both indexes are partial, so the two kinds of draft live in separate uniqueness spaces.
    await draft(owner.profile.id);
    const answer = await draft(owner.profile.id, {
      entityType: "answer",
      parentQuestionId: questionId,
    });
    expect(answer.rows[0]!.id).toBeTruthy();
  });

  it("refuses an answer draft with no question to answer", async () => {
    // Not decoration: it is what lets the answer uniqueness index rely on a non-null parent.
    // Two NULL parents would not conflict in Postgres, and the uniqueness would quietly
    // not hold.
    await expect(
      draft(owner.profile.id, { entityType: "answer", parentQuestionId: null }),
    ).rejects.toMatchObject({ constraint: "chk_content_draft_answer_has_parent" });
  });
});

describe("storage hardening carried by migration 004 (SEC-003)", () => {
  it("has row-level security on both tables", async () => {
    // Migration 008 has already run on the live database and will never see these two, so if
    // 004's own hardening block is dropped as redundant, the tables holding UNPUBLISHED student
    // writing lose their second lock — content the student never chose to show anyone.
    const { rows } = await pool.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class
        WHERE relname IN ('sync_queue_item','content_draft') AND relkind = 'r'
        ORDER BY relname`,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });
});
