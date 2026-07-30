import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { signIn, auth, type SignedInUser } from "../helpers/auth.js";

/**
 * T56 — the two moderation NFRs from docs/07-plan.md §5, authored with criterion-ID
 * naming (QK-6). Scored by test-verifier-agent, not here.
 *
 *   1. **Moderation coverage** — published-content count == cleared-case count.
 *      "0% publish-without-moderation" (TRD §7). This is R6's legal shield.
 *   2. **Moderation failure posture** — 0% of UGC auto-publishes when the provider
 *      cannot answer.
 *
 * Note on what the second one tests *now*: with the plan's fourth revision, the
 * unconfigured-provider default IS the outage path (one `ProviderUnavailableError`, one
 * handler). So the drill below is not simulating a rare condition — it is asserting the
 * posture the app actually runs in from M2 until T14b binds a vendor at M6.
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
  // Set before `config` is first imported (below) — config reads env once, so a later
  // assignment would be silently ignored. Small ceiling + no backoff keeps the
  // attempt-exhaustion drill fast without changing what it proves.
  process.env.MODERATION_MAX_ATTEMPTS = "3";
  process.env.MODERATION_RETRY_BACKOFF_SECONDS = "0";
  if (!process.env.DATABASE_URL) {
    throw new Error("moderation NFR tests require DATABASE_URL (disposable test Postgres)");
  }
  ({ migrateTestDb, truncateAll, closeDb, pool } = await import("../helpers/test-db.js"));
  const { createApp } = await import("../../server/src/app.js");
  await migrateTestDb();
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  user = await signIn(app, "t56.moderation.24@nitj.ac.in");
});

afterAll(async () => {
  await closeDb();
});

let keySeq = 0;
const key = () => `00000000-0000-4000-8000-${String(++keySeq).padStart(12, "0")}`;

async function ask(text: string, title = "Question about placements") {
  return request(app)
    .post("/questions")
    .set(...auth(user))
    .send({ topic: "placements", title, body: text, idempotencyKey: key() });
}

/** Swap the bound provider for one that never answers — the outage lever. */
async function withUnavailableProvider(fn: () => Promise<void>) {
  const { setProvidersForTest, resetProvidersForTest } = await import(
    "../../server/src/modules/moderation/providers/index.js"
  );
  const { holdAllProvider } = await import(
    "../../server/src/modules/moderation/providers/hold-all.provider.js"
  );
  setProvidersForTest(holdAllProvider, null);
  try {
    await fn();
  } finally {
    resetProvidersForTest();
  }
}

describe("NFR: moderation coverage (TRD §7 — 0% publish-without-moderation)", () => {
  it("test_R6_moderation_coverage_reconciliation_published_equals_cleared", async () => {
    await ask("[[moderation:pass]] clean one");
    await ask("[[moderation:pass]] clean two");
    await ask("[[moderation:block]] blocked one");
    await ask("[[moderation:escalate]] ambiguous one");

    // The reconciliation query itself — the same shape the nightly prod job runs.
    const { rows } = await pool.query<{ published: string; cleared: string }>(`
      SELECT
        (SELECT count(*) FROM question WHERE moderation_status = 'published') AS published,
        (SELECT count(*) FROM moderation_case mc
           JOIN question q ON q.id = mc.question_id
          WHERE mc.decision = 'published'
            AND mc.decided_by IS NOT NULL
            AND mc.decided_at IS NOT NULL
            AND q.moderation_status = 'published') AS cleared
    `);
    expect(rows[0]!.published).toBe(rows[0]!.cleared);
    expect(Number(rows[0]!.published)).toBe(2);
  });

  it("test_R6_every_content_row_has_a_moderation_case", async () => {
    await ask("[[moderation:pass]] a");
    await ask("[[moderation:escalate]] b");
    await withUnavailableProvider(async () => {
      await ask("held while provider is down");
    });

    const { rows } = await pool.query<{ orphans: string }>(`
      SELECT count(*) AS orphans
        FROM question q
        LEFT JOIN moderation_case mc ON mc.question_id = q.id
       WHERE mc.id IS NULL
    `);
    // Content and case are written in one transaction, so an orphan is not merely
    // unlikely — it should be unreachable.
    expect(Number(rows[0]!.orphans)).toBe(0);
  });

  it("test_R6_no_question_publishes_without_a_cleared_case", async () => {
    await ask("[[moderation:pass]] ok");
    await ask("[[moderation:escalate]] held");

    const { rows } = await pool.query<{ bad: string }>(`
      SELECT count(*) AS bad
        FROM question q
       WHERE q.moderation_status = 'published'
         AND NOT EXISTS (
           SELECT 1 FROM moderation_case mc
            WHERE mc.question_id = q.id AND mc.decision = 'published'
         )
    `);
    expect(Number(rows[0]!.bad)).toBe(0);
  });
});

describe("NFR: moderation failure posture (TRD §7 — 0% auto-publish during outage)", () => {
  it("test_R6_outage_drill_zero_autopublishes", async () => {
    await withUnavailableProvider(async () => {
      for (let i = 0; i < 5; i++) await ask(`outage submission ${i}`);
    });

    const { rows } = await pool.query<{ published: string; total: string }>(`
      SELECT count(*) FILTER (WHERE moderation_status = 'published') AS published,
             count(*) AS total
        FROM question
    `);
    expect(Number(rows[0]!.total)).toBe(5);
    expect(Number(rows[0]!.published)).toBe(0);
  });

  it("test_R6_outage_holds_content_pending_and_never_drops_it", async () => {
    let body: Record<string, unknown> = {};
    await withUnavailableProvider(async () => {
      const res = await ask("held, not lost");
      // 202 Accepted, not 201 Created: the client is told plainly it is not live.
      expect(res.status).toBe(202);
      expect(res.body.pendingReview).toBe(true);
      expect(res.body.moderationStatus).toBe("pending");
      body = res.body;
    });

    const { rows } = await pool.query(`SELECT moderation_status FROM question WHERE id = $1`, [
      body.id,
    ]);
    expect(rows).toHaveLength(1); // not dropped
    expect(rows[0]!.moderation_status).toBe("pending"); // not published
  });

  it("test_R6_outage_auto_escalates_to_human_queue_past_threshold", async () => {
    const { config } = await import("../../server/src/config/index.js");
    const { runModerationRetryPass } = await import(
      "../../server/src/modules/moderation/moderation-retry.job.js"
    );

    let questionId: string | undefined;
    await withUnavailableProvider(async () => {
      const res = await ask("will exhaust its attempts");
      questionId = res.body.id;

      // Walk the attempt budget (backoff is 0 in this suite — the ceiling, not the
      // clock, is what this test is about).
      for (let i = 0; i < config.moderationMaxAttempts + 1; i++) {
        await runModerationRetryPass();
      }
    });

    const { rows } = await pool.query<{ risk_tier: string | null; decision: string }>(
      `SELECT risk_tier, decision FROM moderation_case WHERE question_id = $1`,
      [questionId],
    );
    // Escalate + still pending = "a human must decide this". Never published, never
    // dropped, and now visible in the S16 queue the escalation index serves.
    expect(rows[0]!.risk_tier).toBe("escalate");
    expect(rows[0]!.decision).toBe("pending");

    const q = await pool.query(`SELECT moderation_status FROM question WHERE id = $1`, [
      questionId,
    ]);
    expect(q.rows[0]!.moderation_status).toBe("pending");
  });

  it("test_R6_held_content_is_invisible_to_other_users", async () => {
    await withUnavailableProvider(async () => {
      await ask("held content should not appear in anyone else's feed");
    });

    const other = await signIn(app, "t56.other.23@nitj.ac.in");
    const feed = await request(app)
      .get("/questions")
      .set(...auth(other));
    expect(feed.status).toBe(200);
    expect(feed.body.questions).toHaveLength(0);
    expect(feed.body.empty).toBe(true);
  });
});
