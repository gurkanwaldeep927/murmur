# Schema Agent v2 — Decisions SG-1..SG-5

Status: decided (delegated by Rishi, 2026-07-12). Lives here so the decisions exist in
the repo, not in chat. Supersedes nothing; extends schema stage v1 shipped in
pipeline-kit.

## SG-1 — DDL gains an external objective signal, executed by the hook layer

The PostToolUse hook (`schema-gates.py`) extracts fenced ```sql blocks from
`docs/05-schema.md` on every write and executes/parses them:

- `dialect: sqlite` → executed for real against `sqlite3 :memory:` (stdlib, blocking).
- any other dialect → parsed with `sqlglot` if installed (blocking); if sqlglot is
  absent, **warn-only** with an explicit warning line (consistent with the
  warn-before-blocking convention for new gates).

Rejected alternatives: (a) granting schema-agent Bash — amends the locked
"UI is the only Bash stage" rule and the QK-1 doc/verification split for a problem the
hook layer already solves; (b) deferring to quality-kit verifiers — surfaces the error
stages downstream, defeating gate-at-source.

## SG-2 — UX↔schema traceability is hook-checked, bidirectionally

Prose checklist attestation was intrinsic self-critique. The hook now diffs:

- **Forward:** every `(screen.id, data_need.field)` in the 04 handoff must be claimed
  by ≥1 schema field whose trace contains `UX:<screen>.data_needs[<field>]`.
- **Reverse:** every schema-field trace with a `UX:` prefix must reference a data_need
  that actually exists in 04.

Enabling convention (skill patched accordingly): schema traces for UX-sourced fields
**always** use the exact coordinate form `UX:S1.data_needs[member_name]` — including
fields UX marked `NEW:` (the coordinate is how NEW fields prove they landed). Free-text
traces are only for `TRD:` / `API:` sources.

## SG-3 — No critic agent for schema in v2

The two hooks are the critic: DDL execution and trace-diff cover everything mechanically
checkable. A semantic critic (normalization sanity, index strategy) belongs to the
quality-kit verifiers, not the tracer path. Adding one now is meta-work ahead of the
tracer — the recognized risk.

## SG-4 — Doc-only DDL; migration files are plan-stage tasks

`docs/05-schema.md` carries complete runnable DDL but the schema stage emits no
`migrations/` artifacts. Emitting runnable files from a doc-authoring stage blurs the
QK-1 boundary. `write-plan` sources a "create migration 0001 from 05-schema DDL" task
traced to `schema:tables`.

## SG-5 — OQ-3 fork is encoded at skill level, checklist-enforced

The write-schema skill now branches on the TRD's declared write model:

- **offline write queue** → completion checklist demands: client-generated UUID PKs,
  a version or `updated_at` conflict column per mutable table, tombstones (no hard
  deletes on synced tables), and an outbox/pending-writes table.
- **cache-only reads** → none of the above required; adding them anyway violates
  no-speculative-fields.

Hook-checking this was rejected for v2: "is this table mutable-and-synced" is a
semantic judgment. Standing fact unchanged: **OQ-3 itself remains a blocking gate** —
this fork defines the consequences of either answer, it does not answer the question.
