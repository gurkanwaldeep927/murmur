---
name: write-schema
description: Produce the full database schema (docs/05-schema.md) from the TRD entities plus the UX data_needs — tables, fields, types, constraints, indexes, and relationships, all traced. Use this skill whenever writing DDL, designing the data model, defining tables or migrations, or whenever the user says "write the schema", "design the database", or "create the data model". Designed for non-interactive agentic use: every field traces to a UX data_need, a TRD entity attribute, or an API contract — speculative fields are banned.
---

# Write Schema

## Why this exists

The TRD named the entities; UX walked the flows and surfaced what data each screen
actually reads and writes — including the `NEW` fields no entity list predicted. This
stage compiles both into the one schema the ui agent will bind real field names against.
Runs **after UX** so no field is invented and **before UI** so no component binds to a
field that doesn't exist.

## Phase 0 gate (refuse to run on failure)

Read the JSON handoff blocks at the end of `docs/03-trd.md` AND `docs/04-ux.md`.
Refuse — with a one-line reason — if any of these fail:

- Either block missing, unparseable, or wrong `artifact` value
- TRD `entities` missing/empty, or UX `screens` missing/empty
- Any UX screen has an empty `data_needs` array (a screen that needs no data is either
  wrong or shouldn't gate schema — escalate, don't guess)
- Any `open_questions[].blocking == true` in either block → **STOP. Escalate verbatim.**
  An unresolved offline/sync architecture question, for example, changes the entire
  write model — designing around it is exactly the silent drop the pipeline exists to
  catch.

## Non-interactive by design — the source map

| Schema element | Source |
|---|---|
| Tables | TRD `entities` (one table per entity unless normalization demands otherwise — document the split with provenance) |
| Fields | union of: TRD `key_attributes` + UX `data_needs` (including `NEW`) + `apis` inputs/outputs |
| Types | inferred from field semantics; anything genuinely ambiguous → `[ASSUMPTION]` with the safest boring type |
| Relationships | TRD `entities[].relationships`; anything inferred beyond that cites the flow that demands it |
| Constraints | PRD `constraints` (regulatory/data) + NOT NULL/UNIQUE justified per field |
| Indexes | one per query pattern implied by a UX list/search screen — each index names its screen |
| Enums/status fields | flow states from UX (a status column's values must equal a flow's reachable states) |

## Document structure (docs/05-schema.md)

1. **Data model overview** — 3–5 sentences: store choice (from TRD stack — do not
   re-litigate it), normalization stance, migration approach (boring default: sequential
   versioned migrations).
2. **Entity-relationship summary** — text or ASCII, cardinalities explicit.
3. **Tables** — per table: purpose (one line), full field list as a table:
   field → type → nullable → default → constraint → **trace**. The trace column is
   mandatory. Trace convention (machine-checked, SG-2): fields sourced from UX use the
   exact coordinate form `UX:S3.data_needs[last_visit]` — **including fields UX marked
   `NEW:`** (the coordinate is how a NEW field proves it landed; append the origin,
   e.g. `UX:S1.data_needs[draft_state] (NEW:F1.step3)`). Non-UX sources use
   `TRD:entities[Member]` or `API:apis[2].input`. **A field with no trace does not
   ship**, and a hook diffs UX↔schema both directions — an unclaimed data_need or a
   trace to a nonexistent one is a gate failure, not a style issue.
4. **DDL** — complete, runnable, in fenced ```sql blocks, in the dialect declared in
   the handoff's `dialect` field (from the TRD stack). A hook executes sqlite DDL
   against `:memory:` and parses other dialects on every write (SG-1) — DDL that
   doesn't run doesn't ship. This is the one stage allowed to be exhaustive; the TRD
   explicitly deferred here.

### Write-model fork (SG-5 — the OQ-3 consequence table)

The TRD handoff declares the client write model. This fork is mandatory and
checklist-enforced:

- **Offline write queue** → every synced mutable table gets: client-generatable UUID
  primary keys, a `version` or `updated_at` conflict column, tombstone deletes (no
  hard DELETE on synced tables — a `deleted_at` column instead), and one
  outbox/pending-writes table with retry state. Each of these traces to the TRD's
  write-model decision, not to a UX data_need — cite `TRD:` accordingly.
- **Cache-only reads** → none of the above. Adding sync machinery anyway violates
  no-speculative-fields.
- **Write model undeclared in the TRD** → that IS the unresolved blocking question;
  Phase 0 should already have refused. If it somehow reaches this point, stop and
  escalate — never pick a side.
5. **Indexes** — each with the screen/query it serves.
6. **Data lifecycle** — retention, soft-vs-hard delete per table (regulatory constraints
   from PRD decide; silence → `[ASSUMPTION]` soft delete), PII fields flagged.
7. **Out of Scope** — ORM models, seed scripts, query optimization (plan/build).
8. **Open Questions** — owner + blocking flag.
9. **JSON handoff block** — always last, exact shape below.

## Discipline rules

- **No speculative fields.** "We might need it later" is not a trace. YAGNI is house
  style; adding a column later is a migration, not a crisis.
- **Every UX `data_needs` entry must be resolvable** to a field in some table. Any that
  can't be stored as designed → escalation, never silently dropped.
- **Boring tech wins ties**: relational unless the TRD chose otherwise; UUIDs or
  autoincrement per stack convention; timestamps on every table (`created_at`,
  `updated_at`) — the one permitted "speculative" default, flagged as house convention.
- **Natural keys are risks, not keys.** Phone numbers, emails: UNIQUE-constrained
  attributes, never primary keys (numbers get recycled, typos happen, DPDP erasure
  requests break FK chains). Flag any natural-key temptation in Open Questions.
- **WHAT is frozen. HOW (system-level) is frozen.** This stage decides shape of data
  only.

## Output format — JSON handoff

End `docs/05-schema.md` with exactly:

```json
{
  "artifact": "schema",
  "dialect": "...",
  "tables": [
    {
      "name": "...",
      "purpose": "...",
      "fields": [
        { "name": "...", "type": "...", "nullable": false, "constraint": "...", "trace": "..." }
      ],
      "relations": [ { "to": "...", "kind": "1:N|N:M|1:1", "via": "..." } ]
    }
  ],
  "indexes": [ { "table": "...", "fields": ["..."], "serves": "UX:S3" } ],
  "pii_fields": ["table.field"],
  "assumptions": ["..."],
  "escalations": ["..."],
  "open_questions": [ { "question": "...", "owner": "...", "blocking": false } ],
  "handoff": "ui"
}
```

## Handoff

The ui agent gates on `tables[].fields[].name` — components bind to these exact names.
It must refuse to run if this block is missing or malformed, or if the taste gate file
is absent.
