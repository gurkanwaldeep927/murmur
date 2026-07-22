# PATCH: skills/production-test/SKILL.md — stage 16 intake + PRR-26..29

## Change 1 — Skill 1 (gate-precheck)
"Inputs: handoffs 08–14" becomes "Inputs: handoffs 08–14 **and 16**
(privacy)". The privacy handoff is schema-validated, sha256'd into
inputs_consumed, and its blocking OQs are collected identically. Rationale:
DECISION QK-7 — stage 16 runs before stage 15 in execution order; its number
is historical, not sequential.

## Change 2 — Skill 6 (prr-checklist): append four rows

| ID | Item | Source |
|---|---|---|
| PRR-26 | Stage 16 (privacy) status == pass; zero unwaived critical/high privacy findings | house-rule (DECISION QK-7) |
| PRR-27 | All four runbooks exist (pepper-rotation, moderation-provider-outage, takedown-sla-breach, dpdp-breach-notification), each with a named owner + last-reviewed date and zero remaining `[HUMAN:` placeholder markers | google-prr (DECISION QK-8) |
| PRR-28 | Restore drill (resilience-audit step 6) executed within the last 30 days; RPO + RTO recorded in the stage-14 handoff | google-prr — sharpens PRR-10: "a restore was exercised once" is not enough at launch; recency + measured RPO/RTO are required |
| PRR-29 | Retention enforcement verified by execution (privacy-audit step 2): expired seeded rows actually deleted by the mechanism the PII inventory names | house-rule (RR-10 residual) |

Note: PRR-10 stays as written (config + one exercised restore). PRR-28 does
not replace it; it adds the launch-recency bar.

## Change 3 — Skill 7 (readiness-verdict)
Wherever the verdict aggregates "stages 08–14", read "stages 08–14 + 16".
A privacy fail is a NO-GO on the same footing as a security fail.
