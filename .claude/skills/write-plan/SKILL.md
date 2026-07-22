---
name: write-plan
description: Produce the delivery plan (docs/07-plan.md) — milestones, dependency-ordered tasks, test strategy, and carried-forward risks — from the full pipeline (PRD through UI). Use this skill whenever writing the build plan, sequencing tasks, defining milestones, or whenever the user says "write the plan", "break this into tasks", or "what do we build first". Designed for non-interactive agentic use: every task traces to a P0, NFR, or a deferred/deficit item from an upstream handoff — orphan tasks are banned, and the first milestone is always a tracer bullet.
---

# Write Plan

## Why this exists

Six documents of contracts are worthless if the build order is wrong. This terminal
stage compiles everything into a dependency-ordered plan whose first milestone is a
**tracer bullet**: the thinnest end-to-end slice that exercises one P0 through real UI,
real schema, real integration. Depth comes after the tracer proves the spine — the same
discipline this pipeline applies to itself.

## Phase 0 gate (refuse to run on failure)

Read handoff blocks from `docs/02-prd.md`, `docs/03-trd.md`, and `docs/06-ui.md`
(UX and schema arrive transitively via UI's bindings, but read `docs/04-ux.md` and
`docs/05-schema.md` handoffs too for their escalations and open questions). Refuse if:

- Any of the three primary blocks is missing, unparseable, or has the wrong `artifact`
- PRD `p0_requirements` empty, or UI `components` empty
- Any `open_questions[].blocking == true` **anywhere in the five handoffs** → **STOP.
  Escalate verbatim.** The plan is where silently-dropped questions would otherwise get
  buried forever; this gate is the last line.

## Non-interactive by design — the source map

| Plan element | Source |
|---|---|
| Milestone 1 (tracer) | the single P0 with the shortest complete path through UI `components` |
| Tasks | P0s not yet satisfied + UI `deferred` + backend/API work from TRD `apis` + migrations from schema `tables` |
| Test strategy | TRD `nfrs` (each NFR's `measurement` becomes a test task) + UI at-cap deficits |
| Dependencies | schema → API → UI binding order per flow; integrations from TRD `integrations` |
| Risks | union of `escalations` + `risks` from every upstream handoff — **nothing dropped** |
| Estimates | `[ASSUMPTION]` always — no source can ground an estimate; sized as S/M/L, never hours |

## Document structure (docs/07-plan.md)

1. **Delivery summary** — 3–5 sentences: tracer scope, milestone count, the one risk
   most likely to reorder everything.
2. **Milestone 1 — Tracer bullet** — named P0, the exact vertical slice (screen →
   API → table), and its demo criterion ("a real member checks in on a real phone").
   Everything else is explicitly out of this milestone.
3. **Milestones 2..N** — each with a theme, its P0s, and an exit criterion sourced from
   the PRD acceptance criteria.
4. **Task list** — table: ID → task → milestone → depends-on → size (S/M/L
   `[ASSUMPTION]`) → **trace**. Trace column mandatory: `PRD:p0[2]`, `TRD:nfrs[1]`,
   `UI:deferred[0]`, `schema:tables[members]`. **A task with no trace does not ship.**
5. **Test strategy** — per NFR: the test, when it runs, what failing blocks. Plus the
   external-signal rule: every automated loop in the build (CI, linting) named with its
   signal and cap.
6. **Risk register** — every upstream escalation and risk, carried forward with current
   status: open / mitigated-by-task-ID / accepted-by-human. "Accepted" requires a name.
7. **Open Questions** — anything still unanswerable, owner + blocking flag. Blocking
   questions here mean the plan itself is provisional — say so in the summary.
8. **JSON handoff block** — always last, exact shape below.

## Discipline rules

- **Tracer first, always.** A plan that front-loads infrastructure or "foundations"
  before an end-to-end slice fails the completion checklist.
- **No orphan tasks, no orphan risks.** Every task traces up; every upstream escalation
  traces down into the register. Run the diff explicitly: list upstream escalations,
  check each off.
- **WHAT/HOW frozen.** The plan sequences; it never rescopes. An unbuildable P0 at this
  point is a blocking escalation to the human, full stop.
- **Estimates are assumptions.** S/M/L only; the moment a number of hours appears,
  it's fiction wearing a suit.

## Output format — JSON handoff

End `docs/07-plan.md` with exactly:

```json
{
  "artifact": "plan",
  "tracer": { "p0": "p0_requirements[n]", "slice": "S1 → apis[0] → members", "demo_criterion": "..." },
  "milestones": [
    { "id": "M1", "theme": "...", "p0s": ["..."], "exit_criterion": "..." }
  ],
  "tasks": [
    { "id": "T1", "task": "...", "milestone": "M1", "depends_on": [], "size": "S|M|L", "trace": "..." }
  ],
  "risk_register": [
    { "risk": "...", "source": "trd:escalations[0]", "status": "open|mitigated:T4|accepted:<name>" }
  ],
  "assumptions": ["..."],
  "escalations": ["..."],
  "open_questions": [ { "question": "...", "owner": "...", "blocking": false } ],
  "handoff": "build"
}
```

## Handoff

Terminal stage: `"handoff": "build"` signals the pipeline is complete and execution
moves to humans + Claude Code working the task list. The Stop hook still validates this
block — the last document is not exempt from the rules it enforces on everyone else.
