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

// ---------------------------------------------------------------------------
// T38 — what the SLA job needs to see.
// ---------------------------------------------------------------------------

/**
 * Actions the SLA job writes to the audit log. They are the job's ONLY memory of what it has
 * already sent — there is no `last_alerted_at` column, deliberately.
 *
 * Using the audit log as the state has two properties a column would not: it needs no schema
 * change, and "the officer was warned at 14:02" becomes part of the compliance record rather
 * than a housekeeping field. The audit log is append-only, which is also the correct shape for
 * a record of notifications sent.
 */
export const SlaAlertActions = {
  WARNING: "sla_warning_sent",
  BREACH: "sla_breach_alert_sent",
  UNACKNOWLEDGED: "unacknowledged_alert_sent",
} as const;

export interface SlaCandidate {
  id: string;
  reason: string;
  sla_deadline: Date;
  created_at: Date;
  acknowledged_at: Date | null;
  warned: boolean;
  breach_alerted: boolean;
  unack_alerted: boolean;
}

/**
 * Open tickets that might need an alert, most urgent first.
 *
 * `maxWarningLeadMs` is passed in rather than hard-coded so the SQL bound is DERIVED from the
 * SLA constants (grievance.slas.ts): a literal interval here would silently stop catching
 * warnings the moment T43 lengthens a budget, and nothing would report it. The filter is a
 * deliberate SUPERSET — the per-category warning time is computed in TypeScript, where the one
 * copy of the SLA table lives.
 *
 * Merged duplicates are excluded: a merged row is not a second obligation, and alerting on one
 * would tell the operator about work that does not exist.
 */
export async function findSlaCandidates(
  client: Queryable,
  maxWarningLeadMs: number,
  limit: number,
): Promise<SlaCandidate[]> {
  const { rows } = await client.query<SlaCandidate>(
    `SELECT r.id, r.reason, r.sla_deadline, r.created_at, r.acknowledged_at,
            EXISTS (SELECT 1 FROM grievance_audit_log l
                     WHERE l.grievance_report_id = r.id AND l.action = $1) AS warned,
            EXISTS (SELECT 1 FROM grievance_audit_log l
                     WHERE l.grievance_report_id = r.id AND l.action = $2) AS breach_alerted,
            EXISTS (SELECT 1 FROM grievance_audit_log l
                     WHERE l.grievance_report_id = r.id AND l.action = $3) AS unack_alerted
       FROM grievance_report r
      WHERE r.status = 'open'
        AND r.merged_into_report_id IS NULL
        AND (r.acknowledged_at IS NULL
             OR r.sla_deadline <= now() + make_interval(secs => $4::double precision))
      ORDER BY r.sla_deadline
      LIMIT $5`,
    [
      SlaAlertActions.WARNING,
      SlaAlertActions.BREACH,
      SlaAlertActions.UNACKNOWLEDGED,
      maxWarningLeadMs / 1000,
      limit,
    ],
  );
  return rows;
}

/**
 * How many open tickets are already past their deadline.
 *
 * Logged on every pass, not emailed on every pass. The email fires once per ticket, because an
 * alert that repeats every minute is an alert that gets filtered — but a breach that nobody
 * acts on must not become invisible either. A number on every pass is what an alerting rule
 * (T71) can watch without anyone's inbox being the mechanism.
 */
export async function countOverdueOpenReports(client: Queryable): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    `SELECT count(*) AS n FROM grievance_report
      WHERE status = 'open' AND merged_into_report_id IS NULL AND sla_deadline <= now()`,
  );
  return Number(rows[0]!.n);
}

/**
 * The grievance officer to notify — the most recent contact whose `effective_from` has
 * arrived. Null when none is configured, which is a state T42 exists to end.
 */
export async function findCurrentOfficerEmail(client: Queryable): Promise<string | null> {
  const { rows } = await client.query<{ contact_email: string }>(
    `SELECT contact_email FROM grievance_officer_contact
      WHERE effective_from <= now()
      ORDER BY effective_from DESC
      LIMIT 1`,
  );
  return rows[0]?.contact_email ?? null;
}
