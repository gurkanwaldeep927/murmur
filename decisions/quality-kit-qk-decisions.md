# Quality Kit — Decisions QK-1..QK-3 (+ local implementation notes)

Status: decided (shipped with quality-kit, installed 2026-07-12). Extends the pipeline
with production-readiness stages 08–15.

## QK-1 — Verification Bash

Original hook doctrine: only the UI agent gets Bash. Amendment: stages 08–15 are
*verification* stages whose objective signal is scanner/test-runner output, so they get
Bash — restricted by the PreToolUse guard's quality-kit denylist (`QK_DESTRUCTIVE` in
`guardrail.py`): git reset --hard, download-piped-to-shell, package publishes, docker
system prune, terraform destroy, aws delete verbs, and docker kill/stop/pause/rm outside
the `qk-chaos-*` namespace. A human may create `.pipeline/unlock` for a deliberate
override. Doc-authoring stages (01–07, minus UI) remain Bash-less (test-writer, stage
10, has no Bash — see QK-3).

The kit's `[ASSUMPTION: PreToolUse guard can be extended per-agent]` resolved to: the
guard is global, not per-agent — the denylist applies to every Bash/PowerShell call,
which is strictly safer and required no matcher changes.

## QK-2 — PRR = production-test agent

The Production-Readiness-Review agent and the 7-skill production test agent are one
role: an independent executor/critic that re-runs every prior signal from scratch and
issues GO/NO-GO. Merged as stage 15. No "GO with conditions" — conditions are NO-GO
reasons.

## QK-3 — Generator/critic split for tests

test-writer-agent (10) authors tests from PRD acceptance criteria; test-verifier-agent
(11) executes and scores them. The writer never runs its own tests; the verifier never
edits tests. Findings flow back as a structured `fix_list_for_writer`; max 3 rounds
tracked in `.pipeline/test-loop.json`, then a blocking Open Question.

## Local implementation notes (2026-07-12)

- The kit's schemas are **draft-07 JSON Schema**, not the custom minimal format the
  kit README claimed would "just work". `handofflib.py` gained a stdlib-only draft-07
  subset validator (`_js_validate`: type/const/enum/pattern/minimum/minItems/required/
  properties/additionalProperties/items) and `load_schema` now resolves both
  `handoff-<stage>.json` (custom) and `handoff-<stage>.schema.json` (draft-07).
- Waiver validity (`check_waivers`) and per-stage warn-only flags
  (`.pipeline/warn-only/<stage>`) implemented per `hooks/handofflib-patch.md`.
  Waiver files are guard-blocked for agents (Write/Edit and shell).
- Kit agents shipped without frontmatter Stop hooks; they were added on install
  (house doctrine: agents carry their Stop hook), wired to `stop-check.py <stage>`,
  whose stage map now covers 08–15.
- All 8 gates start in warn-only mode per the kit's enablement order. Delete
  `.pipeline/warn-only/<stage>` after one clean end-to-end run, Wave 1 first
  (security → test-writer/verifier → production-test).

## QK-7 — Privacy stage (16) *(additions drop, 2026-07-20)*

`privacy-agent` + `privacy-audit` skill + `handoff-privacy.schema.json` →
`docs/16-privacy.md`. Numbered 16 because 08–15 are taken and frozen docs are never
renumbered; **execution order puts it before stage 15** — gate-precheck consumes
handoff 16 like any other. Verification stage: Bash under QK-1. Rationale: the kit
verified code quality only; RR-10's failure mode (regulator; DPDP penalties to INR
50 crore) had no owner, and its checks (retention execution, erasure-vs-ban,
leakage sweeps, third-party flows) are repeatable objective signals — agent-shaped,
not document-shaped. The agent never judges legal sufficiency; missing legal
decisions are findings with owner human/legal. Cadence: M1 warn-only (inventory +
leakage baseline), M5 blocking (grievance PII live), M6 finalized → consumed by 15.

## QK-8 — Runbooks + restore drill are launch-gating *(additions drop, 2026-07-20)*

Four human-authored runbooks in `runbooks/` (pepper-rotation — RR-13's named
residual; moderation-provider-outage — RR-4; takedown-sla-breach — RR-2;
dpdp-breach-notification — RR-10). Agents verify existence, owner, last-reviewed
date, and zero remaining `[HUMAN:` markers — never content sufficiency. Restore
drill added as resilience-audit Method step 6 (first executed at the M4 resilience
gate; staging only, sandbox rule). Enforced at stage 15 via PRR-27/PRR-28;
retention execution via PRR-29; privacy pass via PRR-26. PRR-10 stands; PRR-28
adds the launch-recency bar (≤30 days, RPO/RTO recorded).

## Local implementation notes (2026-07-20, additions drop)

- `handofflib.py`: prefix regex extended to 16; `"16": "privacy"` in
  STAGE_BY_PREFIX; `privacy` added to WAIVER_STAGES.
- `stop-check.py`: `privacy: 16-privacy.md` in DOC map; fallback glob widened.
- `privacy-agent.md` installed with the house Stop-hook frontmatter
  (`stop-check.py privacy`), same as the other quality-kit agents.
- `.pipeline/warn-only/privacy` created — first pass non-blocking per the
  kit's enablement rule; delete after one clean run (cadence: blocking from M5).
- Cadence doc installed at `.claude/QUALITY-KIT-CADENCE.md`.
