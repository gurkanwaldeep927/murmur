# Runbook: Grievance / Takedown SLA Breach

**Trace:** RR-2 (trd:escalations[SLA figures]); T38 (SLA timers); T43 (legal-reviewed figures); IT Rules 2021.
**Owner:** [HUMAN: name]  **Last reviewed:** [HUMAN: date]
**Trigger:** T38 worker alert — acknowledgement SLA (24h) or resolution SLA (15-day general / 24–36h expedited, per T43 review) at risk or breached.

## Legal posture
These SLAs are statutory (IT Rules 2021), not internal targets. A breach is
recorded (`sla_breached` generated column), never hidden — the system logs
and flags, it does not block (T35). This runbook is the human response.

## Steps — at-risk (alert fired, deadline not yet passed)
1. Identify the ticket + category ([HUMAN: query/dashboard link]).
2. Expedited-category items (24–36h) jump the queue over everything including moderation-escalation work.
3. If the blocker is a legal judgment call: escalate to [HUMAN: counsel contact] immediately — do not sit on it.

## Steps — breached
1. Resolve the ticket first; record breach + reason in `grievance_audit_log` via the normal A9 path (audit trail is the defense).
2. Notify the reporter with acknowledgement + revised timeline ([HUMAN: template]). Note: `sla_breached` is operator-only per OQ-13 default; the notification is a human comms act, not a UI change.
3. Log the breach in the incident record: root cause (volume? single-founder capacity RR-3? legal ambiguity?).
4. If breaches recur in a window of [HUMAN: n] days: trigger the RR-3 staffing review — this runbook is not a substitute for capacity.

## Verification
- T59 SLA tests still green (the breach was operational, not computational).
- Audit-log entry exists for every breached ticket.
