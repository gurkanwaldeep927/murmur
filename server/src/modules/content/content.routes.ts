import { Router } from "express";
import { z } from "zod";
import { errors } from "../../shared/error-envelope.js";
import { callerOf, requireSession } from "../../shared/require-session.js";
import {
  browseQuestions,
  createAnswer,
  createQuestion,
  getQuestionThread,
  listTopics,
} from "./content.service.js";
import type { AnswerRow, QuestionRow } from "./content.repo.js";

/**
 * A3 `POST /questions`, A4 `POST /questions/:id/answers`, A5-browse `GET /questions`
 * (T15/T16/T17). All behind `requireSession`, which is where the ban/suspend guard lives
 * — route handlers never re-implement it (see shared/require-session.ts).
 */

export const contentRouter = Router();

// Serialization is centralized so no handler can hand back a raw row. Author identity is
// pseudonym + year badge only; `author_profile_id` never crosses this boundary
// (NFR identity non-disclosure, PRD R2 AC1).
function questionView(q: QuestionRow) {
  return {
    id: q.id,
    title: q.title,
    body: q.body,
    topic: { slug: q.topic_slug, label: q.topic_label },
    moderationStatus: q.moderation_status,
    publishedAt: q.published_at,
    answerCount: q.answer_count,
    createdAt: q.created_at,
    author: q.author,
  };
}

function answerView(a: AnswerRow) {
  return {
    id: a.id,
    questionId: a.question_id,
    body: a.body,
    moderationStatus: a.moderation_status,
    accepted: a.accepted,
    voteCount: a.vote_count,
    createdAt: a.created_at,
    author: a.author,
  };
}

/**
 * The one place the client is told what a held item means. A3/A4 deliberately return
 * 202 (not 201) for held content: "accepted, not yet published" is the literal truth,
 * and the S6/S12 state chain must never render a held post as live (RR-5).
 */
function submissionResponse(result: {
  id: string;
  moderationStatus: string;
  held: boolean;
  replayed?: true;
}) {
  return {
    status: result.held ? 202 : 201,
    body: {
      id: result.id,
      moderationStatus: result.moderationStatus,
      pendingReview: result.held,
      message: result.held
        ? "Your post is being reviewed. It'll appear once it's cleared."
        : result.moderationStatus === "blocked"
          ? "This post wasn't published because it breaks the community rules."
          : "Posted.",
      ...(result.replayed ? { replayed: true } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// A3 — Create Question
// ---------------------------------------------------------------------------

const createQuestionSchema = z.object({
  topic: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  body: z.string().min(1).max(20_000),
  // Client-generated (TRD apis[A3].inputs): the offline queue assigns it before the
  // write ever reaches the server, which is what makes a replayed sync idempotent.
  idempotencyKey: z.string().uuid(),
});

contentRouter.post("/questions", requireSession, async (req, res, next) => {
  const parsed = createQuestionSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(errors.validation("A question needs a topic, a title, a body, and an idempotency key."));
  }
  try {
    const result = await createQuestion({
      authorProfileId: callerOf(req).id,
      topicSlug: parsed.data.topic,
      title: parsed.data.title,
      body: parsed.data.body,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    const { status, body } = submissionResponse(result);
    res.status(status).json(body);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// A4 — Create Answer
// ---------------------------------------------------------------------------

const createAnswerSchema = z.object({
  body: z.string().min(1).max(20_000),
  idempotencyKey: z.string().uuid(),
});

contentRouter.post("/questions/:id/answers", requireSession, async (req, res, next) => {
  const questionId = z.string().uuid().safeParse(req.params.id);
  if (!questionId.success) return next(errors.parentQuestionNotFound());

  const parsed = createAnswerSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(errors.validation("An answer needs a body and an idempotency key."));
  }
  try {
    const result = await createAnswer({
      questionId: questionId.data,
      authorProfileId: callerOf(req).id,
      body: parsed.data.body,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    const { status, body } = submissionResponse(result);
    res.status(status).json(body);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// A5 (browse half) — recent published feed for S5, plus the S7 thread read
// ---------------------------------------------------------------------------

const browseSchema = z.object({
  topic: z.string().min(1).max(64).optional(),
  before: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

contentRouter.get("/questions", requireSession, async (req, res, next) => {
  const parsed = browseSchema.safeParse(req.query);
  if (!parsed.success) return next(errors.validation("Invalid browse parameters."));
  try {
    const result = await browseQuestions({
      topicSlug: parsed.data.topic,
      before: parsed.data.before,
      limit: parsed.data.limit,
    });
    res.json({
      questions: result.questions.map(questionView),
      nextBefore: result.nextBefore,
      // An empty feed is a state, not an error (R4 AC2). The copy invites a post; S5
      // renders it as the empty state rather than as a failure.
      empty: result.empty,
      emptyMessage: result.empty
        ? "Nothing here yet. Ask the first question — a senior will see it."
        : null,
    });
  } catch (err) {
    next(err);
  }
});

contentRouter.get("/questions/:id", requireSession, async (req, res, next) => {
  const questionId = z.string().uuid().safeParse(req.params.id);
  if (!questionId.success) return next(errors.notFound("That question is no longer available."));
  try {
    const { question, answers } = await getQuestionThread(questionId.data, callerOf(req).id);
    res.json({ question: questionView(question), answers: answers.map(answerView) });
  } catch (err) {
    next(err);
  }
});

/** The fixed topic set behind S6's composer and S10's browse list. */
contentRouter.get("/topics", requireSession, async (_req, res, next) => {
  try {
    res.json({ topics: await listTopics() });
  } catch (err) {
    next(err);
  }
});
