import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth, type SignedInUser } from "../helpers/auth.js";

/**
 * T32 — the offline-queue reconciliation audit.
 *
 * The NFR is "100% of queued client writes reach a terminal state; none silently lost". These
 * exist because an all-clear from a check nobody has ever seen fail is not evidence — the same
 * lesson the reputation drift queries were given in T22 and the acknowledgement invariant in
 * T38. So every test here plants the failure on purpose and checks the audit notices.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

let app: import("express").Express;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;

let student: SignedInUser;

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  process.env.MODERATION_PROVIDER = "fixture";
  if (!process.env.DATABASE_URL) {
    throw new Error("T32 reconciliation tests require DATABASE_URL (disposable test Postgres)");
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
  student = await signIn(app, "t32.student.24@nitj.ac.in");
});

afterAll(async () => {
  await closeDb();
});

async function runPass() {
  const { runSyncReconciliationPass } = await import(
    "../../server/src/modules/sync/sync-reconciliation.job.js"
  );
  return runSyncReconciliationPass();
}

/** A queue row of a chosen age and status, planted directly. */
// `secs`, not `hours`: make_interval's `hours` parameter is an int, and only `secs` is
// double precision — CI refused "make_interval(hours => double precision)" outright.
async function plant(opts: {
  ageHours: number;
  status?: string;
  entityType?: string;
  retryCount?: number;
}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO sync_queue_item
       (owner_profile_id, client_local_id, idempotency_key, entity_type, payload,
        client_created_at, sync_status, retry_count, created_at)
     VALUES ($1, gen_random_uuid(), gen_random_uuid(), $2, '{"title":"t"}'::jsonb, now(),
             $3, $4, now() - make_interval(secs => $5::double precision))
     RETURNING id`,
    [
      student.profile.id,
      opts.entityType ?? "question",
      opts.status ?? "pending",
      opts.retryCount ?? 0,
      opts.ageHours * 3600,
    ],
  );
  return rows[0]!.id;
}

describe("the audit finds what it is supposed to find", () => {
  it("reports nothing when the queue is healthy", async () => {
    // A post that synced a moment ago, through the real endpoint.
    const res = await request(app)
      .post("/sync/batch")
      .set(...auth(student))
      .send({
        items: [
          {
            clientLocalId: "44444444-0000-4000-8000-000000000001",
            idempotencyKey: "55555555-0000-4000-8000-000000000001",
            entityType: "question",
            clientCreatedAt: new Date().toISOString(),
            payload: { topic: "advice", title: "fine", body: "fine" },
          },
        ],
      });
    expect(res.body.results[0].status).toBe("synced");

    expect(await runPass()).toMatchObject({ stuck: 0, oldestAgeSeconds: null });
  });

  it("notices an item that has been pending past the window", async () => {
    await plant({ ageHours: 48, retryCount: 3 });
    const result = await runPass();
    expect(result.stuck).toBe(1);
    expect(result.maxRetryCount).toBe(3);
    expect(result.byEntityType).toEqual({ question: 1 });
    expect(result.oldestAgeSeconds).toBeGreaterThan(47 * 3600);
  });

  it("leaves a recent item alone, so a phone with no signal all day is not an incident", async () => {
    // An audit that routinely flags healthy items is one people learn to ignore, which is the
    // same alert-fatigue failure the grievance alerts are shaped around.
    await plant({ ageHours: 2 });
    expect((await runPass()).stuck).toBe(0);
  });

  it("ignores items that already reached a terminal state", async () => {
    // Old, but finished — which is the normal end of an item's life, not a fault.
    await plant({ ageHours: 100, status: "synced" });
    await plant({ ageHours: 100, status: "rejected" });
    expect((await runPass()).stuck).toBe(0);
  });

  it("counts 'syncing' as stuck too, not only 'pending'", async () => {
    // Nothing sets `syncing` today. That is exactly why it is audited: a state that is never
    // written is also a state nobody would notice being written by mistake and never cleared.
    await plant({ ageHours: 48, status: "syncing" });
    expect((await runPass()).stuck).toBe(1);
  });

  it("separates the kinds of write, because they fail for different reasons", async () => {
    await plant({ ageHours: 30, entityType: "question" });
    await plant({ ageHours: 40, entityType: "answer" });
    await plant({ ageHours: 50, entityType: "vote", retryCount: 7 });
    const result = await runPass();
    expect(result.stuck).toBe(3);
    expect(result.byEntityType).toEqual({ question: 1, answer: 1, vote: 1 });
    // Repeated failed attempts and zero attempts need different responses: something broken
    // versus nobody coming back.
    expect(result.maxRetryCount).toBe(7);
    expect(result.oldestAgeSeconds).toBeGreaterThan(49 * 3600);
  });
});

describe("what the audit does NOT do, asserted so it stays deliberate", () => {
  it("does not retry a stuck item on the student's behalf", async () => {
    // The payload is stored, so the server COULD re-drive this. It deliberately does not: a
    // post appearing under a student's name days later, at a moment they did not choose, is a
    // product decision and not a reconciliation detail. Recorded in sync-reconciliation.job.ts
    // with its cost — an item whose client never returns stays counted for ever.
    const id = await plant({ ageHours: 72 });
    await runPass();
    await runPass();

    const { rows } = await pool.query<{ sync_status: string; retry_count: number }>(
      `SELECT sync_status, retry_count FROM sync_queue_item WHERE id = $1`,
      [id],
    );
    expect(rows[0]).toMatchObject({ sync_status: "pending", retry_count: 0 });

    const questions = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM question`);
    expect(questions.rows[0]!.n).toBe("0");
  });

  it("keeps reporting the same item rather than quietly forgetting it", async () => {
    // A count on every pass, not one alert then silence. It is a log line, not an inbox, so
    // repetition costs nothing — and a queue that looks clean because somebody stopped
    // counting is the failure this whole job exists to prevent.
    await plant({ ageHours: 72 });
    expect((await runPass()).stuck).toBe(1);
    expect((await runPass()).stuck).toBe(1);
  });
});
