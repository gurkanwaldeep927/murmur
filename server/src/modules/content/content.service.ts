import { pool, withTransaction } from "../../db/pool.js";
import { errors } from "../../shared/error-envelope.js";
import { classifyAndApply, openCase } from "../moderation/moderation.gateway.js";
import type { ModerationStatus } from "../moderation/moderation.types.js";
import * as repo from "./content.repo.js";
import type { AnswerRow, QuestionRow } from "./content.repo.js";
import { ContentEvents } from "./content-events.js";

/**
 * Q&A Content Service — A3 create question (T15), A4 create answer (T16), A5 browse
 * (T17). TRD §6.
 *
 * The write shape is the same for both A3 and A4, and it is the shape R6 requires:
 *
 *   txn { insert content as `pending` + open its moderation case }   ← durable, invisible
 *   → classify outside the txn (never hold locks across a network call)
 *   → txn { apply verdict to case + content }
 *
 * Content therefore exists in a held state before any classification is attempted. If
 * the process dies between steps, the retry worker finds the case and finishes it; there
 * is no intermediate state in which the item is visible but unmoderated.
 */

const MAX_TITLE = 300;
const MAX_BODY = 20_000;

export interface CreatedContent {
  id: string;
  moderationStatus: ModerationStatus;
  /** True when the item is held — the client must show "pending review", not "posted". */
  held: boolean;
  /** Present only on a replayed idempotency key. */
  replayed?: true;
}

// ---------------------------------------------------------------------------
// A3 — Create Question
// ---------------------------------------------------------------------------

export async function createQuestion(input: {
  authorProfileId: string;
  topicSlug: string;
  title: string;
  body: string;
  idempotencyKey: string;
}): Promise<CreatedContent> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || title.length > MAX_TITLE) {
    throw errors.validation(`A question needs a title of 1–${MAX_TITLE} characters.`);
  }
  if (!body || body.length > MAX_BODY) {
    throw errors.validation(`A question needs a body of 1–${MAX_BODY} characters.`);
  }

  // Idempotent replay (TRD apis[A3].errors). Checked before the insert for the common
  // case; the unique constraint below is what actually makes it race-safe.
  const existing = await repo.findQuestionByIdempotencyKey(pool, input.idempotencyKey);
  if (existing) return replayQuestion(existing, input.authorProfileId);

  const topic = await repo.findActiveTopicBySlug(pool, input.topicSlug);
  if (!topic) throw errors.topicInvalid();

  let created: { id: string; caseId: string };
  try {
    created = await withTransaction(async (client) => {
      const q = await repo.insertQuestion(client, {
        authorProfileId: input.authorProfileId,
        topicTagId: topic.id,
        title,
        body,
        idempotencyKey: input.idempotencyKey,
      });
      const caseId = await openCase(client, { type: "question", id: q.id });
      return { id: q.id, caseId };
    });
  } catch (err) {
    // 23505 on idempotency_key = a concurrent duplicate won the race. Same outcome as
    // the pre-check: return the winner rather than erroring.
    if ((err as { code?: string }).code === "23505") {
      const raced = await repo.findQuestionByIdempotencyKey(pool, input.idempotencyKey);
      if (raced) return replayQuestion(raced, input.authorProfileId);
    }
    throw err;
  }

  // Emitted before classification, not after: the row exists, so the submission is
  // already a fact, and this timestamp starts the answer-liquidity clock. The moderation
  // outcome is a separate event emitted by the gateway, once per verdict application.
  ContentEvents.questionSubmitted(input.authorProfileId, {
    questionId: created.id,
    topic: topic.slug,
  });

  const outcome = await classifyAndApply(
    { type: "question", id: created.id },
    created.caseId,
    { text: `${title}\n\n${body}`, contentType: "question" },
  );

  return { id: created.id, moderationStatus: outcome.status, held: outcome.held };
}

function replayQuestion(
  existing: { id: string; author_profile_id: string },
  callerProfileId: string,
): Promise<CreatedContent> {
  if (existing.author_profile_id !== callerProfileId) {
    // Someone else's key. Not a replay — refuse rather than disclose their content.
    throw errors.idempotencyKeyConflict();
  }
  return repo.findQuestionById(pool, existing.id, callerProfileId).then((q) => {
    if (!q) throw errors.notFound("That question is no longer available.");
    return { id: q.id, moderationStatus: q.moderation_status, held: q.moderation_status === "pending", replayed: true as const };
  });
}

// ---------------------------------------------------------------------------
// A4 — Create Answer
// ---------------------------------------------------------------------------

export async function createAnswer(input: {
  questionId: string;
  authorProfileId: string;
  body: string;
  idempotencyKey: string;
}): Promise<CreatedContent> {
  const body = input.body.trim();
  if (!body || body.length > MAX_BODY) {
    throw errors.validation(`An answer needs a body of 1–${MAX_BODY} characters.`);
  }

  const existing = await repo.findAnswerByIdempotencyKey(pool, input.idempotencyKey);
  if (existing) {
    if (existing.author_profile_id !== input.authorProfileId) {
      throw errors.idempotencyKeyConflict();
    }
    const a = await repo.findAnswerById(pool, existing.id, input.authorProfileId);
    if (!a) throw errors.notFound("That answer is no longer available.");
    return {
      id: a.id,
      moderationStatus: a.moderation_status,
      held: a.moderation_status === "pending",
      replayed: true,
    };
  }

  // A held or blocked question is not answerable — answering one would leak that it
  // exists (TRD apis[A4].errors "parent question not found or removed").
  const parentId = await repo.findPublishedQuestionId(pool, input.questionId);
  if (!parentId) throw errors.parentQuestionNotFound();

  let created: { id: string; caseId: string };
  try {
    created = await withTransaction(async (client) => {
      const a = await repo.insertAnswer(client, {
        questionId: parentId,
        authorProfileId: input.authorProfileId,
        body,
        idempotencyKey: input.idempotencyKey,
      });
      const caseId = await openCase(client, { type: "answer", id: a.id });
      return { id: a.id, caseId };
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      const raced = await repo.findAnswerByIdempotencyKey(pool, input.idempotencyKey);
      if (raced && raced.author_profile_id === input.authorProfileId) {
        const a = await repo.findAnswerById(pool, raced.id, input.authorProfileId);
        if (a) {
          return {
            id: a.id,
            moderationStatus: a.moderation_status,
            held: a.moderation_status === "pending",
            replayed: true,
          };
        }
      }
    }
    throw err;
  }

  // Before classification, for the same reason as the question path above.
  ContentEvents.answerSubmitted(input.authorProfileId, {
    answerId: created.id,
    questionId: parentId,
  });

  const outcome = await classifyAndApply(
    { type: "answer", id: created.id },
    created.caseId,
    { text: body, contentType: "answer" },
  );

  return { id: created.id, moderationStatus: outcome.status, held: outcome.held };
}

// ---------------------------------------------------------------------------
// A5 — Browse (T17). Full keyword/topic/cohort search is T20 (M3).
// ---------------------------------------------------------------------------

const FEED_PAGE_SIZE = 20;
const FEED_MAX_PAGE_SIZE = 50;

export interface FeedResult {
  questions: QuestionRow[];
  /** Cursor for the next page; null at the end of the feed. */
  nextBefore: string | null;
  /**
   * Explicit empty state rather than an error — R4's acceptance criterion. T17 serves
   * the browse case; T20 adds the "no matches for your search" variant.
   */
  empty: boolean;
}

export async function browseQuestions(opts: {
  topicSlug?: string;
  before?: string;
  limit?: number;
}): Promise<FeedResult> {
  const limit = Math.min(Math.max(opts.limit ?? FEED_PAGE_SIZE, 1), FEED_MAX_PAGE_SIZE);

  let before: Date | undefined;
  if (opts.before) {
    const parsed = new Date(opts.before);
    if (Number.isNaN(parsed.getTime())) throw errors.validation("Invalid pagination cursor.");
    before = parsed;
  }

  if (opts.topicSlug) {
    const topic = await repo.findActiveTopicBySlug(pool, opts.topicSlug);
    if (!topic) throw errors.topicInvalid();
  }

  // One extra row tells us whether another page exists without a second COUNT query.
  const rows = await repo.listPublishedQuestions(pool, {
    topicSlug: opts.topicSlug,
    before,
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return {
    questions: page,
    nextBefore: hasMore && last?.published_at ? last.published_at.toISOString() : null,
    empty: page.length === 0,
  };
}

export async function getQuestionThread(
  questionId: string,
  viewerProfileId: string,
): Promise<{ question: QuestionRow; answers: AnswerRow[] }> {
  const question = await repo.findQuestionById(pool, questionId, viewerProfileId);
  if (!question) throw errors.notFound("That question is no longer available.");
  const answers = await repo.listAnswersForQuestion(pool, questionId, viewerProfileId);
  return { question, answers };
}

export async function listTopics(): Promise<repo.TopicTag[]> {
  return repo.listActiveTopics(pool);
}
