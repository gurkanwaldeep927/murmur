# Runbook: DPDP Data-Breach Notification

**Trace:** RR-10 (trd:risks[DPDP]); stage-16 privacy audit; DPDP Act 2023 + DPDP Rules.
**Owner:** [HUMAN: name]  **Last reviewed:** [HUMAN: date]
**Trigger:** confirmed or reasonably suspected unauthorized access/disclosure of personal data — including: pepper exposure (see pepper-rotation runbook), DB exfiltration, `email_encrypted` key exposure, PII found in logs/analytics by the stage-16 audit, provider-side breach at Email/OTP or moderation vendor.

## The clock
DPDP requires notification to the Data Protection Board AND affected data
principals. [HUMAN + LEGAL: confirm the current notification deadline and
form/portal under the DPDP Rules as in force — record it HERE with the date
verified. This runbook is launch-blocking until this section is filled by
counsel, per T43's review scope.]

**The clock starts at awareness, not at full diagnosis. Notify with what you
know; supplement later.**

## Steps
1. **Contain** (hour zero): revoke exposed credentials/keys, isolate the affected system. If the pepper or encryption key is implicated, execute pepper-rotation / [HUMAN: key-rotation procedure] in parallel.
2. **Preserve evidence:** snapshot logs and DB state before remediation alters them.
3. **Assess scope with the stage-16 PII inventory:** which tables/columns, how many principals. The inventory (docs/16-privacy.md) is your scoping map — this is why it exists.
4. **Notify counsel:** [HUMAN: contact + backup contact].
5. **Notify the Board** within the deadline via [HUMAN: form/portal], with: nature of breach, scope, containment taken, contact point.
6. **Notify affected students** via their registered email: what leaked, what was done, what they should do. [HUMAN: pre-draft this template NOW — with legal review — writing it mid-incident produces a bad one. Note the irony that the notification channel is the PII itself; counsel to confirm acceptable channel if email is compromised.]
7. **Remediate + record:** fix root cause; add a SECREG pinning test for it (write-tests rule 5); full incident record in the decisions folder.
8. **Post-incident:** re-run stage-16 privacy audit + stage-08 security audit in full, regardless of milestone cadence.

## Verification
- Notification timestamps vs the clock, recorded.
- SECREG test exists and is green.
- Re-run audits pass.
