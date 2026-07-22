# OQ-3 — Client write model: RESOLVED

Status: decided by human owner, 2026-07-15. Lives here so the decision exists in the
repo, not in chat. Answers the standing blocker listed in
`.claude/PIPELINE-KIT-README.md` ("Standing blockers" #1).

## Decision

`write_model: offline_write_queue`

The gym app supports **offline writes**: users can create/modify data while offline;
changes are queued locally and synced when connectivity returns.

## Consequences (already encoded downstream)

- **TRD (stage 3):** trd-agent declares `write_model: offline_write_queue` in the
  `docs/03-trd.md` handoff, citing this decision as provenance — no blocking OQ is
  raised for this question.
- **Schema (stage 5):** the SG-5 write-model fork in `write-schema/SKILL.md` takes the
  offline branch — sync metadata (client-generated IDs, pending-change queue,
  conflict-resolution fields) is in scope, not speculative.
- **UX (stage 4):** offline/queued/sync-conflict states are legitimate screen states,
  not scope creep.

## What this does NOT decide

The conflict-resolution strategy (last-write-wins vs merge vs manual) is a TRD-level
design choice within the declared write model. If the PRD gives no signal, the
trd-agent picks the boring default (last-write-wins) with `[ASSUMPTION]`, per house
rules — it is not a new blocking OQ.
