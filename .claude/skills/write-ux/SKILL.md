---
name: write-ux
description: Produce the UX document (docs/04-ux.md) from a validated TRD — user flows, screen inventory, per-screen states, per-screen data requirements, and 2–3 design directions for the human taste gate. Use this skill whenever writing UX flows, screen maps, interaction design, or "what screens do we need" from a TRD, or whenever the user says "write the UX", "map the flows", or "screen inventory". Designed for non-interactive agentic use: every flow traces to a P0, every screen traces to a flow, and data requirements are the primary handoff the schema agent depends on.
---

# Write UX

## Why this exists

The TRD froze the system-level HOW. This stage exists **before schema** for one reason:
walking the flows reveals data requirements the schema must capture — fields no entity
list predicts (last-seen timestamps, draft states, sort preferences, denormalized
counters for list screens). The `data_needs` arrays in this document's handoff are the
schema agent's primary input. Treat them as the deliverable; the flows are how you
derive them honestly.

## Phase 0 gate (refuse to run on failure)

Read the JSON handoff block at the end of `docs/03-trd.md`. Refuse — with a one-line
reason — if any of these fail:

- Block missing, unparseable, or `artifact != "trd"`
- `components`, `apis`, or `entities` missing or empty
- Any `open_questions[].blocking == true` → **STOP. Escalate the question verbatim.**
  Never design around a blocking question (this is the OQ-3 rule).

Also read `docs/02-prd.md` handoff for `p0_requirements`, personas/ICP, and `non_goals`.
If the PRD handoff is missing, refuse — UX without a WHAT is fiction.

## Non-interactive by design — the source map

| UX section | Source |
|---|---|
| Personas in play | PRD ICP / positioning `target_audience` |
| User Flows | one flow per `p0_requirements[n]`, steps grounded in TRD `apis` |
| Screen Inventory | derived from flow steps; every screen names the flows that need it |
| Per-screen States | mandatory four: empty, loading, error, success — error text sourced from TRD `apis` error cases or `[ASSUMPTION]` |
| Data Needs | per screen: every field displayed or captured, traced to a TRD `entities[].key_attributes` item, an `apis[]` input/output, or flagged `NEW` with the flow step that demands it |
| Navigation model | inferred from flows; anything ambiguous → Open Question |
| Design Directions | 2–3 named directions (see taste gate) |
| Open Questions | TRD non-blocking OQs carried forward + everything unanswerable above |

## Document structure (docs/04-ux.md)

1. **Personas in play** — 2–4 lines each, provenance to PRD.
2. **User Flows** — one per P0. Numbered steps: actor → action → system response →
   screen. Each flow ends at a success state that satisfies the P0's acceptance
   criterion. A flow that can't reach success is an **escalation**, not a redesign.
3. **Screen Inventory** — table: screen → purpose (one line) → flows served → entry
   points. A screen serving zero flows gets cut, not documented.
4. **Screen Detail** — per screen: the four states, primary action, `data_needs`
   (field name in plain words, read/write, source trace or `NEW`).
5. **Navigation model** — top-level structure in text (tabs/stack/drawer), no visuals.
6. **Design Directions** — 2–3 directions for the taste gate. Each: a name, 3–5
   adjectives, one reference archetype ("dense like Linear", "warm like Headspace"),
   and what it optimizes for. **No mockups, no colors, no fonts** — direction, not
   execution. Do NOT pick one. Taste has no objective signal; a human does.
7. **Out of Scope** — visual design (ui agent), field types/DDL (schema agent),
   copywriting beyond error/empty states.
8. **Open Questions** — owner + blocking flag.
9. **JSON handoff block** — always last, exact shape below.

## Discipline rules

- **Every flow → P0. Every screen → flow. Every data_need → trace or `NEW`.** `NEW`
  fields are the whole point of running UX before schema — surface them proudly, with
  the flow step as provenance.
- **WHAT is frozen.** No new features, no dropped P0s. A P0 that can't be expressed as
  a completable flow becomes an escalation.
- **States are not optional.** A screen documented without its empty and error states
  fails the completion checklist.
- **Provenance or `[ASSUMPTION]`, no third option.**
- Boring navigation wins ties: standard patterns over novel ones unless a P0 demands it.

## Output format — JSON handoff

End `docs/04-ux.md` with exactly:

```json
{
  "artifact": "ux",
  "flows": [
    { "id": "F1", "name": "...", "serves": "p0_requirements[n]", "screens": ["S1", "S2"], "success_state": "..." }
  ],
  "screens": [
    {
      "id": "S1",
      "name": "...",
      "purpose": "...",
      "flows": ["F1"],
      "states": ["empty", "loading", "error", "success"],
      "data_needs": [
        { "field": "...", "mode": "read|write", "trace": "entities[Member].key_attributes[phone] | apis[n] | NEW:F1.step3" }
      ]
    }
  ],
  "navigation": { "model": "...", "top_level": ["..."] },
  "design_directions": [
    { "id": "D1", "name": "...", "adjectives": ["..."], "archetype": "...", "optimizes_for": "..." }
  ],
  "assumptions": ["..."],
  "escalations": ["..."],
  "open_questions": [ { "question": "...", "owner": "...", "blocking": false } ],
  "handoff": "schema"
}
```

## Handoff

Two consumers: the **schema agent** gates on `screens[].data_needs` (its Phase 0
contract), and the **human taste gate** consumes `design_directions` — the human writes
their selection to `docs/gates/taste-gate.json`, which the ui agent gates on. Neither
proceeds if this block is missing or malformed.
