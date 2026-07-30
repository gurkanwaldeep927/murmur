/**
 * Moderation Gateway types (T14a — plan §4, TRD §6 A7 / §8).
 *
 * This file is the seam the whole fourth-revision plan turns on: everything here is
 * Murmur's own vocabulary, with no vendor concepts in it. T14b (M6) adds adapters that
 * translate a specific provider's response INTO `ProviderVerdict`; nothing outside
 * `providers/` ever learns which vendor is bound, or whether one is bound at all.
 */

/** Mirrors `ai_risk_tier_enum` (migration 002). */
export type RiskTier = "auto_pass" | "auto_block" | "escalate";

/** Mirrors `moderation_status_enum` (migration 002). */
export type ModerationStatus = "pending" | "published" | "blocked";

export type ContentType = "question" | "answer";

export interface ClassifyInput {
  /** The full user-submitted text being classified (title + body for a question). */
  text: string;
  contentType: ContentType;
}

export interface ProviderVerdict {
  tier: RiskTier;
  /** Provider's own category label, e.g. "harassment". Stored for operator context. */
  label: string | null;
  /** Normalized 0–1 confidence/severity where the provider gives one. */
  score: number | null;
  /** Provider-side case/request id, for support tickets and audits. */
  providerCaseRef: string | null;
  /** Raw provider payload, stored as-is on the case for later threshold tuning (T14b). */
  raw: unknown;
}

/**
 * Thrown when a provider cannot produce a verdict: timeout, outage, transport error,
 * malformed response — or no provider being configured at all.
 *
 * Every one of those is the SAME event to the gateway: no verdict, therefore hold.
 * Collapsing them into one error type is deliberate. It means the unconfigured-provider
 * path and the provider-outage path are not merely similar, they are literally the same
 * code path, so the outage drill (T56/T63) exercises the default the app actually runs
 * in from M2 to M6 (plan §1, fourth revision).
 */
export class ProviderUnavailableError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProviderUnavailableError";
    this.provider = provider;
  }
}

/**
 * The port. A provider classifies text and either returns a verdict or throws
 * `ProviderUnavailableError`. It must not decide what happens to the content —
 * that is the gateway's job, and keeping it there is what makes fail-closed
 * impossible for an adapter to get wrong.
 */
export interface ModerationProvider {
  readonly name: string;
  classify(input: ClassifyInput): Promise<ProviderVerdict>;
}

/** What a moderated write reports back to its caller (A3/A4 response shape). */
export interface ModerationOutcome {
  caseId: string;
  status: ModerationStatus;
  riskTier: RiskTier | null;
  /** True when the item is held awaiting retry or a human, i.e. status === "pending". */
  held: boolean;
}
