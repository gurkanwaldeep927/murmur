import type { ModerationStatus, RiskTier } from "./moderation.types.js";

/**
 * Moderation outcome vocabulary (plan T51; PRD R8 auto-vs-escalated ratio, answer
 * liquidity).
 *
 * ## Why this lives here and not in `content-events.ts`
 *
 * It used to be emitted at SUBMIT time, from `content.service.ts`, using the status the
 * first classification attempt returned. That recorded exactly one moment — the first
 * attempt — and nothing else. Every item the retry worker later published, blocked, or
 * escalated changed status with no event at all, so:
 *
 *   - the auto-vs-escalated ratio counted first attempts, not decisions, and
 *   - answer liquidity had no publish timestamp to measure to.
 *
 * Until T14b binds a real provider, **every** item takes the retry path (the default
 * provider holds everything), so the blind spot was the normal case rather than an edge.
 *
 * The gateway is the one funnel every verdict passes through, on both the inline
 * (T15/T16) and worker paths, which is why emission moved there — one event per verdict
 * APPLICATION. A held → retried → published item therefore leaves a readable trail of
 * three events rather than one misleading one, and `attempt` distinguishes them.
 *
 * ## No actor
 *
 * These events carry no `actor_profile_id`. An outcome is a fact about CONTENT, and
 * `analytics_event` is append-only (PRV-1) — attaching a person to every moderation
 * decision would build a permanent per-student moderation history that no PRD metric
 * needs. `contentType` + `contentId` identify the item; the moderation case already
 * carries the author for anyone who legitimately needs it.
 */

export const ModerationEventNames = {
  /** One per verdict APPLICATION — not one per item. */
  OUTCOME: "moderation.outcome",
} as const;

/**
 * Moderation outcome, bucketed for the auto-vs-escalated ratio. `held_unavailable` is
 * kept distinct from `escalated`: both mean "a human may need to look", but only the
 * first says the provider failed to answer — a distinction the ratio would otherwise
 * hide, and one that matters a great deal while no provider is bound (T14b/M6).
 */
export function outcomeBucket(status: ModerationStatus, riskTier: RiskTier | null): string {
  if (status === "published") return "auto_passed";
  if (status === "blocked") return "auto_blocked";
  return riskTier === "escalate" ? "escalated" : "held_unavailable";
}

export interface ModerationOutcomeMeta {
  contentType: "question" | "answer";
  contentId: string;
  outcome: string;
  /** 1-based attempt this verdict came from; makes a held → retried → published trail readable. */
  attempt: number;
  /**
   * Parent question of an answer. Present so answer liquidity (question asked → answer
   * published) is computable from the event stream alone, without joining content tables.
   */
  questionId?: string;
}
