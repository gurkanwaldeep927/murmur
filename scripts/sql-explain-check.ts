/**
 * Read-only SQL validation for T14a/T15/T16/T17.  `npm run sql:check`
 *
 * Runs EXPLAIN (plan only, never ANALYZE) on every raw statement those tasks introduced,
 * inside a transaction that is always ROLLBACKed. EXPLAIN without ANALYZE does not
 * execute the statement, so no row is read, written, or locked — it is safe against a
 * database holding real data.
 *
 * **Why this exists.** It is a stopgap, not a substitute for the test suites. The project
 * currently has no disposable Postgres (no Docker, no local server, no git remote and so
 * no CI), and the only configured database holds real data that must never be truncated.
 * That leaves the integration/NFR suites unrunnable and this file's ~24 statements
 * verified by nothing but `tsc`, which cannot see a wrong column name, a bad jsonb
 * operator, or a parameter Postgres can't type-infer. EXPLAIN catches exactly that class.
 *
 * Delete this once a disposable test database exists and the real suites run — the guard
 * in tests/helpers/test-db.ts describes what "disposable" has to mean.
 *
 * Note: Supabase's direct `db.<ref>.supabase.co` host is IPv6-only. On an IPv4-only
 * network use the pooler host from the Supabase dashboard instead.
 */
import "dotenv/config";
import pg from "pg";

const UUID = "00000000-0000-4000-8000-000000000001";
const JSONB = JSON.stringify({ _gateway: { attempts: 0 } });

type Case = { name: string; sql: string; values: unknown[] };

const cases: Case[] = [
  // ---- moderation.repo.ts ----
  {
    name: "openCase (question)",
    sql: `INSERT INTO moderation_case (question_id, decision, provider_raw_response)
          VALUES ($1, 'pending', $2::jsonb) RETURNING id`,
    values: [UUID, JSONB],
  },
  {
    name: "openCase (answer)",
    sql: `INSERT INTO moderation_case (answer_id, decision, provider_raw_response)
          VALUES ($1, 'pending', $2::jsonb) RETURNING id`,
    values: [UUID, JSONB],
  },
  {
    name: "recordVerdict",
    sql: `UPDATE moderation_case
             SET risk_tier = $2, risk_score = $3, ai_classification_label = $4,
                 external_provider_case_ref = $5, provider_raw_response = $6::jsonb,
                 decision = $7::moderation_status_enum,
                 decided_by = CASE WHEN $7::moderation_status_enum = 'pending'
                                   THEN NULL ELSE 'ai'::moderation_decided_by_enum END,
                 decided_at = CASE WHEN $7::moderation_status_enum = 'pending'
                                   THEN NULL ELSE now() END
           WHERE id = $1 AND decision = 'pending'`,
    values: [UUID, "auto_pass", 0.1, "label", "ref", JSONB, "published"],
  },
  {
    name: "recordFailedAttempt",
    sql: `UPDATE moderation_case
             SET provider_raw_response = $2::jsonb,
                 ai_classification_label = 'provider_unavailable'
           WHERE id = $1 AND decision = 'pending'`,
    values: [UUID, JSONB],
  },
  {
    name: "escalateToHuman",
    sql: `UPDATE moderation_case SET risk_tier = 'escalate'
           WHERE id = $1 AND decision = 'pending'`,
    values: [UUID],
  },
  {
    name: "findCaseById",
    sql: `SELECT id, question_id, answer_id, risk_tier, decision, ai_classification_label,
                 provider_raw_response, created_at, updated_at
            FROM moderation_case WHERE id = $1`,
    values: [UUID],
  },
  {
    name: "claimRetryableCases",
    sql: `WITH due AS (
            SELECT mc.id FROM moderation_case mc
             WHERE mc.decision = 'pending' AND mc.risk_tier IS NULL
               AND COALESCE((mc.provider_raw_response -> '_gateway' ->> 'attempts')::int, 0) < $1
               AND ( mc.provider_raw_response -> '_gateway' ->> 'lastAttemptAt' IS NULL
                     OR (mc.provider_raw_response -> '_gateway' ->> 'lastAttemptAt')::timestamptz
                          < now() - make_interval(secs => $2) )
             ORDER BY mc.created_at LIMIT $3 FOR UPDATE SKIP LOCKED )
          SELECT mc.id, mc.question_id, mc.answer_id,
                 COALESCE((mc.provider_raw_response -> '_gateway' ->> 'attempts')::int, 0) AS attempts,
                 COALESCE(q.title || ' ' || q.body, a.body) AS text,
                 CASE WHEN mc.question_id IS NOT NULL THEN 'question' ELSE 'answer' END AS content_type
            FROM moderation_case mc
            JOIN due ON due.id = mc.id
            LEFT JOIN question q ON q.id = mc.question_id
            LEFT JOIN answer a ON a.id = mc.answer_id`,
    values: [5, 30, 50],
  },
  {
    name: "claimExhaustedCases",
    sql: `SELECT id FROM moderation_case
           WHERE decision = 'pending' AND risk_tier IS NULL
             AND COALESCE((provider_raw_response -> '_gateway' ->> 'attempts')::int, 0) >= $1
           ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED`,
    values: [5, 50],
  },
  // ---- moderation.gateway.ts ----
  {
    name: "publish/block question",
    sql: `UPDATE question
             SET moderation_status = $2::moderation_status_enum,
                 published_at = CASE WHEN $2::moderation_status_enum = 'published'
                                     THEN now() ELSE published_at END
           WHERE id = $1 AND moderation_status = 'pending'`,
    values: [UUID, "published"],
  },
  {
    name: "publish/block answer",
    sql: `UPDATE answer SET moderation_status = $2
           WHERE id = $1 AND moderation_status = 'pending'`,
    values: [UUID, "published"],
  },
  {
    name: "increment answer_count",
    sql: `UPDATE question q SET answer_count = answer_count + 1
            FROM answer a WHERE a.id = $1 AND q.id = a.question_id`,
    values: [UUID],
  },
  // ---- content.repo.ts ----
  {
    name: "findActiveTopicBySlug",
    sql: `SELECT id, slug, label FROM topic_tag WHERE slug = $1 AND is_active = true`,
    values: ["placements"],
  },
  {
    name: "listActiveTopics",
    sql: `SELECT id, slug, label FROM topic_tag WHERE is_active = true ORDER BY label`,
    values: [],
  },
  {
    name: "insertQuestion",
    sql: `INSERT INTO question (author_profile_id, topic_tag_id, title, body, idempotency_key)
          VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    values: [UUID, UUID, "t", "b", UUID],
  },
  {
    name: "findQuestionByIdempotencyKey",
    sql: `SELECT id, author_profile_id FROM question WHERE idempotency_key = $1`,
    values: [UUID],
  },
  {
    name: "findQuestionById",
    sql: `SELECT q.id, q.title, q.body, t.slug AS topic_slug, t.label AS topic_label,
                 q.moderation_status, q.published_at, q.answer_count, q.created_at,
                 jsonb_build_object('pseudonym', p.pseudonym, 'year_badge', p.year_badge,
                                    'reputation_score', p.reputation_score) AS author
            FROM question q
            JOIN topic_tag t ON t.id = q.topic_tag_id
            JOIN pseudonymous_profile p ON p.id = q.author_profile_id
           WHERE q.id = $1 AND q.deleted_at IS NULL
             AND (q.moderation_status = 'published' OR q.author_profile_id = $2)`,
    values: [UUID, UUID],
  },
  {
    name: "findPublishedQuestionId",
    sql: `SELECT id FROM question
           WHERE id = $1 AND deleted_at IS NULL AND moderation_status = 'published'`,
    values: [UUID],
  },
  {
    name: "listPublishedQuestions",
    sql: `SELECT q.id, q.title, q.body, t.slug AS topic_slug, t.label AS topic_label,
                 q.moderation_status, q.published_at, q.answer_count, q.created_at,
                 jsonb_build_object('pseudonym', p.pseudonym, 'year_badge', p.year_badge,
                                    'reputation_score', p.reputation_score) AS author
            FROM question q
            JOIN topic_tag t ON t.id = q.topic_tag_id
            JOIN pseudonymous_profile p ON p.id = q.author_profile_id
           WHERE q.moderation_status = 'published' AND q.deleted_at IS NULL
             AND ($1::text IS NULL OR t.slug = $1)
             AND ($2::timestamptz IS NULL OR q.published_at < $2)
           ORDER BY q.published_at DESC, q.id DESC LIMIT $3`,
    values: [null, null, 21],
  },
  {
    name: "insertAnswer",
    sql: `INSERT INTO answer (question_id, author_profile_id, body, idempotency_key)
          VALUES ($1, $2, $3, $4) RETURNING id`,
    values: [UUID, UUID, "b", UUID],
  },
  {
    name: "findAnswerByIdempotencyKey",
    sql: `SELECT id, author_profile_id FROM answer WHERE idempotency_key = $1`,
    values: [UUID],
  },
  {
    name: "findAnswerById",
    sql: `SELECT a.id, a.question_id, a.body, a.moderation_status, a.accepted, a.vote_count,
                 a.created_at,
                 jsonb_build_object('pseudonym', p.pseudonym, 'year_badge', p.year_badge,
                                    'reputation_score', p.reputation_score) AS author
            FROM answer a
            JOIN pseudonymous_profile p ON p.id = a.author_profile_id
           WHERE a.id = $1 AND a.deleted_at IS NULL
             AND (a.moderation_status = 'published' OR a.author_profile_id = $2)`,
    values: [UUID, UUID],
  },
  {
    name: "listAnswersForQuestion",
    sql: `SELECT a.id, a.question_id, a.body, a.moderation_status, a.accepted, a.vote_count,
                 a.created_at,
                 jsonb_build_object('pseudonym', p.pseudonym, 'year_badge', p.year_badge,
                                    'reputation_score', p.reputation_score) AS author
            FROM answer a
            JOIN pseudonymous_profile p ON p.id = a.author_profile_id
           WHERE a.question_id = $1 AND a.deleted_at IS NULL
             AND (a.moderation_status = 'published' OR a.author_profile_id = $2)
           ORDER BY a.accepted DESC, a.vote_count DESC, a.created_at ASC`,
    values: [UUID, UUID],
  },
  // ---- T56 NFR reconciliation queries ----
  {
    name: "T56 reconciliation (published == cleared)",
    sql: `SELECT
            (SELECT count(*) FROM question WHERE moderation_status = 'published') AS published,
            (SELECT count(*) FROM moderation_case mc
               JOIN question q ON q.id = mc.question_id
              WHERE mc.decision = 'published' AND mc.decided_by IS NOT NULL
                AND mc.decided_at IS NOT NULL AND q.moderation_status = 'published') AS cleared`,
    values: [],
  },
  {
    name: "T56 orphan check",
    sql: `SELECT count(*) AS orphans FROM question q
            LEFT JOIN moderation_case mc ON mc.question_id = q.id
           WHERE mc.id IS NULL`,
    values: [],
  },
  {
    name: "T56 published-without-cleared-case check",
    sql: `SELECT count(*) AS bad FROM question q
           WHERE q.moderation_status = 'published'
             AND NOT EXISTS (SELECT 1 FROM moderation_case mc
                              WHERE mc.question_id = q.id AND mc.decision = 'published')`,
    values: [],
  },
];

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query("SELECT current_database() AS db");
  console.log(`EXPLAIN-only validation against "${rows[0].db}" (no statement is executed)\n`);

  await client.query("BEGIN");
  let failures = 0;
  for (const c of cases) {
    // Each statement gets its own savepoint. Without this, the first failure aborts the
    // transaction and Postgres refuses every statement after it with "current transaction
    // is aborted" — reporting one real bug as N, and hiding whatever came behind it.
    await client.query("SAVEPOINT stmt");
    try {
      await client.query({ text: `EXPLAIN ${c.sql}`, values: c.values as never[] });
      console.log(`  ok    ${c.name}`);
      await client.query("RELEASE SAVEPOINT stmt");
    } catch (err) {
      failures++;
      console.log(`  FAIL  ${c.name}\n        ${(err as Error).message}`);
      await client.query("ROLLBACK TO SAVEPOINT stmt");
    }
  }
  await client.query("ROLLBACK");
  await client.end();

  console.log(`\n${cases.length - failures}/${cases.length} statements planned cleanly`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
