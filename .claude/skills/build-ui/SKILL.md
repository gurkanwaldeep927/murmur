---
name: build-ui
description: Build the UI layer (docs/06-ui.md + src/ui/) from the schema, the UX screens, and the human-selected design direction — components bound to real schema field names, verified through a render/screenshot loop with a hard iteration cap. Use this skill whenever building screens, components, or the frontend from a completed schema, or whenever the user says "build the UI", "implement the screens", or "code the frontend". The ONLY pipeline stage with Bash access; the render/screenshot loop is its external objective signal.
---

# Build UI

## Why this exists

Every upstream stage exists so this one can't hallucinate: screens and states come from
UX, field names come from schema (bind to them **exactly** — a component reading
`member.lastVisit` when the schema says `last_visit_at` is a gate failure, not a style
choice), and taste comes from a human. This stage converts contracts into rendered,
screenshot-verified components.

## Phase 0 gate (refuse to run on failure)

Three inputs, all mandatory:

1. `docs/05-schema.md` handoff: `artifact == "schema"`, `tables` non-empty.
2. `docs/04-ux.md` handoff: `screens` non-empty (states + data_needs are the build spec).
3. `docs/gates/taste-gate.json`: must exist, must contain `selected_direction` matching
   a `design_directions[].id` from the UX handoff, and `approved_by` (a human name).
   **Absent or machine-authored → STOP.** Taste has no objective signal; this gate is
   human-only by design. Never write this file yourself. Never infer a selection.
4. Any `open_questions[].blocking == true` in either handoff → **STOP. Escalate verbatim.**

## Skill composition (compose, don't build)

This stage runs on existing design skills, in this order of authority:

1. **Anthropic frontend-design skill** — baseline craft: typography, spacing, hierarchy.
2. **Impeccable** — run its init first if not yet run; use its critique pass as the
   design half of the critic (see loop below).
3. **UI/UX Pro Max** — component-level patterns and states.
4. **Vercel web-design-guidelines** — the **objective correctness auditor**: contrast,
   focus states, touch targets, semantic HTML. Its checks are pass/fail, which is what
   makes them admissible as a loop signal.

Conflicts between skills: the taste-gate direction wins on aesthetics; Vercel's
guidelines win on correctness (accessibility is not a taste question).

## The render/screenshot loop (external signal, hard cap)

Generator and critic are **separate passes — never self-score in the same pass that
wrote the code.**

Per screen:

1. **Build** the component(s), binding to schema field names verbatim, implementing all
   four UX states (empty/loading/error/success).
2. **Render + screenshot** via Bash (dev server or static render + headless capture) —
   one screenshot per state. The screenshot is the external signal; code that "should
   look right" doesn't count.
3. **Critic pass** (fresh eyes, checklist-driven — never freeform vibes):
   - All four states present and visually distinct in screenshots?
   - Every `data_needs` field visible/capturable, bound to a real schema field?
   - Vercel guideline pass/fail items?
   - Direction adjectives from taste-gate recognizably present?
4. **Fix and repeat.** **Hard cap: 3 iterations per screen.** At cap with failures
   remaining: record the deficit in Open Questions (owner: human, blocking if a P0
   flow is broken) and move on. Never loop past cap; never silently declare victory.

Track iterations in `.pipeline/ui-iterations.json` (`{"S1": 2, ...}`) — the Stop hook
enforces the cap from this file.

## Document structure (docs/06-ui.md)

1. **Build summary** — stack (from TRD — do not re-litigate), selected direction and
   who approved it, screens built vs. deferred.
2. **Component inventory** — table: component → screen(s) → schema fields bound →
   states implemented → screenshot paths → iterations used.
3. **Deviations** — anywhere the build diverged from UX/schema, with reason. An
   undocumented deviation is a gate failure.
4. **Screenshot manifest** — path per screen per state under `docs/screenshots/`.
5. **Out of Scope** — backend wiring, deployment, tests (plan agent schedules those).
6. **Open Questions** — including any at-cap deficits. Owner + blocking flag.
7. **JSON handoff block** — always last, exact shape below.

## Discipline rules

- **Schema field names are law.** No renames, no camelCase "improvements" — a mapping
  layer, if the stack demands one, is documented in Deviations.
- **Boring components win ties**: platform-standard controls over custom ones unless
  the taste direction explicitly demands otherwise.
- **Bash is scoped**: render, screenshot, dev-server, package install. Not migrations,
  not deploys, not touching `docs/01–05`. The PreToolUse guardrail enforces this;
  don't test it.
- **Provenance or `[ASSUMPTION]`, no third option.**

## Output format — JSON handoff

End `docs/06-ui.md` with exactly:

```json
{
  "artifact": "ui",
  "direction": { "id": "D2", "approved_by": "..." },
  "components": [
    {
      "name": "...",
      "screen": "S1",
      "fields_bound": ["members.last_visit_at"],
      "states": ["empty", "loading", "error", "success"],
      "screenshots": ["docs/screenshots/S1-success.png"],
      "iterations": 2
    }
  ],
  "deviations": [ { "from": "UX:S3 | schema:members", "change": "...", "reason": "..." } ],
  "deferred": ["..."],
  "assumptions": ["..."],
  "escalations": ["..."],
  "open_questions": [ { "question": "...", "owner": "...", "blocking": false } ],
  "handoff": "plan"
}
```

## Handoff

The plan agent gates on `components` and `deferred` — deferred screens become scheduled
tasks, at-cap deficits become risks. It must refuse to run if this block is missing or
malformed.
