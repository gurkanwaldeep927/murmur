import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { auth, type SignedInUser } from "../helpers/auth.js";

/**
 * T51 — moderation outcome instrumentation (PRD R8: auto-vs-escalated ratio, answer
 * liquidity).
 *
 * What this pins, and why it is not obvious:
 *
 * The outcome event used to be emitted at SUBMIT time from `content.service.ts`, carrying
 * whatever the FIRST classification attempt returned. Every later decision — the retry
 * worker publishing a held item, blocking it, or escalating it — changed the item's status
 * with no event at all. Until T14b binds a real provider the default holds everything, so
 * that blind spot covered essentially every item in the product, and the ratio it fed
 * would have read "100% held" forever while items were in fact being decided.
 *
 * Emission now lives in the gateway, the one funnel every verdict passes through, plus the
 * retry job's auto-escalation pass which the gateway never sees.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

let app: import("express").Express;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;
let user: SignedInUser;
let helpers: typeof import("../helpers/analytics.js");

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  process.env.MODERATION_PROVIDER = "fixture";
  // Set before `config` is first imported — config reads env once. A small ceiling and no
  // backoff keep the retry drills fast without changing what they prove.
  process.env.MODERATION_MAX_ATTEMPTS = "3";
  process.env.MODERATION_RETRY_BACKOFF_SECONDS = "0";
  if (!process.env.DATABASE_URL) {
    throw new Error("T51 moderation-event tests require DATABASE_URL (disposable test Postgres)");
  }
  const db = await import("../helpers/test-db.js");
  ({ truncateAll, closeDb, pool } = db);
  helpers = await import("../helpers/analytics.js");
  const { createApp } = await import("../../server/src/app.js");
  await db.migrateTestDb();
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  const { signIn } = await import("../helpers/auth.js");
  user = await signIn(app, "t51.moderation.24@nitj.ac.in");
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

async function answer(questionId: string, text: string) {
  return request(app)
    .post(`/questions/${questionId}/answers`)
    .set(...auth(user))
    .send({ body: text, idempotencyKey: key() });
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

describe("T51 — one moderation outcome event per verdict, on every path", () => {
  it("test_R8_a_published_question_emits_exactly_one_auto_passed_outcome", async () => {
    const res = await ask("[[moderation:pass]] clean question");
    expect(res.status).toBe(201);

    // "Exactly one" is the assertion that matters: the submit-time emitter and the
    // gateway emitter both existing would double-count every item in the ratio.
    const rows = await helpers.expectExactlyEvents(pool, "moderation.outcome", 1);

    expect(rows[0]!.metadata).toMatchObject({
      contentType: "question",
      contentId: res.body.id,
      outcome: "auto_passed",
      attempt: 1,
    });
    // Outcomes are facts about content, not about people — attaching an actor would build
    // a permanent per-student moderation history in an append-only table (PRV-1).
    expect(rows[0]!.actor_profile_id).toBeNull();
  });

  it("test_R8_a_blocked_question_is_reported_as_auto_blocked", async () => {
    const res = await ask("[[moderation:block]] not ok");
    const rows = await helpers.expectExactlyEvents(pool, "moderation.outcome", 1);
    expect(rows[0]!.metadata).toMatchObject({ contentId: res.body.id, outcome: "auto_blocked" });
  });

  it("test_R8_an_escalated_question_is_distinct_from_a_provider_outage", async () => {
    // The ratio has to tell "a human should look at this" apart from "the provider did
    // not answer". Both hold the item; only one of them is a decision.
    await ask("[[moderation:escalate]] ambiguous");
    const escalated = await helpers.expectExactlyEvents(pool, "moderation.outcome", 1);
    expect(escalated[0]!.metadata).toMatchObject({ outcome: "escalated" });

    await truncateAll();
    user = await (await import("../helpers/auth.js")).signIn(app, "t51.moderation.24@nitj.ac.in");
    await withUnavailableProvider(async () => {
      await ask("provider is down for this one");
    });
    const held = await helpers.expectExactlyEvents(pool, "moderation.outcome", 1);
    expect(held[0]!.metadata).toMatchObject({ outcome: "held_unavailable" });
  });

  it("test_R8_an_answer_outcome_carries_its_parent_question_id", async () => {
    // Answer liquidity is "question asked → answer published". Without questionId on the
    // publish event, that interval cannot be computed from the event stream alone.
    const q = await ask("[[moderation:pass]] parent question");
    const a = await answer(q.body.id, "[[moderation:pass]] a useful answer");
    expect(a.status).toBe(201);

    const rows = await helpers.waitForEvents(pool, "moderation.outcome", 2);
    const answerOutcome = rows.find((r) => r.metadata?.contentType === "answer");
    expect(answerOutcome?.metadata).toMatchObject({
      contentId: a.body.id,
      questionId: q.body.id,
      outcome: "auto_passed",
    });
  });

  it("test_R8_answer_liquidity_is_computable_from_events_alone", async () => {
    const q = await ask("[[moderation:pass]] when do placements start");
    const a = await answer(q.body.id, "[[moderation:pass]] third sem");

    await helpers.waitForEvents(pool, "moderation.outcome", 2);
    await helpers.waitForEvents(pool, "content.question_submitted", 1);

    // The shape T46 (M6) will run. It touches no content table — that is the point of the
    // NFR "every metric computable from captured events".
    const { rows } = await pool.query<{ answer_id: string; seconds: number }>(
      `SELECT pub.metadata ->> 'contentId' AS answer_id,
              EXTRACT(EPOCH FROM (pub.occurred_at - askd.occurred_at)) AS seconds
         FROM analytics_event pub
         JOIN analytics_event askd
           ON askd.event_type = 'content.question_submitted'
          AND askd.metadata ->> 'questionId' = pub.metadata ->> 'questionId'
        WHERE pub.event_type = 'moderation.outcome'
          AND pub.metadata ->> 'contentType' = 'answer'
          AND pub.metadata ->> 'outcome' = 'auto_passed'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.answer_id).toBe(a.body.id);
    expect(Number(rows[0]!.seconds)).toBeGreaterThanOrEqual(0);
  });

  it("test_R8_a_held_item_published_by_the_retry_worker_is_reported", async () => {
    // The blind spot this task exists to close: before T51 this second decision produced
    // no event whatsoever, and with no provider bound it is the ONLY way anything is ever
    // decided.
    let questionId = "";
    await withUnavailableProvider(async () => {
      const res = await ask("held first, then published");
      expect(res.body.moderationStatus).toBe("pending");
      questionId = res.body.id;
    });

    const first = await helpers.waitForEvents(pool, "moderation.outcome", 1);
    expect(first[0]!.metadata).toMatchObject({ outcome: "held_unavailable", attempt: 1 });

    // Provider recovers; the worker's retry pass decides the item.
    const { runModerationRetryPass } = await import(
      "../../server/src/modules/moderation/moderation-retry.job.js"
    );
    await runModerationRetryPass();

    const rows = await helpers.waitForEvents(pool, "moderation.outcome", 2);
    const published = rows.find((r) => r.metadata?.outcome === "auto_passed");
    expect(published?.metadata).toMatchObject({ contentId: questionId, attempt: 2 });
  });

  it("test_R8_the_workers_auto_escalation_pass_is_reported", async () => {
    // The retry job's first pass escalates cases already past the ceiling. It is a safety
    // net the gateway never runs through, so it needs its own emitter — and a case that
    // reaches the human queue without an event is invisible to the ratio.
    let questionId = "";
    await withUnavailableProvider(async () => {
      const res = await ask("this one exhausts its budget");
      questionId = res.body.id;
    });
    await helpers.waitForEvents(pool, "moderation.outcome", 1);

    // Drive the case to the ceiling directly. Walking it there through repeated passes
    // would test the gateway's exhaustion path (already covered), not this one.
    await pool.query(
      `UPDATE moderation_case
          SET provider_raw_response =
                COALESCE(provider_raw_response, '{}'::jsonb)
                || jsonb_build_object('_gateway',
                     COALESCE(provider_raw_response -> '_gateway', '{}'::jsonb)
                     || jsonb_build_object('attempts', 3))
        WHERE question_id = $1`,
      [questionId],
    );

    const { runModerationRetryPass } = await import(
      "../../server/src/modules/moderation/moderation-retry.job.js"
    );
    const result = await runModerationRetryPass();
    expect(result.escalated).toBe(1);

    const rows = await helpers.waitForEvents(pool, "moderation.outcome", 2);
    const escalated = rows.find((r) => r.metadata?.outcome === "escalated");
    expect(escalated?.metadata).toMatchObject({
      contentType: "question",
      contentId: questionId,
      attempt: 3,
    });
  });
});
