---
name: write-trd
description: Produce the technical requirements document (docs/03-trd.md) from a validated PRD — architecture pattern, stack, components, entities, API contracts, NFRs, integrations, and the client write-model decision. Use this skill whenever writing a TRD, designing system architecture, defining API contracts or entities from a PRD, or whenever the user says "write the TRD", "design the architecture", or "what's the technical design". Designed for non-interactive agentic use: every component and API traces to a P0 or an NFR — speculative architecture is banned, and the write model is declared or escalated, never guessed.
---

# Write TRD

## Why this exists

The PRD froze the WHAT. This stage freezes the system-level HOW — the architecture,
contracts, and entities every later stage builds against: UX walks its flows against
these `apis` and sources error-state text from their error cases, schema derives its
tables from these `entities`, and the write-model declaration forks the entire shape
of the schema (SG-5). It deliberately defers: fields/types/DDL (schema stage), screens
and flows (ux stage), visual design (ui stage), task sequencing (plan stage). A TRD
that names a table column or a screen has overreached.

## Phase 0 gate (refuse to run on failure)

Read the JSON handoff block at the end of `docs/02-prd.md`. Refuse — with a one-line
reason — if any of these fail:

- Block missing, unparseable, or `artifact != "prd"`
- `p0_requirements` missing or empty
- Any `open_questions[].blocking == true` → **STOP. Escalate the question verbatim.**
  Never architect around a blocking question.

Also read `docs/01-research.md` if present for constraints (platform, budget, timing
thesis); its absence is tolerable — the PRD is the contract.

## Non-interactive by design — the source map

| TRD section | Source |
|---|---|
| Architecture pattern | smallest pattern that serves every P0 + NFR; boring default (monolith + relational store) unless a P0/NFR forces otherwise — quote which |
| Stack | PRD platform constraints; silence → `[ASSUMPTION]` boring defaults. MUST name the store dialect — SG-1 executes the schema stage's DDL in it |
| Write model | PRD connectivity/offline requirements decide `offline_write_queue` vs `cache_only_reads`; ambiguous → blocking Open Question (the OQ-3 rule), never a guess |
| Components | derived from P0 clusters; each: one-line responsibility, `talks_to`, provenance to the P0/NFR that demands it |
| Entities | the nouns the P0s operate on; business-level `key_attributes` + relationships, no types |
| APIs | one contract per read/mutation the P0s demand: inputs, outputs, error cases |
| NFRs | PRD non-functional statements; house defaults flagged `[ASSUMPTION]`; every one measurable |
| Integrations | external services a P0 forces (payments, SMS, auth); each with a failure posture |
| Risks | what breaks the architecture if wrong; each with mitigation or escalation |
| Open Questions | PRD non-blocking OQs carried forward + everything unanswerable above |

## Document structure (docs/03-trd.md)

1. **Architecture overview** — pattern, one paragraph of why, provenance.
2. **Stack** — client, server, store (+ dialect), infra. One line of why each.
3. **Write model** — the declaration plus its consequence summary, or the blocking OQ.
4. **Components** — table: name → responsibility → talks_to → provenance.
5. **Entities** — per entity: key attributes (names in plain words), relationships.
   No field types, no keys, no DDL — schema owns those.
6. **API contracts** — per API: contract (method/path or equivalent), inputs, outputs,
   error cases, P0 served.
7. **NFRs** — table: dimension → target → measurement → provenance.
8. **Integrations** — service, purpose, failure posture.
9. **Risks** — risk → blast radius → mitigation or escalation.
10. **Out of Scope** — DDL/fields (schema), screens/flows (ux), visual design (ui),
    sequencing (plan).
11. **Open Questions** — owner + blocking flag.
12. **JSON handoff block** — always last, exact shape below.

## Discipline rules

- **Every component and API → a P0 or an NFR.** "We'll need it eventually" is not
  provenance — speculative architecture is the schema stage's speculative-fields sin,
  one level up.
- **Boring tech wins ties.** Novelty needs a P0 or NFR that demands it, quoted.
- **The WHAT is frozen.** No new features, no dropped P0s; a P0 no reasonable
  architecture can serve is an escalation, not a redesign.
- **Entities stay business-level.** Attribute names, not column definitions.
- **Write model is a decision, not a default.** Undeclarable from the PRD → blocking
  OQ owned by a human. This single key forks the entire schema (SG-5).
- **Error cases are contracts.** The ux stage writes screen error states from `apis[].errors`
  — an API documented without error cases starves stage 4.
- **Provenance or `[ASSUMPTION]`, no third option.**

## Output format — JSON handoff

End `docs/03-trd.md` with exactly:

```json
{
  "artifact": "trd",
  "architecture_pattern": "...",
  "stack": { "client": "...", "server": "...", "store": "...", "dialect": "sqlite" },
  "write_model": "offline_write_queue | cache_only_reads",
  "components": [
    { "name": "...", "responsibility": "...", "talks_to": ["..."], "provenance": "prd.p0_requirements[n]" }
  ],
  "entities": [
    { "name": "Member", "key_attributes": ["name", "phone", "plan"], "relationships": ["Member 1-n Payment"] }
  ],
  "apis": [
    { "id": "A1", "name": "...", "contract": "POST /members", "inputs": ["..."], "outputs": ["..."], "errors": ["..."], "serves": "p0_requirements[n]" }
  ],
  "nfrs": [
    { "dimension": "latency", "target": "...", "measurement": "...", "provenance": "prd | [ASSUMPTION]" }
  ],
  "integrations": [
    { "service": "...", "purpose": "...", "failure_posture": "..." }
  ],
  "risks": [
    { "risk": "...", "mitigation": "..." }
  ],
  "out_of_scope": ["..."],
  "assumptions": ["..."],
  "escalations": ["..."],
  "open_questions": [ { "question": "...", "owner": "...", "blocking": false } ],
  "handoff": "ux"
}
```

## Handoff

Three consumers gate on this block: the **ux agent** requires non-empty `components`,
`apis`, and `entities`, grounds its flow steps in `apis`, and sources error-state text
from `apis[].errors`; the **schema agent** derives tables from `entities`, forks on
`write_model` (SG-5), and emits DDL in `stack.dialect` (SG-1); the **hooks** validate
this block against `handoff-trd.json` on every write and at stop. A blocking
`open_questions` entry here (e.g. an unresolved write model) correctly halts the
pipeline at stage 4's gate — that is the design working, not a bug.
