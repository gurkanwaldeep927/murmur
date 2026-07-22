# Pipeline Kit — stages 4–7 (ux → schema → ui → plan)

Drop-in for the product pipeline repo. Everything here was tested against fixtures
(9/9 passing) before shipping — external signal, not self-critique.

## Install

```bash
# from repo root
cp -r skills/*        .claude/skills/
cp    agents/*.md     .claude/agents/
cp    hooks/*.py      .claude/hooks/
cp    schemas/*.json  .claude/schemas/
mkdir -p docs/gates .pipeline
cp gates/taste-gate.template.json docs/gates/   # human fills + renames to taste-gate.json when UX is done
```

Then merge `settings.hooks.json` into `.claude/settings.json`. The agents already carry
their Stop hook in frontmatter (per doctrine); the `SubagentStop` block in the snippet
is a **fallback** for Claude Code versions without frontmatter hooks — enable one
mechanism, not both, or the checklist runs twice.

## What enforces what (the three-hook doctrine, implemented)

| Hook | File | Enforces |
|---|---|---|
| PostToolUse (Write\|Edit) | `validate-handoff.py` | JSON handoff block on every `docs/0N-*.md` write, per `schemas/handoff-*.json`; exit 2 feeds errors back; 3-attempt correction cap tracked in `.pipeline/handoff-fix-attempts.json` |
| Stop (agent frontmatter → SubagentStop) | `stop-check.py <stage>` | Doc exists + valid handoff; UI iteration cap (3) from `.pipeline/ui-iterations.json`; taste gate present for UI. A **valid** block with a blocking OQ is a legitimate escalation exit. `stop_hook_active` = one forced continuation max (loop-safety cap on the enforcer itself) |
| PostToolUse (Write\|Edit) | `schema-gates.py` | SG-1: DDL in `docs/05-schema.md` executed against sqlite `:memory:` (or sqlglot-parsed for other dialects; warn-only if sqlglot absent — `pip install sqlglot` to make it blocking). SG-2: bidirectional UX↔schema trace diff — dropped data_needs and phantom traces fail the write |
| PreToolUse (Write\|Edit\|Bash) | `guardrail.py` | Prior-stage docs frozen once a later stage exists (`.pipeline/unlock` containing e.g. `02 03` permits deliberate retrofits); `taste-gate.json` is human-only; destructive bash blocked (force-push, rm -rf, DROP/TRUNCATE, shell writes into docs/) |

## The human taste gate

UX emits 2–3 `design_directions` and never selects. You copy the template to
`docs/gates/taste-gate.json`, set `selected_direction` + `approved_by`. The ui-agent's
Phase 0 refuses without it; the guardrail blocks any agent from writing it.

## Known limits / deliberate choices

- **Schemas for 02/03 are the retrofit *target*** (IDs, structured entities, carried
  OQs). Your current PRD/TRD blocks will fail them — that's the point. Add `02 03` to
  `.pipeline/unlock` while retrofitting; delete the file after.
- Validator is a hand-rolled required-keys checker (stdlib only) — boring tech over a
  jsonschema dependency. Upgrade only if a real failure demands it.
- UX↔schema traceability is now hook-enforced (SG-2, `schema-gates.py`). The
  remaining prose-only trace check is escalations→plan risk register; next candidate
  hook after the tracer run.
- Schema-agent v2 decisions (SG-1..SG-5, incl. the OQ-3 write-model fork) live in
  `decisions/schema-agent-v2.md` — copy into the repo decisions folder and commit.

## Local additions (not part of the shipped kit)

- **Stage 3 (TRD) drafted locally, 2026-07-12**: `agents/trd-agent.md` + `skills/write-trd/SKILL.md`,
  matched to `schemas/handoff-trd.json`. The hooks already supported the stage
  (`stop-check.py trd`, `handofflib` 03-prefix mapping). `write_model` was added to
  the schema's required keys so the validator enforces the SG-5 dependency the
  write-schema skill declares.
- **Windows adaptation**: `guardrail.py` + the PreToolUse matcher also cover the
  `PowerShell` tool (with `Remove-Item -Recurse -Force` and `Set-Content`/`Out-File`
  into stage docs as destructive patterns) — the shipped kit only scanned `Bash`.

## Standing blockers (unchanged by this kit)

1. **OQ-3 (offline write model)** — RESOLVED 2026-07-15: `offline_write_queue`
   (offline writes supported). See `decisions/oq-3-write-model.md`. The trd-agent
   cites that decision as provenance instead of raising a blocking OQ.
2. **Run the tracer before deepening anything here.** These stages are lean by design.
