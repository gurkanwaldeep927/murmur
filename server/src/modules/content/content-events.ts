import { emit } from "../analytics/analytics.service.js";

/**
 * Q&A submission event vocabulary (plan T51's M2 hooks; PRD R8).
 *
 * These are SUBMIT-time facts: a student pressed post, and the row now exists. They say
 * nothing about whether it became visible — that is a moderation outcome, and it is
 * emitted by the gateway (`moderation/moderation-events.ts`), because a single item can
 * be decided on any of several attempts and only the gateway sees all of them.
 *
 * `content.question_submitted` is the start of the **answer-liquidity** clock; the
 * matching `moderation.outcome` with `outcome: "auto_passed"` on an answer carrying the
 * same `questionId` is its end. T46 (M6) derives the interval from those two, so the
 * names below are canonical — extend this file rather than inventing parallel ones.
 *
 * Fire-and-forget throughout (A12): instrumentation never blocks or fails a post.
 */

export const ContentEventNames = {
  QUESTION_SUBMITTED: "content.question_submitted",
  ANSWER_SUBMITTED: "content.answer_submitted",
} as const;

export const ContentEvents = {
  questionSubmitted(actorProfileId: string, meta: { questionId: string; topic: string }): void {
    emit({
      eventType: ContentEventNames.QUESTION_SUBMITTED,
      actorProfileId,
      metadata: { questionId: meta.questionId, topic: meta.topic },
    });
  },

  answerSubmitted(
    actorProfileId: string,
    meta: { answerId: string; questionId: string },
  ): void {
    emit({
      eventType: ContentEventNames.ANSWER_SUBMITTED,
      actorProfileId,
      metadata: { answerId: meta.answerId, questionId: meta.questionId },
    });
  },
};
