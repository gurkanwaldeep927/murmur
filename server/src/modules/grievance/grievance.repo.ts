import type { DbClient, Queryable } from "../../db/pool.js";
import type { ReportReason } from "./grievance.slas.js";

/**
 * Grievance persistence (T34) — owns `grievance_report` and `grievance_audit_log`.
 *
 * Two rules this module holds to, both of them about identity:
 *
 *  1. `reporter_profile_id` is written only when the report is NOT anonymous, and the same
 *     applies to the audit log's `actor_profile_id`. An anonymous report that left a reporter
 *     id in the audit trail would be anonymous on screen only — precisely the failure T33's
 *     schema note refuses.
 *  2. Nothing here returns the reported content's author. A report names the content, never
 *     the student behind it (NFR identity non-disclosure).
 */

export type ReportTargetType = "question" | "answer";

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
}

/**
 * Whether the reported content exists and is visible to the reporter.
 *
 * Only PUBLISHED, non-deleted content is reportable — a student cannot see anything else, so a
 * report against a held or blocked item could only come from someone guessing IDs, and
 * answering it differently would confirm the row exists. The refusal is the same
 * "content not found" either way (TRD apis[A8].errors).
 */
export async function reportableTargetExists(
  client: Queryable,
  target: ReportTarget,
): Promise<boolean> {
  const sql =
    target.type === "question"
      ? `SELECT 1 FROM question WHERE id = $1 AND deleted_at IS NULL
                                  AND moderation_status = 'published'`
      : `SELECT 1 FROM answer   WHERE id = $1 AND deleted_at IS NULL
                                  AND moderation_status = 'published'`;
  const { rows } = await client.query(sql, [target.id]);
  return rows.length > 0;
}

export interface ReportRow {
  id: string;
  question_id: string | null;
  answer_id: string | null;
  reason: string;
  is_anonymous: boolean;
  status: string;
  sla_deadline: Date;
  acknowledged_at: Date | null;
  created_at: Date;
}

const REPORT_COLUMNS = `id, question_id, answer_id, reason, is_anonymous, status,
                        sla_deadline, acknowledged_at, created_at`;

/**
 * An OPEN report the same reporter has already filed against the same content — the row a
 * duplicate merges into (decision §5).
 *
 * Scoped to `status = 'open'` on purpose: once their earlier report was resolved, a new report
 * is a genuinely new grievance (the content re-offended, or they dispute the dismissal) and
 * deserves its own ticket and its own clock.
 *
 * Never called for an anonymous report — there is no reporter to match on, which is the stated
 * cost of storing anonymity rather than styling it.
 */
export async function findOpenReportByReporter(
  client: Queryable,
  reporterProfileId: string,
  target: ReportTarget,
): Promise<ReportRow | null> {
  const column = target.type === "question" ? "question_id" : "answer_id";
  const { rows } = await client.query<ReportRow>(
    `SELECT ${REPORT_COLUMNS}
       FROM grievance_report
      WHERE reporter_profile_id = $1 AND ${column} = $2 AND status = 'open'
      ORDER BY created_at
      LIMIT 1`,
    [reporterProfileId, target.id],
  );
  return rows[0] ?? null;
}

export async function findReportByIdempotencyKey(
  client: Queryable,
  idempotencyKey: string,
): Promise<(ReportRow & { reporter_profile_id: string | null }) | null> {
  const { rows } = await client.query<ReportRow & { reporter_profile_id: string | null }>(
    `SELECT ${REPORT_COLUMNS}, reporter_profile_id
       FROM grievance_report
      WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  return rows[0] ?? null;
}

export interface InsertReport {
  target: ReportTarget;
  reason: ReportReason;
  /** Null for an anonymous report — the column and the flag say two different things. */
  reporterProfileId: string | null;
  isAnonymous: boolean;
  slaDeadline: Date;
  idempotencyKey: string | null;
}

/**
 * Create the ticket, acknowledged in the same statement.
 *
 * `acknowledged_at = now()` is not an optimisation: it is what makes the 24h acknowledgement
 * SLA structurally unbreachable, because there is no path that creates a ticket without
 * acknowledging it (decision §3). The `system` audit row written alongside is what keeps an
 * automatic acknowledgement distinguishable from a human having read the complaint.
 */
export async function insertReport(client: DbClient, input: InsertReport): Promise<ReportRow> {
  const { rows } = await client.query<ReportRow>(
    `INSERT INTO grievance_report
       (question_id, answer_id, reason, reporter_profile_id, is_anonymous,
        sla_deadline, acknowledged_at, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
     RETURNING ${REPORT_COLUMNS}`,
    [
      input.target.type === "question" ? input.target.id : null,
      input.target.type === "answer" ? input.target.id : null,
      input.reason,
      input.reporterProfileId,
      input.isAnonymous,
      input.slaDeadline,
      input.idempotencyKey,
    ],
  );
  return rows[0]!;
}

export interface AuditEntry {
  reportId: string;
  actorType: "reporter" | "operator" | "system";
  /** Must be null whenever the report is anonymous — see the module note. */
  actorProfileId: string | null;
  action: string;
  notes?: string | null;
}

export async function appendAudit(client: DbClient, entry: AuditEntry): Promise<void> {
  await client.query(
    `INSERT INTO grievance_audit_log
       (grievance_report_id, actor_type, actor_profile_id, action, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [entry.reportId, entry.actorType, entry.actorProfileId, entry.action, entry.notes ?? null],
  );
}

// ---------------------------------------------------------------------------
// Reconciliation — the check T38's acknowledgement timer should actually run.
// ---------------------------------------------------------------------------

/**
 * Tickets that exist without an acknowledgement.
 *
 * Because intake acknowledges in its own transaction, this must always be empty, and that is
 * the point: the acknowledgement SLA is no longer a countdown that could quietly expire, it is
 * an invariant. A non-empty result is a defect in the write path, not a slow operator — so
 * T38 should alert on the existence of a row here rather than on its age.
 *
 * As with the reputation drift queries (T22), an all-clear is only evidence because a test
 * deliberately breaks the invariant and checks this notices.
 */
export async function findUnacknowledgedReports(
  client: Queryable,
): Promise<{ id: string; created_at: Date }[]> {
  const { rows } = await client.query<{ id: string; created_at: Date }>(
    `SELECT id, created_at
       FROM grievance_report
      WHERE acknowledged_at IS NULL
      ORDER BY created_at`,
  );
  return rows;
}
