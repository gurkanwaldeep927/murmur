import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth, type SignedInUser } from "../helpers/auth.js";

/**
 * T38 — the grievance SLA job.
 *
 * What these pin, and why each one is here rather than assumed:
 *
 *  - an alert is recorded as sent ONLY after it was sent. A compliance record saying the
 *    officer was notified when nobody was is worse than no record;
 *  - a ticket with no recipient stays DUE, and fires once a recipient exists;
 *  - the warning fires with time left to act on both clocks, and only once;
 *  - the notice carries no reporter and no reported content — it goes to a mailbox, and a
 *    mailbox is a place things get forwarded from;
 *  - an unacknowledged ticket is treated as a defect, not as a slow human.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

let app: import("express").Express;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;

let reporter: SignedInUser;
let questionId: string;

const OFFICER = "grievance.officer@nitj.ac.in";
const HOUR = 3_600_000;

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  process.env.MODERATION_PROVIDER = "fixture";
  if (!process.env.DATABASE_URL) {
    throw new Error("T38 SLA-job tests require DATABASE_URL (disposable test Postgres)");
  }
  const db = await import("../helpers/test-db.js");
  ({ truncateAll, closeDb, pool } = db);
  const { createApp } = await import("../../server/src/app.js");
  await db.migrateTestDb();
  app = createApp();
});

async function notices() {
  const { memoryEmailProvider } = await import(
    "../../server/src/modules/notification/email-provider.js"
  );
  return memoryEmailProvider!.sentNotices();
}

async function clearNotices() {
  const { memoryEmailProvider } = await import(
    "../../server/src/modules/notification/email-provider.js"
  );
  memoryEmailProvider!.clearNotices();
}

async function runPass() {
  const { runGrievanceSlaPass } = await import(
    "../../server/src/modules/grievance/grievance-sla.job.js"
  );
  return runGrievanceSlaPass();
}

/** Publish the officer contact T42 will eventually load for real. */
async function publishOfficer(email = OFFICER) {
  await pool.query(
    `INSERT INTO grievance_officer_contact (officer_name, contact_email) VALUES ('Officer', $1)`,
    [email],
  );
}

/**
 * A ticket with a chosen deadline, inserted directly.
 *
 * It has to be direct: A8 computes the deadline from the category, and T34's migration 010
 * makes it immutable afterwards — so there is no way to age a ticket through the API, which is
 * the point of that trigger.
 */
async function ticket(opts: {
  reason: string;
  deadlineMs: number;
  acknowledged?: boolean;
  status?: string;
  merged?: boolean;
}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO grievance_report
       (question_id, reason, reporter_profile_id, sla_deadline, acknowledged_at, status,
        resolved_at)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4::double precision), $5, $6, $7)
     RETURNING id`,
    [
      questionId,
      opts.reason,
      reporter.profile.id,
      opts.deadlineMs / 1000,
      opts.acknowledged === false ? null : new Date(),
      opts.status ?? "open",
      opts.status === "resolved" ? new Date() : null,
    ],
  );
  const id = rows[0]!.id;
  if (opts.merged) {
    const parent = await pool.query<{ id: string }>(
      `INSERT INTO grievance_report (question_id, reason, sla_deadline, acknowledged_at)
       VALUES ($1, 'harassment', now() + interval '10 days', now()) RETURNING id`,
      [questionId],
    );
    await pool.query(`UPDATE grievance_report SET merged_into_report_id = $2 WHERE id = $1`, [
      id,
      parent.rows[0]!.id,
    ]);
  }
  return id;
}

async function auditActions(reportId: string): Promise<string[]> {
  const { rows } = await pool.query<{ action: string }>(
    `SELECT action FROM grievance_audit_log WHERE grievance_report_id = $1 ORDER BY action`,
    [reportId],
  );
  return rows.map((r) => r.action);
}

beforeEach(async () => {
  await truncateAll();
  await clearNotices();
  const { signIn } = await import("../helpers/auth.js");
  reporter = await signIn(app, "t38.reporter.24@nitj.ac.in");
  const author = await signIn(app, "t38.author.23@nitj.ac.in");
  const topic = await pool.query<{ id: string }>(`SELECT id FROM topic_tag WHERE slug='advice'`);
  const q = await pool.query<{ id: string }>(
    `INSERT INTO question (author_profile_id, topic_tag_id, title, body, idempotency_key,
                           moderation_status, published_at)
     VALUES ($1, $2, 'a title', 'a body', gen_random_uuid(), 'published', now()) RETURNING id`,
    [author.profile.id, topic.rows[0]!.id],
  );
  questionId = q.rows[0]!.id;
});

afterAll(async () => {
  await closeDb();
});

describe("with nobody to notify", () => {
  it("sends nothing, records nothing, and leaves the alert due", async () => {
    // No grievance_officer_contact row and no GRIEVANCE_ALERT_EMAIL — the state the product is
    // in until T42 loads the real officer.
    const id = await ticket({ reason: "impersonation", deadlineMs: -1 * HOUR });

    const first = await runPass();
    expect(first.breachAlerted).toBe(0);
    expect(first.undeliverable).toBe(1);
    expect(await notices()).toHaveLength(0);
    // The critical half: nothing was written claiming an alert went out.
    expect(await auditActions(id)).toEqual([]);

    // And it is still due, rather than having been quietly consumed.
    await publishOfficer();
    const second = await runPass();
    expect(second.breachAlerted).toBe(1);
    expect(await auditActions(id)).toEqual(["sla_breach_alert_sent"]);
  });
});

describe("a deadline that has passed", () => {
  beforeEach(() => publishOfficer());

  it("alerts once, and never again for the same ticket", async () => {
    const id = await ticket({ reason: "impersonation", deadlineMs: -2 * HOUR });

    expect((await runPass()).breachAlerted).toBe(1);
    expect((await notices())[0]!.to).toBe(OFFICER);

    // An alert that repeats every five minutes is an alert that gets filtered.
    await clearNotices();
    expect((await runPass()).breachAlerted).toBe(0);
    expect(await notices()).toHaveLength(0);
    expect(await auditActions(id)).toEqual(["sla_breach_alert_sent"]);
  });

  it("keeps counting the breach on every pass, even after the one email", async () => {
    await ticket({ reason: "impersonation", deadlineMs: -2 * HOUR });
    expect((await runPass()).overdueOpen).toBe(1);
    // The email fires once; the number is what stops an unresolved breach going quiet. This
    // is the signal T71's alerting rules watch.
    expect((await runPass()).overdueOpen).toBe(1);
  });

  it("does not also send a 'deadline approaching' warning after the fact", async () => {
    const id = await ticket({ reason: "impersonation", deadlineMs: -2 * HOUR });
    await runPass();
    await runPass();
    // A warning logged after the deadline would make the audit trail read as though the
    // officer had been warned in time.
    expect(await auditActions(id)).toEqual(["sla_breach_alert_sent"]);
  });

  it("ignores tickets that are resolved, and tickets that were merged away", async () => {
    await ticket({ reason: "impersonation", deadlineMs: -5 * HOUR, status: "resolved" });
    await ticket({ reason: "impersonation", deadlineMs: -5 * HOUR, merged: true });
    const res = await runPass();
    expect(res.breachAlerted).toBe(0);
    expect(res.overdueOpen).toBe(0);
  });
});

describe("a deadline that is approaching", () => {
  beforeEach(() => publishOfficer());

  it("warns inside the expedited window and not before it", async () => {
    // 24h budget, warn with 25% (6h) left.
    const early = await ticket({ reason: "impersonation", deadlineMs: 10 * HOUR });
    expect((await runPass()).warned).toBe(0);
    expect(await auditActions(early)).toEqual([]);

    const due = await ticket({ reason: "impersonation", deadlineMs: 5 * HOUR });
    expect((await runPass()).warned).toBe(1);
    expect(await auditActions(due)).toEqual(["sla_warning_sent"]);
  });

  it("does not warn a general ticket six hours out, because that clock is fifteen days", async () => {
    // The failure a single fixed window produces. Six hours before a 15-day deadline is
    // ninety hours too late to be a warning; here it means the warning already fired days ago.
    const general = await ticket({ reason: "harassment", deadlineMs: 20 * 24 * HOUR });
    expect((await runPass()).warned).toBe(0);
    expect(await auditActions(general)).toEqual([]);
  });

  it("warns a general ticket once it is inside its own 3¾-day window", async () => {
    const general = await ticket({ reason: "harassment", deadlineMs: 2 * 24 * HOUR });
    expect((await runPass()).warned).toBe(1);
    expect(await auditActions(general)).toEqual(["sla_warning_sent"]);
  });

  it("warns only once", async () => {
    const id = await ticket({ reason: "impersonation", deadlineMs: 5 * HOUR });
    await runPass();
    await clearNotices();
    expect((await runPass()).warned).toBe(0);
    expect(await notices()).toHaveLength(0);
    expect(await auditActions(id)).toEqual(["sla_warning_sent"]);
  });
});

describe("a ticket that was never acknowledged", () => {
  beforeEach(() => publishOfficer());

  it("is alerted immediately, whatever its age, because it is a defect", async () => {
    // Intake acknowledges inside the same write, so this state cannot arise from anyone being
    // slow — only from the write path being broken. A countdown here would be a timer that can
    // never fire, and its silence would read as compliance.
    const id = await ticket({
      reason: "harassment",
      deadlineMs: 14 * 24 * HOUR,
      acknowledged: false,
    });
    const res = await runPass();
    expect(res.unacknowledgedAlerted).toBe(1);
    expect(await auditActions(id)).toEqual(["unacknowledged_alert_sent"]);
    expect((await notices())[0]!.subject).toMatch(/never acknowledged/i);
  });

  it("leaves a normally-filed report alone", async () => {
    // Through the real endpoint, so this asserts against what A8 actually writes.
    const filed = await request(app)
      .post("/reports")
      .set(...auth(reporter))
      .send({ questionId, reason: "harassment" });
    expect(filed.status).toBe(201);
    expect((await runPass()).unacknowledgedAlerted).toBe(0);
  });
});

describe("what a notice is allowed to say", () => {
  beforeEach(() => publishOfficer());

  it("names the ticket and the category, and nothing about the people", async () => {
    const filed = await request(app)
      .post("/reports")
      .set(...auth(reporter))
      .send({ questionId, reason: "impersonation" });
    // Age it by hand — A8's own deadline is 24h out and immutable.
    const id = await ticket({ reason: "impersonation", deadlineMs: -1 * HOUR });
    await runPass();

    const body = (await notices())[0]!.body;
    expect(body).toContain(id);
    expect(body).toContain("impersonation");

    // The assertions that matter. An operator mailbox is a place things get forwarded from,
    // and this product's promise is that a post cannot be traced back to a student.
    expect(body).not.toContain(reporter.profile.id);
    expect(body).not.toContain(reporter.profile.pseudonym);
    expect(body).not.toContain("a body");
    expect(body).not.toContain("a title");
    expect(body).not.toContain(filed.body.reportId);
  });
});
