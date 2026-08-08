import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth, type SignedInUser } from "../helpers/auth.js";

/**
 * T34 — A8 `POST /reports`, report intake.
 *
 * What these pin, in order of how much it would cost to get wrong:
 *
 *  1. the deadline is derived from the category and cannot be moved afterwards;
 *  2. an anonymous report leaves no reporter ANYWHERE, including the audit log;
 *  3. a duplicate merges rather than opening a second ticket with a second clock;
 *  4. every ticket is acknowledged at intake, and the reconciliation query that proves it
 *     actually notices when one is not.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

let app: import("express").Express;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;

let reporter: SignedInUser;
let other: SignedInUser;
let questionId: string;
let answerId: string;
let heldQuestionId: string;

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  process.env.MODERATION_PROVIDER = "fixture";
  if (!process.env.DATABASE_URL) {
    throw new Error("T34 report-intake tests require DATABASE_URL (disposable test Postgres)");
  }
  const db = await import("../helpers/test-db.js");
  ({ truncateAll, closeDb, pool } = db);
  const { createApp } = await import("../../server/src/app.js");
  await db.migrateTestDb();
  app = createApp();
});

async function seed(): Promise<void> {
  const { signIn } = await import("../helpers/auth.js");
  reporter = await signIn(app, "t34.reporter.24@nitj.ac.in");
  other = await signIn(app, "t34.other.24@nitj.ac.in");
  const author = await signIn(app, "t34.author.23@nitj.ac.in");

  const topic = await pool.query<{ id: string }>(`SELECT id FROM topic_tag WHERE slug='advice'`);
  const insertQuestion = async (status: string) => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO question (author_profile_id, topic_tag_id, title, body, idempotency_key,
                             moderation_status, published_at)
       VALUES ($1, $2, 't', 'b', gen_random_uuid(), $3,
               CASE WHEN $3 = 'published' THEN now() ELSE NULL END)
       RETURNING id`,
      [author.profile.id, topic.rows[0]!.id, status],
    );
    return rows[0]!.id;
  };
  questionId = await insertQuestion("published");
  heldQuestionId = await insertQuestion("pending");

  const a = await pool.query<{ id: string }>(
    `INSERT INTO answer (question_id, author_profile_id, body, idempotency_key, moderation_status)
     VALUES ($1, $2, 'b', gen_random_uuid(), 'published') RETURNING id`,
    [questionId, author.profile.id],
  );
  answerId = a.rows[0]!.id;
}

beforeEach(async () => {
  await truncateAll();
  await seed();
});

afterAll(async () => {
  await closeDb();
});

function file(user: SignedInUser, body: Record<string, unknown>) {
  return request(app).post("/reports").set(...auth(user)).send(body);
}

async function auditOf(reportId: string) {
  const { rows } = await pool.query<{
    actor_type: string;
    actor_profile_id: string | null;
    action: string;
  }>(
    `SELECT actor_type, actor_profile_id, action FROM grievance_audit_log
      WHERE grievance_report_id = $1 ORDER BY created_at, action`,
    [reportId],
  );
  return rows;
}

describe("filing a report", () => {
  it("creates an acknowledged ticket with a deadline derived from the category", async () => {
    const res = await file(reporter, { questionId, reason: "harassment" });
    expect(res.status).toBe(201);
    expect(res.body.expedited).toBe(false);
    expect(res.body.acknowledgedAt).not.toBeNull();

    const { rows } = await pool.query<{
      status: string;
      sla_breached: boolean;
      gap_hours: string;
    }>(
      `SELECT status, sla_breached,
              round(extract(epoch FROM (sla_deadline - created_at)) / 3600)::text AS gap_hours
         FROM grievance_report WHERE id = $1`,
      [res.body.reportId],
    );
    // 15 days, the general Rule 3(2)(a) clock. Asserted against the stored row rather than
    // the response, because the stored value is what the breach flag is generated from.
    expect(rows[0]).toEqual({ status: "open", sla_breached: false, gap_hours: "360" });
  });

  it("puts the unlawful-content categories on the 24-hour clock instead", async () => {
    const res = await file(reporter, { questionId, reason: "non_consensual_imagery" });
    expect(res.status).toBe(201);
    expect(res.body.expedited).toBe(true);

    const { rows } = await pool.query<{ gap_hours: string }>(
      `SELECT round(extract(epoch FROM (sla_deadline - created_at)) / 3600)::text AS gap_hours
         FROM grievance_report WHERE id = $1`,
      [res.body.reportId],
    );
    // The whole point of T34: before this, every report got one clock, because there was no
    // category to segment on.
    expect(rows[0]!.gap_hours).toBe("24");
  });

  it("accepts a report against an answer as well as a question", async () => {
    const res = await file(reporter, { answerId, reason: "hate_speech" });
    expect(res.status).toBe(201);
    const { rows } = await pool.query<{ question_id: null; answer_id: string }>(
      `SELECT question_id, answer_id FROM grievance_report WHERE id = $1`,
      [res.body.reportId],
    );
    expect(rows[0]).toEqual({ question_id: null, answer_id: answerId });
  });

  it("writes both the reporter's entry and the system acknowledgement to the audit log", async () => {
    const res = await file(reporter, { questionId, reason: "spam_or_scam" });
    const audit = await auditOf(res.body.reportId);
    expect(audit).toEqual([
      { actor_type: "system", actor_profile_id: null, action: "acknowledged" },
      {
        actor_type: "reporter",
        actor_profile_id: reporter.profile.id,
        action: "report_filed",
      },
    ]);
  });
});

describe("what may be reported", () => {
  it("refuses content that is held rather than published", async () => {
    // A student cannot see a held post, so a report against one comes from someone guessing
    // IDs. The refusal is identical to a genuinely missing item on purpose — a distinct error
    // would confirm the row exists.
    const res = await file(reporter, { questionId: heldQuestionId, reason: "harassment" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("reported_content_not_found");
  });

  it("refuses an id that does not exist, with the same code", async () => {
    const res = await file(reporter, {
      questionId: "00000000-0000-4000-8000-000000000001",
      reason: "harassment",
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("reported_content_not_found");
  });

  it("refuses a reason outside the vocabulary", async () => {
    const res = await file(reporter, { questionId, reason: "i just dont like it" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_failed");
  });

  it("refuses both targets at once, and neither", async () => {
    expect((await file(reporter, { questionId, answerId, reason: "harassment" })).status).toBe(400);
    expect((await file(reporter, { reason: "harassment" })).status).toBe(400);
  });

  it("refuses an unauthenticated caller", async () => {
    // `isAnonymous` means "store no reporter", never "accept a report from nobody" —
    // an unauthenticated intake would be an unbounded abuse channel.
    const res = await request(app).post("/reports").send({ questionId, reason: "harassment" });
    expect(res.status).toBe(401);
  });
});

describe("anonymity is stored, not styled", () => {
  it("keeps no reporter on the row and none in the audit log", async () => {
    const res = await file(reporter, {
      questionId,
      reason: "impersonation",
      isAnonymous: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.isAnonymous).toBe(true);

    const { rows } = await pool.query<{ is_anonymous: boolean; reporter_profile_id: null }>(
      `SELECT is_anonymous, reporter_profile_id FROM grievance_report WHERE id = $1`,
      [res.body.reportId],
    );
    expect(rows[0]).toEqual({ is_anonymous: true, reporter_profile_id: null });

    // The half that is easy to miss. An anonymous report whose audit trail still names the
    // reporter is anonymous on screen only, and any later query undoes it.
    const audit = await auditOf(res.body.reportId);
    expect(audit.every((r) => r.actor_profile_id === null)).toBe(true);
    expect(audit.map((r) => r.action).sort()).toEqual(["acknowledged", "report_filed"]);
  });

  it("does not merge anonymous reports, which is the stated cost of storing anonymity", async () => {
    const first = await file(reporter, { questionId, reason: "harassment", isAnonymous: true });
    const second = await file(reporter, { questionId, reason: "harassment", isAnonymous: true });
    expect(second.status).toBe(201);
    expect(second.body.merged).toBe(false);
    expect(second.body.reportId).not.toBe(first.body.reportId);
    // Merging would need a reporter id on the row, and putting one there "just for
    // de-duplication" is exactly what the anonymity property forbids. The per-profile rate
    // limit is what bounds this instead.
  });
});

describe("a duplicate merges into the open ticket", () => {
  it("returns the original and opens no second ticket", async () => {
    const first = await file(reporter, { questionId, reason: "harassment" });
    const second = await file(reporter, { questionId, reason: "hate_speech" });

    expect(second.status).toBe(200);
    expect(second.body.merged).toBe(true);
    expect(second.body.reportId).toBe(first.body.reportId);

    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM grievance_report WHERE question_id = $1`,
      [questionId],
    );
    // A second row would carry its own deadline and its own generated breach flag, and sit
    // open forever inflating both the operator queue and the breach statistics.
    expect(rows[0]!.n).toBe("1");
  });

  it("records the repeat in the audit log rather than losing it", async () => {
    const first = await file(reporter, { questionId, reason: "harassment" });
    await file(reporter, { questionId, reason: "harassment" });
    const actions = (await auditOf(first.body.reportId)).map((r) => r.action);
    expect(actions).toContain("duplicate_report_merged");
  });

  it("does not merge a different reporter's report", async () => {
    const first = await file(reporter, { questionId, reason: "harassment" });
    const second = await file(other, { questionId, reason: "harassment" });
    expect(second.status).toBe(201);
    expect(second.body.reportId).not.toBe(first.body.reportId);
  });

  it("does not merge into a report that has already been resolved", async () => {
    const first = await file(reporter, { questionId, reason: "harassment" });
    await pool.query(
      `UPDATE grievance_report SET status='resolved', resolution_action='dismiss',
                                   resolved_at=now() WHERE id=$1`,
      [first.body.reportId],
    );
    // Content that re-offends, or a reporter who disputes the dismissal, is a new grievance
    // and deserves its own clock.
    const second = await file(reporter, { questionId, reason: "harassment" });
    expect(second.status).toBe(201);
    expect(second.body.reportId).not.toBe(first.body.reportId);
  });

  it("does not merge a report on a different piece of content", async () => {
    const onQuestion = await file(reporter, { questionId, reason: "harassment" });
    const onAnswer = await file(reporter, { answerId, reason: "harassment" });
    expect(onAnswer.status).toBe(201);
    expect(onAnswer.body.reportId).not.toBe(onQuestion.body.reportId);
  });
});

describe("idempotency", () => {
  const key = "22222222-2222-4222-8222-222222222222";

  it("replays the same ticket rather than filing a second", async () => {
    const first = await file(reporter, { questionId, reason: "harassment", idempotencyKey: key });
    const replay = await file(reporter, { questionId, reason: "harassment", idempotencyKey: key });
    expect(replay.status).toBe(200);
    expect(replay.body.reportId).toBe(first.body.reportId);
  });

  it("refuses someone else's key instead of handing over their ticket", async () => {
    await file(reporter, { questionId, reason: "harassment", idempotencyKey: key });
    const stolen = await file(other, { questionId, reason: "harassment", idempotencyKey: key });
    expect(stolen.status).toBe(409);
    expect(stolen.body.error.code).toBe("idempotency_key_conflict");
  });
});

describe("the deadline cannot be moved once the ticket exists", () => {
  it("refuses an UPDATE that changes sla_deadline", async () => {
    const res = await file(reporter, { questionId, reason: "non_consensual_imagery" });
    // The generated breach flag closes the front door — nobody can set or unset it. This is
    // the back door: push the deadline out, resolve late, and the record reads compliant.
    await expect(
      pool.query(
        `UPDATE grievance_report SET sla_deadline = sla_deadline + interval '30 days'
          WHERE id = $1`,
        [res.body.reportId],
      ),
    ).rejects.toThrow(/immutable/i);
  });

  it("still allows the resolution fields to be written", async () => {
    const res = await file(reporter, { questionId, reason: "harassment" });
    await pool.query(
      `UPDATE grievance_report SET status='resolved', resolution_action='takedown',
                                   resolution_notes='removed', resolved_at=now()
        WHERE id=$1`,
      [res.body.reportId],
    );
    const { rows } = await pool.query<{ status: string }>(
      `SELECT status FROM grievance_report WHERE id=$1`,
      [res.body.reportId],
    );
    expect(rows[0]!.status).toBe("resolved");
  });
});

describe("acknowledgement is an invariant, not a countdown", () => {
  it("reports nothing unacknowledged after a normal intake", async () => {
    await file(reporter, { questionId, reason: "harassment" });
    const { findUnacknowledgedReports } = await import(
      "../../server/src/modules/grievance/grievance.repo.js"
    );
    expect(await findUnacknowledgedReports(pool)).toEqual([]);
  });

  it("notices when a ticket is left unacknowledged", async () => {
    // An all-clear from a check nobody has ever seen fail is not evidence — the same lesson
    // the reputation drift queries were given in T22. So break it on purpose.
    const res = await file(reporter, { questionId, reason: "harassment" });
    await pool.query(`UPDATE grievance_report SET acknowledged_at = NULL WHERE id = $1`, [
      res.body.reportId,
    ]);
    const { findUnacknowledgedReports } = await import(
      "../../server/src/modules/grievance/grievance.repo.js"
    );
    const found = await findUnacknowledgedReports(pool);
    expect(found.map((r) => r.id)).toEqual([res.body.reportId]);
  });
});

describe("rate limiting", () => {
  it("bounds one reporter without touching another on the same address", async () => {
    // Every request in this suite arrives from the same address. If the limiter bucketed by
    // address — as every other limiter in the app does, correctly, for its unauthenticated
    // routes — the second student here would be locked out by the first, which is the
    // "lock out the whole campus behind one NAT" failure.
    const { config } = await import("../../server/src/config/index.js");
    const budget = config.rateLimitReportsPerHour;

    let lastStatus = 0;
    for (let i = 0; i < budget + 1; i += 1) {
      // These merge after the first one, and that is fine: the limiter is middleware and
      // counts REQUESTS, before any merge logic runs. Report-spam costs the same whether it
      // opens tickets or not, so bounding the request is the right place to bound it.
      const res = await file(reporter, {
        questionId,
        reason: "harassment",
        idempotencyKey: `33333333-3333-4333-8333-3333333333${String(i).padStart(2, "0")}`,
      });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);

    const fromOther = await file(other, { questionId, reason: "harassment" });
    expect(fromOther.status).toBe(201);
  });
});

describe("the reason list the client draws from", () => {
  it("is served rather than hard-coded, so it cannot drift from the constraint", async () => {
    const res = await request(app).get("/reports/reasons").set(...auth(reporter));
    expect(res.status).toBe(200);
    expect(res.body.reasons).toContain("non_consensual_imagery");
    expect(res.body.reasons).toContain("other");

    // The real assertion: every reason offered is one the database will actually accept. A
    // client shipped with a stale copy would offer a reason every submit refuses.
    for (const reason of res.body.reasons as string[]) {
      const filed = await pool.query<{ id: string }>(
        `INSERT INTO grievance_report (question_id, reason, sla_deadline)
         VALUES ($1, $2, now()) RETURNING id`,
        [questionId, reason],
      );
      expect(filed.rows[0]!.id).toBeTruthy();
    }
  });
});
