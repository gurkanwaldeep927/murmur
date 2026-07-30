import type { DbClient, Queryable } from "../../db/pool.js";
import type { ModerationStatus } from "../moderation/moderation.types.js";

/**
 * Q&A Content persistence (T15/T16/T17) — owns `question`, `answer`, and reads
 * `topic_tag`. Every row this module returns to a caller carries the author's PSEUDONYM
 * and year badge and never an `identity_account` reference (NFR identity non-disclosure,
 * PRD R2 AC1).
 */

export interface TopicTag {
  id: string;
  slug: string;
  label: string;
}

export interface AuthorView {
  pseudonym: string;
  year_badge: string;
  reputation_score: number;
}

export interface QuestionRow {
  id: string;
  title: string;
  body: string;
  topic_slug: string;
  topic_label: string;
  moderation_status: ModerationStatus;
  published_at: Date | null;
  answer_count: number;
  created_at: Date;
  author: AuthorView;
}

export interface AnswerRow {
  id: string;
  question_id: string;
  body: string;
  moderation_status: ModerationStatus;
  accepted: boolean;
  vote_count: number;
  created_at: Date;
  author: AuthorView;
}

// The author projection every content read shares. Written once so no query can
// accidentally select an identity column into a response.
const AUTHOR_SELECT = `
  jsonb_build_object(
    'pseudonym',        p.pseudonym,
    'year_badge',       p.year_badge,
    'reputation_score', p.reputation_score
  ) AS author`;

export async function findActiveTopicBySlug(
  client: Queryable,
  slug: string,
): Promise<TopicTag | null> {
  const { rows } = await client.query<TopicTag>(
    `SELECT id, slug, label FROM topic_tag WHERE slug = $1 AND is_active = true`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function listActiveTopics(client: Queryable): Promise<TopicTag[]> {
  const { rows } = await client.query<TopicTag>(
    `SELECT id, slug, label FROM topic_tag WHERE is_active = true ORDER BY label`,
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export async function insertQuestion(
  client: DbClient,
  input: {
    authorProfileId: string;
    topicTagId: string;
    title: string;
    body: string;
    idempotencyKey: string;
  },
): Promise<{ id: string }> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO question (author_profile_id, topic_tag_id, title, body, idempotency_key)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.authorProfileId, input.topicTagId, input.title, input.body, input.idempotencyKey],
  );
  return rows[0]!;
}

export async function findQuestionByIdempotencyKey(
  client: Queryable,
  key: string,
): Promise<{ id: string; author_profile_id: string } | null> {
  const { rows } = await client.query<{ id: string; author_profile_id: string }>(
    `SELECT id, author_profile_id FROM question WHERE idempotency_key = $1`,
    [key],
  );
  return rows[0] ?? null;
}

/**
 * Read one question. `viewerProfileId` widens visibility to the author's own pending or
 * blocked item — S6 must be able to show a submitter their held post (the "queued →
 * pending → published" chain, UX F9/RR-5); everyone else sees published only.
 */
export async function findQuestionById(
  client: Queryable,
  questionId: string,
  viewerProfileId: string | null,
): Promise<QuestionRow | null> {
  const { rows } = await client.query<QuestionRow>(
    `SELECT q.id, q.title, q.body, t.slug AS topic_slug, t.label AS topic_label,
            q.moderation_status, q.published_at, q.answer_count, q.created_at,
            ${AUTHOR_SELECT}
       FROM question q
       JOIN topic_tag t ON t.id = q.topic_tag_id
       JOIN pseudonymous_profile p ON p.id = q.author_profile_id
      WHERE q.id = $1
        AND q.deleted_at IS NULL
        AND (q.moderation_status = 'published' OR q.author_profile_id = $2)`,
    [questionId, viewerProfileId],
  );
  return rows[0] ?? null;
}

/** Existence check for A4's parent: only a PUBLISHED question can be answered. */
export async function findPublishedQuestionId(
  client: Queryable,
  questionId: string,
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM question
      WHERE id = $1 AND deleted_at IS NULL AND moderation_status = 'published'`,
    [questionId],
  );
  return rows[0]?.id ?? null;
}

/**
 * A5 browse mode (T17): the recent-published feed behind S5. Published-only, newest
 * first, keyset-paginated on `published_at` so the feed stays stable as items publish.
 */
export async function listPublishedQuestions(
  client: Queryable,
  opts: { topicSlug?: string; before?: Date; limit: number },
): Promise<QuestionRow[]> {
  const { rows } = await client.query<QuestionRow>(
    `SELECT q.id, q.title, q.body, t.slug AS topic_slug, t.label AS topic_label,
            q.moderation_status, q.published_at, q.answer_count, q.created_at,
            ${AUTHOR_SELECT}
       FROM question q
       JOIN topic_tag t ON t.id = q.topic_tag_id
       JOIN pseudonymous_profile p ON p.id = q.author_profile_id
      WHERE q.moderation_status = 'published'
        AND q.deleted_at IS NULL
        AND ($1::text IS NULL OR t.slug = $1)
        AND ($2::timestamptz IS NULL OR q.published_at < $2)
      ORDER BY q.published_at DESC, q.id DESC
      LIMIT $3`,
    [opts.topicSlug ?? null, opts.before ?? null, opts.limit],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export async function insertAnswer(
  client: DbClient,
  input: {
    questionId: string;
    authorProfileId: string;
    body: string;
    idempotencyKey: string;
  },
): Promise<{ id: string }> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO answer (question_id, author_profile_id, body, idempotency_key)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.questionId, input.authorProfileId, input.body, input.idempotencyKey],
  );
  return rows[0]!;
}

export async function findAnswerByIdempotencyKey(
  client: Queryable,
  key: string,
): Promise<{ id: string; author_profile_id: string } | null> {
  const { rows } = await client.query<{ id: string; author_profile_id: string }>(
    `SELECT id, author_profile_id FROM answer WHERE idempotency_key = $1`,
    [key],
  );
  return rows[0] ?? null;
}

export async function findAnswerById(
  client: Queryable,
  answerId: string,
  viewerProfileId: string | null,
): Promise<AnswerRow | null> {
  const { rows } = await client.query<AnswerRow>(
    `SELECT a.id, a.question_id, a.body, a.moderation_status, a.accepted, a.vote_count,
            a.created_at, ${AUTHOR_SELECT}
       FROM answer a
       JOIN pseudonymous_profile p ON p.id = a.author_profile_id
      WHERE a.id = $1
        AND a.deleted_at IS NULL
        AND (a.moderation_status = 'published' OR a.author_profile_id = $2)`,
    [answerId, viewerProfileId],
  );
  return rows[0] ?? null;
}

/** The thread under a question (S7). Published answers, plus the viewer's own held ones. */
export async function listAnswersForQuestion(
  client: Queryable,
  questionId: string,
  viewerProfileId: string | null,
): Promise<AnswerRow[]> {
  const { rows } = await client.query<AnswerRow>(
    `SELECT a.id, a.question_id, a.body, a.moderation_status, a.accepted, a.vote_count,
            a.created_at, ${AUTHOR_SELECT}
       FROM answer a
       JOIN pseudonymous_profile p ON p.id = a.author_profile_id
      WHERE a.question_id = $1
        AND a.deleted_at IS NULL
        AND (a.moderation_status = 'published' OR a.author_profile_id = $2)
      ORDER BY a.accepted DESC, a.vote_count DESC, a.created_at ASC`,
    [questionId, viewerProfileId],
  );
  return rows;
}
