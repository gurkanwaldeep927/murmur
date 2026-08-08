/**
 * The grievance reason vocabulary and the clocks each reason starts (T34).
 *
 * Full reasoning and every cost: `decisions/a8-report-intake-slas.md`.
 *
 * Two things live here and nowhere else, deliberately in one file: the list of reasons a
 * reporter may pick, and the deadline each one earns. Splitting them is how a category ends up
 * added without a decided SLA — which would silently take the 15-day branch on a complaint the
 * law gives 24 hours.
 *
 * The same list is pinned in the database by migration 010's `chk_grievance_report_reason`.
 * If you add a reason here, add it there, or the insert is refused — which is the intended
 * failure: loudly, at the first write, rather than a plausible deadline on the wrong clock.
 */

/** Reasons whose resolution clock is the expedited one (IT Rules 2021 Rule 3(2)(b)). */
export const EXPEDITED_REASONS = [
  "non_consensual_imagery",
  "sexual_content_morphed",
  "impersonation",
] as const;

/** Everything else — the general Rule 3(2)(a) clock. */
export const GENERAL_REASONS = [
  "harassment",
  "hate_speech",
  "threat_of_violence",
  "spam_or_scam",
  // Catch-all so a reporter is never stuck without a submit. Deliberately NOT expedited:
  // inferring urgency from an uncategorised complaint is what having categories avoids.
  "other",
] as const;

export const REPORT_REASONS = [...EXPEDITED_REASONS, ...GENERAL_REASONS] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

const EXPEDITED = new Set<string>(EXPEDITED_REASONS);

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && (REPORT_REASONS as readonly string[]).includes(value);
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * `[ASSUMPTION]` — TRD §7 marks all three figures as assumptions awaiting legal review (T43).
 * They are named constants so that review is one edit.
 *
 * The expedited figure takes the tighter end of the TRD's own "24–36h" range: being late
 * against a self-chosen 36h when the statute is read as 24h is the worse failure of the two.
 *
 * Changing any of these does NOT move existing tickets. `sla_deadline` is computed once at
 * intake and stored, and migration 010 makes it immutable — a ticket carries the deadline that
 * was in force when it was filed, which is what a compliance record has to do.
 */
export const ACKNOWLEDGEMENT_SLA_MS = 24 * HOUR_MS;
export const RESOLUTION_SLA_EXPEDITED_MS = 24 * HOUR_MS;
export const RESOLUTION_SLA_GENERAL_MS = 15 * DAY_MS;

export function isExpedited(reason: ReportReason): boolean {
  return EXPEDITED.has(reason);
}

/** The resolution deadline `sla_deadline` stores — the clock `sla_breached` is generated from. */
export function resolutionDeadline(reason: ReportReason, filedAt: Date): Date {
  const budget = isExpedited(reason)
    ? RESOLUTION_SLA_EXPEDITED_MS
    : RESOLUTION_SLA_GENERAL_MS;
  return new Date(filedAt.getTime() + budget);
}

/**
 * The acknowledgement deadline. Derived, never stored: the frozen schema has one deadline
 * column and `sla_breached` is defined against it, so a second stored deadline would need the
 * breach semantics reopened. It is returned to the reporter because A8's contract promises an
 * "SLA-bound acknowledgement timestamp" — and in practice it is always already met, because
 * intake acknowledges in the same transaction (decision §3).
 */
export function acknowledgementDeadline(filedAt: Date): Date {
  return new Date(filedAt.getTime() + ACKNOWLEDGEMENT_SLA_MS);
}

// ---------------------------------------------------------------------------
// T38 — when the operator gets warned that a deadline is coming.
// ---------------------------------------------------------------------------

/**
 * How much of the budget must remain for the warning to still be useful, as a FRACTION of
 * that category's budget rather than a fixed number of hours.
 *
 * A fixed window cannot work across these two clocks: "two days left" fires before an
 * expedited ticket even exists, and "six hours left" on a fifteen-day ticket arrives far too
 * late to do anything with. A fraction is category-segmented by construction, which is exactly
 * what the task asks for — and it stays correct if T43's legal review moves the budgets.
 *
 * `[ASSUMPTION]` at 25%: 6 hours on the 24-hour clock, 3¾ days on the 15-day one. Both are
 * enough time for a human to act, which is the only thing a warning is for.
 */
export const WARN_AT_REMAINING_FRACTION = 0.25;

export function resolutionBudgetMs(reason: ReportReason): number {
  return isExpedited(reason) ? RESOLUTION_SLA_EXPEDITED_MS : RESOLUTION_SLA_GENERAL_MS;
}

/** The moment the warning becomes due for a ticket with this reason and this deadline. */
export function warningDueAt(reason: ReportReason, deadline: Date): Date {
  return new Date(deadline.getTime() - resolutionBudgetMs(reason) * WARN_AT_REMAINING_FRACTION);
}

/**
 * The widest warning lead time across every category — the bound the SLA job uses to keep its
 * scan short without ever missing a warning.
 *
 * Derived rather than written as a number on purpose: a literal "4 days" here would silently
 * stop catching warnings the moment T43 lengthens the general budget, and nothing would say so.
 */
export const MAX_WARNING_LEAD_MS = Math.max(
  ...REPORT_REASONS.map((r) => resolutionBudgetMs(r) * WARN_AT_REMAINING_FRACTION),
);
