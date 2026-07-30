import { emit } from "../analytics/analytics.service.js";
import type { ModerationStatus, RiskTier } from "../moderation/moderation.types.js";

/**
 * Q&A + moderation event vocabulary (plan T51's M2 hooks; PRD R8).
 *
 * Two of the six PRD metrics are sourced here: **answer liquidity** (the
 * question-submitted → answer-published interval) and the **auto-vs-escalated
 * moderation ratio**. T46 (M6) derives both from these events, so the names below are
 * the canonical vocabulary — T51 extends this file rather than inventing parallel names.
 *
 * Fire-and-forget throughout (A12): instrumentation never blocks or fails a post.
 */

export const ContentEventNames = {
  QUESTION_SUBMITTED: "content.question_submitted",
  ANSWER_SUBMITTED: "content.answer_submitted",
  MODERATION_OUTCOME: "moderation.outcome",
} as const;

/**
 * Moderation outcome, bucketed for the auto-vs-escalated ratio. `held_unavailable` is
 * kept distinct from `escalated`: both mean "a human may need to look", but only the
 * first says the provider failed to answer — a distinction the ratio would otherwise
 * hide, and one that matters a great deal while no provider is bound (T14b/M6).
 */
function outcomeBucket(status: ModerationStatus, riskTier: RiskTier | null): string {
  if (status === "published") return "auto_passed";
  if (status === "blocked") return "auto_blocked";
  return riskTier === "escalate" ? "escalated" : "held_unavailable";
}

export const ContentEvents = {
  questionSubmitted(
    actorProfileId: string,
    meta: {
      questionId: string;
      topic: string;
      moderationStatus: ModerationStatus;
      riskTier: RiskTier | null;
    },
  ): void {
    emit({
      eventType: ContentEventNames.QUESTION_SUBMITTED,
      actorProfileId,
      metadata: { questionId: meta.questionId, topic: meta.topic },
    });
    emit({
      eventType: ContentEventNames.MODERATION_OUTCOME,
      actorProfileId,
      metadata: {
        contentType: "question",
        contentId: meta.questionId,
        outcome: outcomeBucket(meta.moderationStatus, meta.riskTier),
      },
    });
  },

  answerSubmitted(
    actorProfileId: string,
    meta: {
      answerId: string;
      questionId: string;
      moderationStatus: ModerationStatus;
      riskTier: RiskTier | null;
    },
  ): void {
    emit({
      eventType: ContentEventNames.ANSWER_SUBMITTED,
      actorProfileId,
      metadata: { answerId: meta.answerId, questionId: meta.questionId },
    });
    emit({
      eventType: ContentEventNames.MODERATION_OUTCOME,
      actorProfileId,
      metadata: {
        contentType: "answer",
        contentId: meta.answerId,
        outcome: outcomeBucket(meta.moderationStatus, meta.riskTier),
      },
    });
  },
};
