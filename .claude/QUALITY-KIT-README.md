# Quality Kit — Production-Readiness Stages (08–15)

Extends the existing pipeline (`research → spec → trd → ux → schema → ui → plan`)
with post-build quality gates. Same contract as stages 01–07: every stage doc ends
in a JSON handoff block, validated by the existing PostToolUse hook via `handofflib.py`.

## Stage map

| # | Doc | Agent | Signal (external, objective) |
|---|-----|-------|------------------------------|
| 08 | docs/08-security.md | security-agent | Semgrep + gitleaks + osv-scanner/trivy exit codes & finding counts |
| 09 | docs/09-ai-security.md | ai-security-agent | promptfoo/garak run results (CONDITIONAL: only if product embeds an LLM) |
| 10 | docs/10-tests.md | test-writer-agent | none (generator — never scores itself) |
| 11 | docs/11-test-verification.md | test-verifier-agent | test runner exit code, coverage %, mutation-sample survival rate |
| 12 | docs/12-performance.md | performance-agent | k6 threshold pass/fail, EXPLAIN plans, query-count deltas |
| 13 | docs/13-observability.md | observability-agent | smoke-run log/trace/metric presence checks |
| 14 | docs/14-resilience.md | chaos-resilience-agent | fault-injection test outcomes (toxiproxy / kill-based) |
| 15 | docs/15-production-readiness.md | production-test-agent | re-execution of ALL prior signals + PRR checklist score → GO / NO-GO |

## Doctrine amendment (record in decisions folder)

**DECISION QK-1: Verification Bash.** Original hook doctrine: only the UI agent gets
Bash. Amendment: stages 08–15 are *verification* stages whose objective signal is
scanner/test-runner output, so they get Bash — restricted by the existing PreToolUse
destructive-command guard, which must be extended with the denylist in
`hooks/handofflib-patch.md`. Doc-authoring stages (01–07, minus UI) remain Bash-less.
Rationale: loop-engineering rule requires an external objective signal; for these
stages that signal is only reachable through Bash. [ASSUMPTION: PreToolUse guard can
be extended per-agent; verify against current hook matcher.]

**DECISION QK-2: PRR = production-test agent.** The report's Production-Readiness-
Review agent and the 7-skill production test agent are one role: an independent
executor/critic that re-runs everything and issues GO/NO-GO. Merged as stage 15.

**DECISION QK-3: Generator/critic split for tests.** test-writer (10) authors tests
from PRD acceptance criteria; test-verifier (11) executes and scores them. The writer
never runs its own tests; the verifier never edits tests. Findings flow back as a
structured fix-list; writer gets max 3 correction rounds (existing cap pattern).

## Enablement order (tracer-bullet)

Wave 1: security-agent → test-writer + test-verifier → production-test (thin PRR
checklist). This alone catches the failure modes with the highest documented
production impact (hardcoded secrets, missing authz, zero tests).
Wave 2: performance-agent, observability-agent.
Wave 3: chaos-resilience-agent, ai-security-agent (only when a product embeds an LLM).

Do NOT enable Wave 2/3 gates as blocking until Wave 1 has passed end-to-end once on
the gym app. New gates start in warn-only mode (schema registered, exit-2 disabled)
for one full run, then flip to blocking.

## Wiring

1. Copy `agents/*` to `.claude/agents/`, `skills/*` to `.claude/skills/`.
2. Copy `schemas/*.json` next to your existing stage 02–07 schemas.
3. Apply `hooks/handofflib-patch.md` (stage-map additions + Bash denylist).
4. Add DECISIONS QK-1..3 to the repo decisions folder.

## Non-negotiables inherited from house rules

- Non-interactive; never ask the user mid-run.
- Every claim: provenance or `[ASSUMPTION]`.
- Blocking findings become Open Questions escalated verbatim (OQ-3 rule) — a
  CRITICAL security finding is never "designed around" or waived by an agent.
  Only a human can waive, via `.pipeline/waivers/<finding-id>.json`.
- Hard iteration caps everywhere (default 3).
- Boring tech wins ties: default scanners are Semgrep, gitleaks, osv-scanner,
  k6, pytest/jest — swap only with a decisions-folder entry.

## Local implementation notes (not part of the shipped kit)

Installed 2026-07-12. The kit's "no code change needed" claim was wrong — its schemas
are draft-07 JSON Schema, not handofflib's custom format. See
`decisions/quality-kit-qk-decisions.md` for what was actually implemented: draft-07
subset validator + waiver checks + warn-only flags in `handofflib.py`, QK denylist in
`guardrail.py` (also covering the Windows PowerShell tool), stage map 08–15 in
`stop-check.py`, and frontmatter Stop hooks added to all 8 agents. All gates start
warn-only; delete `.pipeline/warn-only/<stage>` per stage after one clean run.
