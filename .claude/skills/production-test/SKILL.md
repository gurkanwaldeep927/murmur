---
name: production-test
description: Method for stage-15, the final independent gate. Composes 7 sub-skills — gate-precheck, security-reverify, suite-reverify, load-reverify, resilience-spotcheck, prr-checklist, readiness-verdict — to re-execute every prior quality signal from scratch and issue GO/NO-GO. Used by production-test-agent. Trusts reproduced signals only, never prior claims.
---
# production-test — 7 composed skills

Principle: stage 15 is a critic of both the codebase AND the pipeline. Prior
handoffs are hypotheses; only reproduction confirms them. Any mismatch between
a reproduction and a prior handoff is a critical finding regardless of
direction (better-than-claimed is also a pipeline-integrity failure).

## Skill 1 — gate-precheck
Inputs: handoffs 08–14 and 16 (privacy — runs before this stage in execution order per DECISION QK-7; its number is historical). Method: extract + jsonschema-validate each against its
schema; sha256 each handoff block into `inputs_consumed`; verify every cited
waiver file exists and is unexpired; collect all blocking OQs — any open one
=> refuse, restate verbatim, exit. Output: validated input set + hashes.

## Skill 2 — security-reverify
Inputs: stage-08 tool_runs (tools + versions + invocations). Method: re-run
the exact invocations with pinned versions; diff finding counts by severity
against the stage-08 handoff. New critical/high since stage 08 => critical
finding (drift); count mismatch on same code state => critical (integrity).
Output: reexecution row {stage:security, reproduced, matches_handoff}.

## Skill 3 — suite-reverify
Inputs: stage-10 runner command, stage-11 results. Method: clean environment,
run full suite + coverage once. Compare pass/fail/skip and coverage% (±1%
tolerance for coverage float noise; zero tolerance on failures). Flaky
deltas are failures — a suite that passes "usually" is red for production.
Output: reexecution row.

## Skill 4 — load-reverify
Inputs: committed `perf/` k6 scripts, stage-12 handoff. Method: re-seed data
per the perf skill, run each script once at expected load only (2x-peak
belongs to stage 12; this is a regression check). k6 threshold exit codes
decide. p95 regression >20% vs stage-12 recorded values => finding even if
thresholds still pass. Output: reexecution row.

## Skill 5 — resilience-spotcheck
Inputs: stage-14 fault_injections. Method: seed an RNG (seed recorded in the
doc), pick 2 injections, re-run per the resilience-audit sandbox rules,
compare observed behavior. Output: reexecution row + seed.

## Skill 6 — prr-checklist
Method: score every item below with verdict + evidence (file:line, captured
output, or handoff field path). Verdicts: pass / fail / n/a (with reason) /
waived (valid waiver id). Minimum output: all items, no skips.

| ID | Item | Source |
|---|---|---|
| PRR-1 | Zero unwaived critical/high across stages 08,09,11,12,13,14,16 | house-rule |
| PRR-2 | Config via environment; zero literals for secrets/URLs in code | 12-factor |
| PRR-3 | Secrets in a manager or deploy-injected env, never in repo history | owasp-asvs |
| PRR-4 | AuthN on all non-public endpoints | owasp-asvs |
| PRR-5 | AuthZ (ownership/role) verified per state-changing endpoint | owasp-asvs |
| PRR-6 | Input validation at every trust boundary | owasp-asvs |
| PRR-7 | Rate limiting on auth + expensive endpoints | owasp-asvs |
| PRR-8 | Dependencies pinned via lockfile; SCA clean | aws-well-architected |
| PRR-9 | DB migrations are versioned, ordered, reversible-or-documented | 12-factor |
| PRR-10 | Backups configured AND a restore was exercised once | google-prr |
| PRR-11 | Suite green, coverage >= threshold, no unverified criteria | house-rule |
| PRR-12 | Load thresholds pass at expected load (this run) | google-prr |
| PRR-13 | Every list endpoint paginated; no unbounded queries | google-prr |
| PRR-14 | Structured logs, PII/secret-free (stage 13 + reverified sample) | google-prr |
| PRR-15 | Golden signals instrumented; alert rules in repo | sre-golden-signals |
| PRR-16 | Health endpoint verifies real dependencies | google-prr |
| PRR-17 | Timeouts + deliberate retry policy on every external call | aws-well-architected |
| PRR-18 | Graceful degradation observed for each critical dependency | aws-well-architected |
| PRR-19 | Deploy is repeatable from clean checkout (documented, one command) | 12-factor |
| PRR-20 | Rollback procedure documented and mechanically plausible | google-prr |
| PRR-21 | Stateless app processes (session/state in backing services) | 12-factor |
| PRR-22 | Runaway-cost guards on metered externals (LLM/SMS/payment APIs) | house-rule |
| PRR-23 | If LLM-embedding: stage 09 probes ran; LLM01/02/08 items closed | owasp-asvs |
| PRR-24 | Blocking OQs across 01–14: zero open | house-rule |
| PRR-25 | Traceability: sampled 5 PRD criteria walk PRD→test→verification | house-rule |
| PRR-26 | Stage 16 (privacy) status == pass; zero unwaived critical/high privacy findings | house-rule (QK-7) |
| PRR-27 | All four runbooks exist (pepper-rotation, moderation-provider-outage, takedown-sla-breach, dpdp-breach-notification), each with named owner + last-reviewed date and zero remaining `[HUMAN:` markers | google-prr (QK-8) |
| PRR-28 | Restore drill (resilience-audit step 6) executed within the last 30 days; RPO + RTO recorded in the stage-14 handoff | google-prr (QK-8; sharpens PRR-10) |
| PRR-29 | Retention enforcement verified by execution (privacy-audit step 2): expired seeded rows actually deleted by the mechanism the PII inventory names | house-rule (RR-10 residual) |

## Skill 7 — readiness-verdict
GO iff ALL: every reexecution row reproduced=true and matches_handoff=true;
PRR checklist has zero fail; zero unwaived critical/high anywhere; zero open
blocking OQs. Else NO-GO with each reason quoted verbatim (finding id or
checklist id + evidence). No conditional GO exists. NO-GO routes to the
owning stage; stage 15 reruns fresh — it never loops internally (cap: 1).
