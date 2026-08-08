import { describe, expect, it } from "vitest";
import {
  EXPEDITED_REASONS,
  GENERAL_REASONS,
  MAX_WARNING_LEAD_MS,
  RESOLUTION_SLA_EXPEDITED_MS,
  RESOLUTION_SLA_GENERAL_MS,
  WARN_AT_REMAINING_FRACTION,
  resolutionBudgetMs,
  resolutionDeadline,
  warningDueAt,
} from "../../server/src/modules/grievance/grievance.slas.js";

/**
 * T38 — when the operator gets warned, with no database in the way.
 *
 * The point of these: a warning window is only useful if it leaves enough time to act on BOTH
 * clocks. A single fixed window cannot — "two days left" fires before an expedited ticket
 * exists, and "six hours left" reaches a fifteen-day ticket far too late to matter.
 */

const FILED = new Date("2026-08-09T10:00:00.000Z");

describe("the warning window scales with the category", () => {
  it("warns 6 hours before an expedited 24-hour deadline", () => {
    for (const reason of EXPEDITED_REASONS) {
      const deadline = resolutionDeadline(reason, FILED);
      // 24h budget, 25% remaining -> warn at 18h elapsed, i.e. 6h before the deadline.
      expect(warningDueAt(reason, deadline).toISOString()).toBe("2026-08-10T04:00:00.000Z");
    }
  });

  it("warns 3¾ days before a general 15-day deadline", () => {
    for (const reason of GENERAL_REASONS) {
      const deadline = resolutionDeadline(reason, FILED);
      expect(warningDueAt(reason, deadline).toISOString()).toBe("2026-08-20T16:00:00.000Z");
    }
  });

  it("always leaves the warning strictly inside the ticket's own lifetime", () => {
    // The failure a fixed window produces: a warning due BEFORE the ticket was filed, which
    // would fire on the very first pass and mean nothing.
    for (const reason of [...EXPEDITED_REASONS, ...GENERAL_REASONS]) {
      const deadline = resolutionDeadline(reason, FILED);
      const warn = warningDueAt(reason, deadline);
      expect(warn.getTime()).toBeGreaterThan(FILED.getTime());
      expect(warn.getTime()).toBeLessThan(deadline.getTime());
    }
  });

  it("keeps the fraction and the budgets as the single source of the window", () => {
    for (const reason of [...EXPEDITED_REASONS, ...GENERAL_REASONS]) {
      const deadline = resolutionDeadline(reason, FILED);
      expect(deadline.getTime() - warningDueAt(reason, deadline).getTime()).toBe(
        resolutionBudgetMs(reason) * WARN_AT_REMAINING_FRACTION,
      );
    }
  });
});

describe("the scan bound the job passes to SQL", () => {
  it("is derived from the widest budget, not written as a number", () => {
    // A literal "4 days" in the query would silently stop catching warnings the moment T43
    // lengthens the general budget, and nothing would say so.
    expect(MAX_WARNING_LEAD_MS).toBe(
      Math.max(RESOLUTION_SLA_EXPEDITED_MS, RESOLUTION_SLA_GENERAL_MS) *
        WARN_AT_REMAINING_FRACTION,
    );
  });

  it("is wide enough to catch every category's warning", () => {
    // The whole correctness argument for the SQL filter being a superset.
    for (const reason of [...EXPEDITED_REASONS, ...GENERAL_REASONS]) {
      expect(MAX_WARNING_LEAD_MS).toBeGreaterThanOrEqual(
        resolutionBudgetMs(reason) * WARN_AT_REMAINING_FRACTION,
      );
    }
  });
});
