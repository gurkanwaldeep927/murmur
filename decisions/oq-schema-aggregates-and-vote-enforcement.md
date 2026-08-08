# Cached-aggregate maintenance, and where vote rules are enforced

**Decided:** 2026-08-08, during T21 (migration 003).
**Resolves:** the two `engineering`-owned open questions `docs/05-schema.md` §7 left for the
build stage, and which `docs/07-plan.md` T21 names as this task's job to close.
**Why this file and not the schema doc:** docs 01–07 are frozen. The pattern set by
`decisions/oq-14-session-mechanism.md` is that a gap in a frozen document is answered here,
with attribution, rather than by editing the document.

---

## Question 1 — how are the cached aggregates maintained?

> *"`pseudonymous_profile.reputation_score`, `question.answer_count` and `answer.vote_count`
> are cached aggregates; the exact maintenance mechanism (synchronous app-layer update on
> write vs. an async recomputation job) is left to the build stage."*
> — `docs/05-schema.md` §7, owner: engineering, blocking: false

### Decision

**Synchronous, in the same transaction as the event that changes the number** — not an async
recomputation job, and not a database trigger.

The ledger (`reputation_event`) remains the source of truth. The cached columns are a read
optimisation and are always derivable from it.

### Why

This is not a new decision so much as the one the codebase already made and did not write
down. `question.answer_count` is already maintained exactly this way — in
`server/src/modules/moderation/moderation.gateway.ts`, the parent's count is incremented at
the moment an answer becomes visible, inside the publish path. Choosing anything else for
`vote_count` and `reputation_score` would mean two different mechanisms for three columns
with identical semantics, and the next person would have to learn which is which.

Three properties made it the right call rather than merely the consistent one:

- **The number is never briefly wrong.** An async job leaves a window where a student
  upvotes and the score they are looking at has not moved. In a product whose entire
  reward loop is "your answer was useful", that window is the feature failing.
- **It cannot drift silently.** A recomputation job that dies keeps the app serving stale
  numbers with nothing raising a flag. That is this project's most-repeated failure shape
  and it has cost real days four times (`docs/TASK-STATUS.md`, problems 8–11e). A
  synchronous update inside the transaction either commits with the ledger row or does not
  commit at all.
- **Volume does not justify the alternative.** Async recomputation earns its complexity at
  write rates a single campus will not reach for a long time. If it ever does, the ledger is
  already there and a job can be added without changing the schema.

### What it costs

- Every vote pays one extra `UPDATE` inside its transaction, and that update takes a row
  lock on the subject's profile row. Two people upvoting the same author at the same instant
  serialise briefly. Acceptable at this scale; it is the thing to look at first if voting
  ever feels slow.
- A bug in the update path can leave the cache disagreeing with the ledger. **Mitigation,
  and it is not optional:** T22 must ship a reconciliation query — cached value versus
  `SUM(delta)` from the ledger — in the same shape as T56's moderation reconciliation, so a
  divergence is detectable rather than believed impossible. Recorded here so it is a
  requirement on T22 rather than a hope.

### If this turns out wrong

Reversible without a migration. The columns stay; only the code that writes them changes.
Switching to an async job later is additive, and the ledger means the correct values can
always be recomputed from history.

---

## Question 2 — is enforcing vote rules in the schema a double-enforcement conflict?

> *"Self-vote prevention is implemented as a `BEFORE INSERT` trigger on `reputation_event`;
> duplicate-vote prevention is a partial unique index. Both are schema-level enforcement of
> the A6 error contracts — flagged for review at build time to confirm no double-enforcement
> conflict with app-layer validation."*
> — `docs/05-schema.md` §7, owner: engineering, blocking: false

### Decision

**Keep both layers. There is no conflict, because the two layers have different jobs.**

- **The database is the rule.** The trigger and the partial unique index are what make
  self-voting and double-voting *impossible*, including under concurrency and including from
  any future code path that forgets to check.
- **The application layer is the message.** A6 must return a specific, truthful error for
  each case (`self-vote forbidden`, `duplicate vote`, `banned actor`, `target not found`).
  It checks first so the student gets that error rather than a database exception.

The binding rule for T22: **the app-layer check may never be the only check, and a database
rejection may never surface as a generic 500.** T22 maps the trigger's `self-vote forbidden`
exception and the unique-index violation (`23505` on
`uniq_reputation_event_actor_answer_upvote`) onto the same two A6 error responses the
pre-check produces. The student cannot tell which layer refused them, and that is the
intended outcome.

### Why not pick one

- **App layer only** loses the race. Two upvote requests arriving together both pass a
  `SELECT`-then-`INSERT` check and both commit. The partial unique index is the only thing
  that can refuse the second one, because it is evaluated at write time.
- **Database only** produces a raw exception where the contract specifies a named error, and
  costs a failed transaction to discover something a cheap read already knew.

### What it costs

The rule exists in two places, so a future change to it has to be made in two places. That is
a real cost and the reason this file exists: the pairing is deliberate, and anyone deleting
the "redundant" app-layer check should know they are changing the error contract, while
anyone deleting the "redundant" database constraint should know they are re-opening a race.

### Verification

`tests/integration/reputation-schema.test.ts` (T21) asserts the database half directly —
self-vote refused, second upvote by the same actor refused, a different actor's upvote
allowed, repeat `accepted_answer` allowed, system penalties with a NULL actor not colliding.
It deliberately tests the constraints with no application code in the path, because the
claim being made is that the database holds the line on its own.
