import { Router } from "express";
import { z } from "zod";
import { errors } from "../../shared/error-envelope.js";
import { rateLimitByProfile, reportLimiter } from "../../shared/rate-limit.js";
import { callerOf, requireSession } from "../../shared/require-session.js";
import { fileReport, type ReportResult } from "./grievance.service.js";
import { REPORT_REASONS } from "./grievance.slas.js";

/**
 * A8 `POST /reports` — grievance intake (T34).
 *
 * Behind `requireSession`, which is where the ban/suspend guard lives; it is not
 * re-implemented here (shared/require-session.ts).
 *
 * An anonymous report is still an AUTHENTICATED request. `isAnonymous` means "store no
 * reporter", not "accept a report from nobody" — an unauthenticated intake would be an
 * unbounded abuse channel against a product whose whole safety story is that every actor is a
 * verified student.
 *
 * A3/A4/A5 and the session middleware are untouched by this task: T62 is an open gate over
 * exactly that surface, and reshaping it in front of the gate only makes its findings staler.
 */

export const grievanceRouter = Router();

const reportSchema = z.object({
  // Exactly one target, mirroring the database's own chk_grievance_report_one_target. The
  // request is refused here so the reporter gets a sentence, and refused there regardless.
  questionId: z.string().uuid().optional(),
  answerId: z.string().uuid().optional(),
  // A closed set, not free text: the reason IS the SLA category
  // (decisions/a8-report-intake-slas.md §1).
  reason: z.enum(REPORT_REASONS),
  isAnonymous: z.boolean().optional(),
  // Optional, unlike A3/A4 — the column is nullable and S13 does not send one. The
  // duplicate-merge rule is what makes a double-tap harmless without it.
  idempotencyKey: z.string().uuid().optional(),
});

/**
 * What crosses the boundary. Notably absent: the reported content's author, and — for an
 * anonymous report — any hint of who filed it. The ticket id is returned even when anonymous
 * because S13's success state shows it; the honest cost is that an anonymous reporter cannot
 * look their ticket up again, since nothing links it to them.
 */
function reportView(result: ReportResult) {
  return {
    reportId: result.reportId,
    status: result.status,
    reason: result.reason,
    expedited: result.expedited,
    acknowledgedAt: result.acknowledgedAt,
    acknowledgementDueAt: result.acknowledgementDueAt,
    resolutionDueAt: result.resolutionDueAt,
    isAnonymous: result.isAnonymous,
    merged: result.merged,
    message: result.merged
      ? "You'd already reported this. We've added it to your open report rather than starting a new one."
      : "Report received. Our grievance officer will look at it.",
  };
}

grievanceRouter.post(
  "/reports",
  requireSession,
  rateLimitByProfile(
    reportLimiter,
    "You've filed a lot of reports recently. Please try again later.",
  ),
  async (req, res, next) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(errors.validation("A report needs one piece of content and a reason."));
    }
    const { questionId, answerId } = parsed.data;
    if ((questionId ? 1 : 0) + (answerId ? 1 : 0) !== 1) {
      return next(errors.validation("Report exactly one question or one answer."));
    }

    try {
      const result = await fileReport({
        reporterProfileId: callerOf(req).id,
        target: questionId
          ? { type: "question", id: questionId }
          : { type: "answer", id: answerId! },
        reason: parsed.data.reason,
        isAnonymous: parsed.data.isAnonymous ?? false,
        idempotencyKey: parsed.data.idempotencyKey ?? null,
      });
      // 200 for a merge, 201 for a new ticket: the merged case created nothing, and S13
      // renders it as its own `merged` state rather than as a fresh success.
      res.status(result.merged || result.replayed ? 200 : 201).json(reportView(result));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * The reason picker S13 draws. Served rather than hard-coded in the client for the same reason
 * `/topics` is: a vocabulary that must match a database CHECK constraint has exactly one
 * source, and a client shipped with a stale copy would offer a reason every submit refuses.
 */
grievanceRouter.get("/reports/reasons", requireSession, (_req, res) => {
  res.json({ reasons: REPORT_REASONS });
});
