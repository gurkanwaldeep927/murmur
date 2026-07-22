# Quality Kit Additions — Privacy Stage, Restore Drill, Runbooks

Companion drop-in for `quality-kit/`. Closes the three gaps identified
2026-07-20: no privacy/DPDP owner, unverified backups, no operational
runbooks. Form follows the kit's own rule: an **agent** where there is an
objective signal to re-run (privacy), a **skill patch** where one procedure
extends an existing discipline (restore drill), **md files gated by an
existence check** where content is human-owned (runbooks).

## DECISION QK-7: Privacy stage (16)

`privacy-agent` + `privacy-audit` skill + `handoff-privacy.schema.json` →
`docs/16-privacy.md`. Numbered 16 because 08–15 are taken and frozen docs are
never renumbered; **execution order puts it before stage 15** — production-
test's gate-precheck consumes handoff 16 like any other (see the
production-test patch). Verification stage: gets Bash under QK-1. Rationale:
the kit verified code quality only; RR-10's failure mode (regulator, INR 50
crore ceiling) had no owner, and its checks (retention execution, erasure-vs-
ban, leakage sweeps) are repeatable objective signals — agent-shaped, not
document-shaped.

## DECISION QK-8: Runbooks + restore drill are launch-gating

Four runbooks (`runbooks/`): pepper-rotation (RR-13's named residual),
moderation-provider-outage (RR-4), takedown-sla-breach (RR-2), dpdp-breach-
notification (RR-10). Human-authored: agents verify existence, owner,
last-reviewed date, and zero remaining `[HUMAN:` markers — never content
sufficiency. Restore drill added as resilience-audit Method step 6. Both
enforced at stage 15 via PRR-27/PRR-28; retention execution via PRR-29;
privacy pass via PRR-26.

## Wiring

1. Copy `agents/privacy-agent.md` → `.claude/agents/`; `skills/privacy-audit/`
   → `.claude/skills/`; `schemas/handoff-privacy.schema.json` next to the
   other stage schemas.
2. Register stage 16 in `handofflib.py`'s stage map (same pattern as the
   hooks/handofflib-patch.md additions).
3. Apply `patches/resilience-audit-restore-drill.md` and
   `patches/production-test-prr-additions.md` to the two existing skills.
4. Copy `runbooks/` to the repo root; fill every `[HUMAN:` marker — the
   dpdp-breach-notification clock section requires counsel (bundle with T43's
   legal review).
5. Record QK-7 and QK-8 in the decisions folder.
6. Update `cadence.md` (already done if you took the revised copy shipped
   alongside this drop): privacy rows at M1/M5/M6, Layer-3 trigger for new
   PII columns.

## Plan hooks (update docs/07-plan.md accordingly)

- Runbook authoring = four **(human)** tasks, sequenced like T42/T43;
  dpdp-breach-notification's clock section joins T43's legal-review scope.
- T48's launch checklist gains: PRR-26..29 green.
- RR-13's "operational runbook item" residual → mitigated by
  runbooks/pepper-rotation.md once filled.

## Cadence summary (detail in cadence.md)

| Layer | Privacy | Restore drill | Runbooks |
|---|---|---|---|
| Continuous | — | — | — |
| Milestones | M1 warn-only (inventory + leakage baseline) · M5 blocking (grievance PII live) · M6 finalized, consumed by stage 15 | M4 first drill (with resilience gate) · recency ≤30d checked at M6 | authored by M5 (with T42/T43) |
| Triggers | migration adds a PII-classified column → inventory update + leakage re-sweep | backup mechanism/provider changes → re-drill | incident uses a runbook → post-incident review updates it |
