import { config } from "../../config/index.js";
import { pool, withTransaction } from "../../db/pool.js";
import { logger } from "../../shared/logger.js";
import { emailProvider } from "../notification/email-provider.js";
import * as repo from "./grievance.repo.js";
import { SlaAlertActions } from "./grievance.repo.js";
import {
  MAX_WARNING_LEAD_MS,
  isExpedited,
  warningDueAt,
  type ReportReason,
} from "./grievance.slas.js";

/**
 * Grievance SLA job (T38) — the worker half of the legal clocks A8 starts.
 *
 * Three things it watches, and they are not the same kind of thing:
 *
 *  1. **Unacknowledged tickets.** Not a countdown. A8 acknowledges inside the intake
 *     transaction, so the 24-hour acknowledgement SLA cannot be missed by anyone being slow —
 *     which means a ticket with no acknowledgement is a DEFECT in the write path, alertable
 *     the moment it is seen and regardless of its age
 *     (decisions/a8-report-intake-slas.md §3). Building a countdown here instead would have
 *     produced a timer that can never fire, and its silence would have read as compliance.
 *  2. **Approaching resolution deadlines.** Warned at a FRACTION of the category's budget, so
 *     the expedited 24-hour clock and the general 15-day one both warn with enough time left
 *     to act. This is the only pass that can prevent a breach rather than report one.
 *  3. **Passed resolution deadlines.** Emailed once per ticket; COUNTED on every pass.
 *
 * ## Why the audit log is the job's memory
 *
 * There is no `last_alerted_at` column. Each alert writes a `grievance_audit_log` row, and the
 * absence of that row is what makes the alert due. It needs no schema change, and it puts
 * "the officer was told, at this time" into the compliance record instead of into a
 * housekeeping field.
 *
 * ## Why nothing is marked sent before it is sent
 *
 * The audit row is written only after the provider confirms delivery. Writing it first — or
 * swallowing a delivery failure — would put a line in a legal record saying somebody was
 * notified when nobody was. That is worse than no record at all, and it is the same
 * false-green failure this project has already paid for five times.
 */

const BATCH_LIMIT = 100;

export interface SlaPassResult {
  warned: number;
  breachAlerted: number;
  unacknowledgedAlerted: number;
  overdueOpen: number;
  undeliverable: number;
}

/**
 * The one place a notice's text is built. Deliberately carries the ticket id, the category and
 * the deadline — and NOTHING else. No reported content, no reporter, no author. The operator
 * opens the ticket in the console to see those; an operator mailbox is a place things get
 * forwarded from, and this product's whole promise is that a post cannot be traced to a
 * student.
 */
function noticeBody(lines: Record<string, string>): string {
  return [
    ...Object.entries(lines).map(([k, v]) => `${k}: ${v}`),
    "",
    "Open this ticket in the Murmur operator console to see the report itself.",
    "This notice deliberately contains no reported content and no reporter details.",
  ].join("\n");
}

async function alertOnce(
  recipient: string,
  reportId: string,
  action: string,
  subject: string,
  body: string,
): Promise<boolean> {
  try {
    await emailProvider.sendNotice(recipient, subject, body);
  } catch (err) {
    // Not marked sent. The next pass tries again, which is the correct behaviour for a legal
    // deadline: an undelivered warning must stay due.
    logger.error({ err, reportId, action }, "grievance SLA alert could not be delivered");
    return false;
  }
  await withTransaction((client) =>
    repo.appendAudit(client, {
      reportId,
      actorType: "system",
      actorProfileId: null,
      action,
      notes: subject,
    }),
  );
  return true;
}

/**
 * `now` is the process's clock; the candidate query bounds itself with the DATABASE's `now()`.
 * The two can differ by the round trip and by whatever clock skew exists between the app host
 * and the database host. That is safe by construction rather than by luck: the SQL side is a
 * deliberate SUPERSET filter, so the worst a disagreement can do is defer an alert to the next
 * pass — five minutes later — never drop one. Reading the database's clock into the comparison
 * as well would be tighter and would put a second source of truth for "now" into the same
 * function, which is the more expensive mistake.
 */
export async function runGrievanceSlaPass(now: Date = new Date()): Promise<SlaPassResult> {
  const result: SlaPassResult = {
    warned: 0,
    breachAlerted: 0,
    unacknowledgedAlerted: 0,
    overdueOpen: 0,
    undeliverable: 0,
  };

  result.overdueOpen = await repo.countOverdueOpenReports(pool);
  if (result.overdueOpen > 0) {
    // Every pass, so an unresolved breach cannot go quiet just because its one email was
    // already sent. This is the signal T71's alerting rules watch.
    logger.error(
      { overdueOpen: result.overdueOpen },
      "grievance reports are past their resolution deadline and still open",
    );
  }

  const candidates = await repo.findSlaCandidates(pool, MAX_WARNING_LEAD_MS, BATCH_LIMIT);
  if (candidates.length === 0) return result;

  const recipient =
    (await repo.findCurrentOfficerEmail(pool)) || config.grievanceAlertEmail || null;
  if (!recipient) {
    // Loud, once per pass rather than once per ticket, and NOT marked sent. A deadline system
    // with nobody to tell is a real gap, not a warning to be tuned out — but one line per pass
    // is what keeps it readable enough to be acted on. T42 loads the real officer details.
    logger.error(
      { pending: candidates.length },
      "grievance SLA alerts have no recipient: no grievance_officer_contact row and no " +
        "GRIEVANCE_ALERT_EMAIL set (T42). Alerts stay due and will retry.",
    );
    result.undeliverable = candidates.length;
    return result;
  }

  for (const row of candidates) {
    const reason = row.reason as ReportReason;

    if (row.acknowledged_at === null && !row.unack_alerted) {
      const sent = await alertOnce(
        recipient,
        row.id,
        SlaAlertActions.UNACKNOWLEDGED,
        "[Murmur] A grievance report was never acknowledged — this is a defect",
        noticeBody({
          Ticket: row.id,
          Filed: row.created_at.toISOString(),
          Category: reason,
          Why: "Intake acknowledges every report in the same write that creates it, so a " +
            "ticket without an acknowledgement means that write path is broken.",
        }),
      );
      if (sent) result.unacknowledgedAlerted += 1;
      else result.undeliverable += 1;
    }

    const overdue = row.sla_deadline <= now;

    if (overdue && !row.breach_alerted) {
      const sent = await alertOnce(
        recipient,
        row.id,
        SlaAlertActions.BREACH,
        "[Murmur] A grievance resolution deadline has passed",
        noticeBody({
          Ticket: row.id,
          Category: reason,
          Clock: isExpedited(reason) ? "expedited" : "general",
          "Was due": row.sla_deadline.toISOString(),
          Status: "still open",
        }),
      );
      if (sent) result.breachAlerted += 1;
      else result.undeliverable += 1;
      // No warning after the fact: a "deadline approaching" notice for a deadline that has
      // already gone is noise, and it would make the audit log read as though the officer had
      // been warned in time.
      continue;
    }

    if (!overdue && !row.warned && warningDueAt(reason, row.sla_deadline) <= now) {
      const hoursLeft = Math.round((row.sla_deadline.getTime() - now.getTime()) / 3_600_000);
      const sent = await alertOnce(
        recipient,
        row.id,
        SlaAlertActions.WARNING,
        "[Murmur] A grievance resolution deadline is approaching",
        noticeBody({
          Ticket: row.id,
          Category: reason,
          Clock: isExpedited(reason) ? "expedited" : "general",
          Due: row.sla_deadline.toISOString(),
          "Hours left": String(hoursLeft),
        }),
      );
      if (sent) result.warned += 1;
      else result.undeliverable += 1;
    }
  }

  if (result.warned || result.breachAlerted || result.unacknowledgedAlerted) {
    logger.info(result, "grievance SLA pass complete");
  }
  return result;
}

export const grievanceSlaJob = {
  name: "grievance-sla",
  intervalMs: config.grievanceSlaIntervalSeconds * 1000,
  run: async () => {
    await runGrievanceSlaPass();
  },
};
