import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SignedInUser } from "../helpers/auth.js";

/**
 * T33 — migration 005: the complaint ticket, its audit trail, and the published officer.
 *
 * These go at the database directly. The endpoints that will use these tables (A8 intake at
 * T34, A9 resolve at T35) do not exist yet, and the properties being pinned here are ones the
 * schema is supposed to guarantee regardless of which endpoint writes the row — most of all
 * the breach flag, which is legally significant and must not be something code can forget to
 * set or quietly unset.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

let app: import("express").Express;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;

let reporter: SignedInUser;
let questionId: string;
let answerId: string;

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  process.env.MODERATION_PROVIDER = "fixture";
  if (!process.env.DATABASE_URL) {
    throw new Error("T33 grievance-schema tests require DATABASE_URL (disposable test Postgres)");
  }
  const db = await import("../helpers/test-db.js");
  ({ truncateAll, closeDb, pool } = db);
  const { createApp } = await import("../../server/src/app.js");
  await db.migrateTestDb();
  app = createApp();
});

async function seed(): Promise<void> {
  const { signIn } = await import("../helpers/auth.js");
  reporter = await signIn(app, "t33.reporter.24@nitj.ac.in");
  const author = await signIn(app, "t33.author.23@nitj.ac.in");

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
}

/**
 * A report on the seeded question, `hours` from now as its deadline.
 *
 * The reasons below read `'harassment'` rather than the free text this file first used: T34's
 * migration 010 pinned `reason` to a closed vocabulary, because the resolution SLA is
 * segmented by category and the frozen schema has no category column, so the reason IS the
 * category (decisions/a8-report-intake-slas.md §1). Fixtures updated rather than the
 * constraint loosened — an arbitrary reason is exactly what the constraint exists to refuse.
 */
async function report(
  hours: number,
  extra: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO grievance_report (question_id, reason, reporter_profile_id, sla_deadline,
                                   is_anonymous, resolved_at)
     VALUES ($1, 'harassment', $2, now() + ($3 || ' hours')::interval, $4, $5)
     RETURNING id`,
    [
      questionId,
      // `??` would be wrong here: passing an explicit null (an anonymous report) must mean
      // "no reporter", not "fall back to the default". CI caught exactly that.
      "reporter" in extra ? (extra.reporter as string | null) : reporter.profile.id,
      String(hours),
      extra.isAnonymous ?? false,
      extra.resolvedAt ?? null,
    ],
  );
  return rows[0]!;
}

beforeEach(async () => {
  await truncateAll();
  await seed();
});

afterAll(async () => {
  await closeDb();
});

describe("grievance_report", () => {
  it("requires exactly one target — never both, never neither", async () => {
    const both = pool.query(
      `INSERT INTO grievance_report (question_id, answer_id, reason, sla_deadline)
       VALUES ($1, $2, 'harassment', now())`,
      [questionId, answerId],
    );
    await expect(both).rejects.toMatchObject({
      constraint: "chk_grievance_report_one_target",
    });

    const neither = pool.query(
      `INSERT INTO grievance_report (reason, sla_deadline) VALUES ('harassment', now())`,
    );
    await expect(neither).rejects.toMatchObject({
      constraint: "chk_grievance_report_one_target",
    });
  });

  it("insists on a deadline — a ticket with no clock is not a tracked ticket", async () => {
    await expect(
      pool.query(`INSERT INTO grievance_report (question_id, reason) VALUES ($1, 'r')`, [
        questionId,
      ]),
    ).rejects.toMatchObject({ code: "23502" }); // not_null_violation
  });

  it("opens as 'open' and unbreached", async () => {
    const { id } = await report(24);
    const { rows } = await pool.query<{ status: string; sla_breached: boolean }>(
      `SELECT status, sla_breached FROM grievance_report WHERE id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({ status: "open", sla_breached: false });
  });
});

describe("the breach flag is computed, not set", () => {
  it("stays false while the report is unresolved, even long past its deadline", async () => {
    // An overdue report is unfinished, not breached. The breach is a fact about when it was
    // actually resolved — which is why the column reads resolved_at, not now().
    const { id } = await report(-500);
    const { rows } = await pool.query<{ sla_breached: boolean }>(
      `SELECT sla_breached FROM grievance_report WHERE id = $1`,
      [id],
    );
    expect(rows[0]!.sla_breached).toBe(false);
  });

  it("turns true the moment a resolution lands after the deadline", async () => {
    const { id } = await report(-1);
    await pool.query(
      `UPDATE grievance_report SET status='resolved', resolution_action='takedown',
                                   resolved_at = now() WHERE id = $1`,
      [id],
    );
    const { rows } = await pool.query<{ sla_breached: boolean }>(
      `SELECT sla_breached FROM grievance_report WHERE id = $1`,
      [id],
    );
    expect(rows[0]!.sla_breached).toBe(true);
  });

  it("stays false when the resolution beats the deadline", async () => {
    const { id } = await report(48);
    await pool.query(
      `UPDATE grievance_report SET status='resolved', resolution_action='dismiss',
                                   resolved_at = now() WHERE id = $1`,
      [id],
    );
    const { rows } = await pool.query<{ sla_breached: boolean }>(
      `SELECT sla_breached FROM grievance_report WHERE id = $1`,
      [id],
    );
    expect(rows[0]!.sla_breached).toBe(false);
  });

  it("cannot be written to directly", async () => {
    // The point of the generated column: no operator action, and no future bug, can mark a
    // late takedown as on time. Postgres refuses the write outright.
    const { id } = await report(-1, { resolvedAt: "now()" });
    await expect(
      pool.query(`UPDATE grievance_report SET sla_breached = false WHERE id = $1`, [id]),
      // Postgres's wording for a generated column, verbatim rather than paraphrased —
      // matching /generated/ passed nothing, because the message does not contain the word.
    ).rejects.toThrow(/can only be updated to DEFAULT/i);
  });
});

describe("anonymity is a property of the row, not of the screen", () => {
  it("stores an anonymous report with no reporter at all", async () => {
    const { id } = await report(24, { isAnonymous: true, reporter: null });
    const { rows } = await pool.query<{ is_anonymous: boolean; reporter_profile_id: null }>(
      `SELECT is_anonymous, reporter_profile_id FROM grievance_report WHERE id = $1`,
      [id],
    );
    // Keeping a profile id alongside is_anonymous = true would make the anonymity a UI
    // convention that any later query could undo.
    expect(rows[0]).toEqual({ is_anonymous: true, reporter_profile_id: null });
  });
});

describe("duplicate handling", () => {
  it("refuses a replayed idempotency key", async () => {
    const key = "11111111-1111-4111-8111-111111111111";
    const insert = () =>
      pool.query(
        `INSERT INTO grievance_report (question_id, reason, sla_deadline, idempotency_key)
         VALUES ($1, 'harassment', now(), $2)`,
        [questionId, key],
      );
    await insert();
    await expect(insert()).rejects.toMatchObject({ code: "23505" });
  });

  it("lets one report be merged into another", async () => {
    const first = await report(24);
    const second = await report(24);
    await pool.query(`UPDATE grievance_report SET merged_into_report_id = $2 WHERE id = $1`, [
      second.id,
      first.id,
    ]);
    const { rows } = await pool.query<{ merged_into_report_id: string }>(
      `SELECT merged_into_report_id FROM grievance_report WHERE id = $1`,
      [second.id],
    );
    expect(rows[0]!.merged_into_report_id).toBe(first.id);
  });
});

describe("grievance_audit_log", () => {
  it("accepts the three actor kinds and refuses anything else", async () => {
    const { id } = await report(24);
    for (const actor of ["reporter", "operator", "system"]) {
      await pool.query(
        `INSERT INTO grievance_audit_log (grievance_report_id, actor_type, action)
         VALUES ($1, $2, 'noted')`,
        [id, actor],
      );
    }
    await expect(
      pool.query(
        `INSERT INTO grievance_audit_log (grievance_report_id, actor_type, action)
         VALUES ($1, 'admin', 'noted')`,
        [id],
      ),
    ).rejects.toMatchObject({ code: "23514" }); // check_violation

    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM grievance_audit_log WHERE grievance_report_id = $1`,
      [id],
    );
    expect(rows[0]!.n).toBe("3");
  });

  it("refuses an entry with no ticket to attach to", async () => {
    await expect(
      pool.query(
        `INSERT INTO grievance_audit_log (grievance_report_id, actor_type, action)
         VALUES ('00000000-0000-4000-8000-000000000001', 'system', 'orphan')`,
      ),
    ).rejects.toMatchObject({ code: "23503" }); // foreign_key_violation
  });
});

describe("storage hardening carried by migration 005 (SEC-003)", () => {
  it("has row-level security on all three tables", async () => {
    // Migration 008 already ran on the live database and will never see these, so if 005's
    // own hardening block is dropped as redundant the complaints table — reporters' words
    // about other students — loses its second lock.
    const { rows } = await pool.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class
        WHERE relname IN ('grievance_report','grievance_audit_log','grievance_officer_contact')
          AND relkind = 'r' ORDER BY relname`,
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });
});
