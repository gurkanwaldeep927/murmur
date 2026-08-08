import { pool, withTransaction } from "../../db/pool.js";
import { errors } from "../../shared/error-envelope.js";
import * as repo from "./grievance.repo.js";
import type { ReportTarget } from "./grievance.repo.js";
import {
  acknowledgementDeadline,
  isExpedited,
  resolutionDeadline,
  type ReportReason,
} from "./grievance.slas.js";

/**
 * A8 — Report Content / grievance intake (T34). TRD §6.
 *
 * Decisions this implements, all of them made in `decisions/a8-report-intake-slas.md` because
 * no upstream document made them: the reason vocabulary, the three SLA figures, acknowledging
 * at intake, and what "merged into the existing ticket" means in the data.
 */

export interface ReportResult {
  reportId: string;
  status: string;
  reason: ReportReason;
  expedited: boolean;
  /** When this ticket must be resolved by — stored, and immutable from here on. */
  resolutionDueAt: Date;
  /** Derived, not stored. Always already met: intake acknowledges (decision §3). */
  acknowledgementDueAt: Date;
  acknowledgedAt: Date | null;
  isAnonymous: boolean;
  /** True when this submission was folded into a ticket the reporter already had open. */
  merged: boolean;
  /** True when the same idempotency key had already created this ticket. */
  replayed: boolean;
}

function view(row: repo.ReportRow, flags: { merged: boolean; replayed: boolean }): ReportResult {
  const reason = row.reason as ReportReason;
  return {
    reportId: row.id,
    status: row.status,
    reason,
    expedited: isExpedited(reason),
    resolutionDueAt: row.sla_deadline,
    acknowledgementDueAt: acknowledgementDeadline(row.created_at),
    acknowledgedAt: row.acknowledged_at,
    isAnonymous: row.is_anonymous,
    ...flags,
  };
}

export async function fileReport(input: {
  reporterProfileId: string;
  target: ReportTarget;
  reason: ReportReason;
  isAnonymous: boolean;
  idempotencyKey: string | null;
}): Promise<ReportResult> {
  // An idempotency key is optional here, unlike A3/A4 where the offline queue always assigns
  // one — `grievance_report.idempotency_key` is nullable in the frozen schema and S13's
  // data_needs do not mention one. When absent, the duplicate-merge rule below is what makes a
  // double-tap harmless.
  if (input.idempotencyKey) {
    const existing = await repo.findReportByIdempotencyKey(pool, input.idempotencyKey);
    if (existing) {
      // Someone else's key. Refuse rather than hand back a ticket that is not theirs — the
      // same posture A3/A4 take, and here it would also disclose that a report exists.
      //
      // An anonymous ticket stores no reporter, so it can never be matched to a caller and is
      // treated as somebody else's for this purpose. The cost is small and one-sided: an
      // anonymous reporter replaying their own key gets a conflict instead of their ticket
      // back. Handing it back on the strength of a guessable key is the alternative, and that
      // is a disclosure.
      if (existing.reporter_profile_id !== input.reporterProfileId) {
        throw errors.idempotencyKeyConflict();
      }
      return view(existing, { merged: false, replayed: true });
    }
  }

  if (!(await repo.reportableTargetExists(pool, input.target))) {
    throw errors.reportedContentNotFound();
  }

  // Duplicate merge (decision §5). Only possible for a named reporter: matching needs a
  // reporter id, and an anonymous report deliberately stores none.
  if (!input.isAnonymous) {
    const open = await repo.findOpenReportByReporter(
      pool,
      input.reporterProfileId,
      input.target,
    );
    if (open) {
      // No second row. The fact that they reported twice belongs in the audit log, which is
      // where facts about a ticket live; a second row would carry its own deadline and its own
      // generated breach flag and sit open forever inflating both queue and statistics.
      await withTransaction((client) =>
        repo.appendAudit(client, {
          reportId: open.id,
          actorType: "reporter",
          actorProfileId: input.reporterProfileId,
          action: "duplicate_report_merged",
          notes: `repeat report, reason=${input.reason}`,
        }),
      );
      return view(open, { merged: true, replayed: false });
    }
  }

  const filedAt = new Date();
  try {
    return await withTransaction(async (client) => {
      const row = await repo.insertReport(client, {
        target: input.target,
        reason: input.reason,
        // The flag and the column say two different things, and both are load-bearing: the
        // flag says the reporter chose anonymity, the null says there is nobody to tell.
        reporterProfileId: input.isAnonymous ? null : input.reporterProfileId,
        isAnonymous: input.isAnonymous,
        slaDeadline: resolutionDeadline(input.reason, filedAt),
        idempotencyKey: input.idempotencyKey,
      });

      await repo.appendAudit(client, {
        reportId: row.id,
        actorType: "reporter",
        // Anonymity has to hold in the audit trail too, or it is a screen convention that any
        // later query undoes.
        actorProfileId: input.isAnonymous ? null : input.reporterProfileId,
        action: "report_filed",
        notes: `reason=${input.reason}`,
      });
      await repo.appendAudit(client, {
        reportId: row.id,
        actorType: "system",
        actorProfileId: null,
        action: "acknowledged",
        notes: "automatic acknowledgement at intake",
      });

      return view(row, { merged: false, replayed: false });
    });
  } catch (err) {
    // 23505 on idempotency_key: a concurrent duplicate won the race. Same outcome as the
    // pre-check above rather than an error — the caller's report did get filed.
    if ((err as { code?: string }).code === "23505" && input.idempotencyKey) {
      const raced = await repo.findReportByIdempotencyKey(pool, input.idempotencyKey);
      if (raced && raced.reporter_profile_id === input.reporterProfileId) {
        return view(raced, { merged: false, replayed: true });
      }
    }
    throw err;
  }
}
