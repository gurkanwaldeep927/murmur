# Runbook: AI Moderation Provider Outage

**Trace:** RR-4 (trd:risks[moderation outage]); T14 (fail-closed gate); T56 (outage drill).
**Owner:** [HUMAN: name]  **Last reviewed:** [HUMAN: date]
**Trigger:** moderation-retry worker alert (backoff threshold breached), A7 error-rate alert, or provider status page incident.

## What the system does on its own (verify, don't duplicate)
Fail-closed is automatic: items hold as `pending`, retry with backoff, and
auto-escalate to the Human Escalation Queue past the threshold (T14). NOTHING
auto-publishes. Your job during an outage is queue management and comms, not
re-enabling publication.

## Hard rule
**Never bypass the gate.** No manual publish of pending UGC without an
individual human review recorded via the T36 decide route. Bypassing the gate
during an outage voids the R6 legal shield (moderation-coverage NFR).

## Steps
1. Confirm scope: provider status page + a sandbox classify call ([HUMAN: sandbox command/script path from T54 spike]).
2. Check queue depth: pending `moderation_case` count and oldest-item age ([HUMAN: query or dashboard link]).
3. If outage > [HUMAN: n] minutes: post the user-facing notice ("posts are delayed, not lost") — S12/S7 already render pending truthfully; the notice is additive. [HUMAN: where is the notice posted?]
4. Work the escalation queue (S16) by oldest-first; you are the human fallback — pace yourself against RR-3 (single-founder capacity). Triage order: [HUMAN: e.g. reports-linked first].
5. If outage > [HUMAN: n] hours: execute the provider-switch decision — second provider from the T54 shortlist. This is a DEPLOY, not a toggle, unless dual-provider support was built (it was deliberately deferred, RR-4). [HUMAN: record the switch criteria now, cold — not during the outage]
6. On recovery: confirm the retry worker drains the queue; run the T56 reconciliation query (published count == cleared count); record the incident.

## Verification
- Reconciliation query green post-recovery.
- Zero items auto-published during the outage window (audit `moderation_case.decided_by`).
