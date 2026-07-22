---
name: privacy-audit
description: Method for stage-16 privacy/data-protection verification — PII inventory, retention-enforcement execution, consent presence, erasure-vs-ban legal basis, and PII leakage across responses, logs, analytics, and third parties. Used by privacy-agent.
---
# privacy-audit

## Method

1. **PII inventory (the spine of the audit).** Enumerate every table from the
   schema handoff (Murmur: 14 tables) and every column. Classify each column:
   `direct-pii` (email_encrypted, contact fields), `pseudonymous-keyed`
   (email_hash — keyed HMAC, pepper server-held), `content-pii-possible`
   (free-text UGC, grievance descriptions), `non-pii`. For every non-`non-pii`
   column record four fields: purpose, retention duration (from the T43
   decision), deletion mechanism (job/trigger/manual), legal basis. Any field
   MISSING => finding (high if `direct-pii`, medium otherwise). The inventory
   table goes in the doc verbatim — it is the artifact a regulator would ask
   for first.

2. **Retention enforcement — execute, never infer.** Against an ephemeral test
   DB: seed rows with timestamps past the decided retention duration, run the
   deletion mechanism the inventory names, assert the rows are gone and
   in-scope backups/exports are documented as expiring too. No deletion
   mechanism exists => **critical** (this is RR-10's residual: a decided
   duration with no enforcement clock). Retention duration not yet decided
   (T43 pending) => blocking OQ, owner human/legal, restated verbatim.

3. **Consent presence.** Verify the T43 consent copy renders in the live
   S1/S4 onboarding flow (not merely exists in the repo), that consent is
   captured before any PII write, and that the captured record (timestamp +
   copy version) is queryable. Copy still placeholder => high, launch-blocking
   via PRR.

4. **Erasure vs ban durability (the deliberate tension).** Execute the
   deletion path: delete a test account, then assert (a) `email_encrypted`,
   profile PII, and content attribution are erased or irreversibly detached;
   (b) `ban_record.email_hash` survives (TRD:nfrs[ban durability] requires
   it); (c) a documented legal-basis note exists for (b) — keyed-HMAC
   pseudonymization with server-held pepper, retained for platform-safety
   purposes. Erasure incomplete => critical. Note missing => high, owner
   human/legal. The agent never judges the note's legal sufficiency.

5. **Leakage sweep.** Three surfaces, each sampled from runtime, not just
   grepped: (a) API responses — re-run the T55 non-disclosure audit across
   *all* implemented routes including operator routes (S16/S17 show more than
   student routes; verify they show no raw email either); (b) logs — trigger
   error paths, capture logs, assert no PII/secrets (feeds PRR-14); (c)
   `analytics_event` payloads — fire the instrumented events (T45/T51–T53),
   inspect stored payloads for PII. Any hit => high minimum.

6. **Third-party data flows.** For each TRD integration record: what data
   crosses (Email/OTP provider: address — unavoidable, minimal; AI moderation
   provider: UGC text — assert requests carry NO identity fields, verify by
   capturing an actual A7 request in the test env), whether a DPA/terms link
   is recorded in the decisions folder. Identity fields in a moderation
   request => critical. Unrecorded processor => medium.

7. **Existence checks (human-owned content; verify presence only).**
   `runbooks/dpdp-breach-notification.md` exists, is not placeholder (no
   `[HUMAN:` markers remain), names an owner and the notification clock.
   Missing/placeholder => high (PRR-27 makes it NO-GO at launch).

8. **Output:** inventory + findings + counts into the stage-16 handoff shape.
   Finding ids `PRV-<n>`. Severity heuristic when unsure: keep the higher.
