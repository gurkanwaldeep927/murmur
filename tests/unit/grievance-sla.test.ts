import { describe, expect, it } from "vitest";
import {
  ACKNOWLEDGEMENT_SLA_MS,
  EXPEDITED_REASONS,
  GENERAL_REASONS,
  REPORT_REASONS,
  RESOLUTION_SLA_EXPEDITED_MS,
  RESOLUTION_SLA_GENERAL_MS,
  acknowledgementDeadline,
  isExpedited,
  isReportReason,
  resolutionDeadline,
} from "../../server/src/modules/grievance/grievance.slas.js";

/**
 * T34 — the SLA table itself, with no database in the way.
 *
 * These figures are the reason this task exists: the TRD requires a category-segmented
 * resolution SLA and the frozen schema shipped no category column, so the segmentation had
 * nothing to segment on until now (decisions/a8-report-intake-slas.md §1).
 */

const FIXED = new Date("2026-08-09T10:00:00.000Z");

describe("the reason vocabulary", () => {
  it("is exactly the expedited set plus the general set, with no overlap", () => {
    expect(REPORT_REASONS).toEqual([...EXPEDITED_REASONS, ...GENERAL_REASONS]);
    expect(new Set(REPORT_REASONS).size).toBe(REPORT_REASONS.length);
  });

  it("refuses anything outside the list", () => {
    expect(isReportReason("harassment")).toBe(true);
    // Free text was what `reason` accepted before migration 010. A reason the SLA table has
    // never heard of would take the general 15-day branch on a complaint the law may give 24
    // hours — a plausible deadline on the wrong clock, which is the failure this refuses.
    expect(isReportReason("this content is bad")).toBe(false);
    expect(isReportReason("")).toBe(false);
    expect(isReportReason(undefined)).toBe(false);
    expect(isReportReason(42)).toBe(false);
  });

  it("keeps 'other' on the general clock", () => {
    // Deliberate: inferring urgency from an uncategorised complaint is precisely what having
    // categories exists to avoid.
    expect(isExpedited("other")).toBe(false);
  });
});

describe("the resolution deadline is derived from the category", () => {
  it("gives the expedited categories 24 hours", () => {
    expect(RESOLUTION_SLA_EXPEDITED_MS).toBe(24 * 60 * 60 * 1000);
    for (const reason of EXPEDITED_REASONS) {
      expect(isExpedited(reason)).toBe(true);
      expect(resolutionDeadline(reason, FIXED).toISOString()).toBe("2026-08-10T10:00:00.000Z");
    }
  });

  it("gives everything else 15 days", () => {
    expect(RESOLUTION_SLA_GENERAL_MS).toBe(15 * 24 * 60 * 60 * 1000);
    for (const reason of GENERAL_REASONS) {
      expect(isExpedited(reason)).toBe(false);
      expect(resolutionDeadline(reason, FIXED).toISOString()).toBe("2026-08-24T10:00:00.000Z");
    }
  });

  it("separates the two clocks by a wide margin, so a mis-categorisation is not cosmetic", () => {
    // Named here so the cost of getting the category wrong is visible in the suite rather
    // than only in the decision document: it is a fourteen-day difference on a legal deadline.
    expect(RESOLUTION_SLA_GENERAL_MS - RESOLUTION_SLA_EXPEDITED_MS).toBe(
      14 * 24 * 60 * 60 * 1000,
    );
  });
});

describe("the acknowledgement deadline", () => {
  it("is 24 hours from filing, whatever the category", () => {
    expect(ACKNOWLEDGEMENT_SLA_MS).toBe(24 * 60 * 60 * 1000);
    for (const reason of REPORT_REASONS) {
      void reason; // the acknowledgement clock is deliberately not segmented
      expect(acknowledgementDeadline(FIXED).toISOString()).toBe("2026-08-10T10:00:00.000Z");
    }
  });
});
