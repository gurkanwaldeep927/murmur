# A6 — what a vote and an accept actually mean

**Decided:** 2026-08-08, during T22.
**Why this file:** `docs/03-trd.md` specifies A6's shape (`POST /answers/{id}/vote`,
`POST /answers/{id}/accept`), its inputs, its outputs and four errors. It does **not** say who
may accept, what an accept is worth, what an upvote is worth, or whether a question can have
more than one accepted answer. `docs/04-ux.md` F5 says only "Student reading an answer on S7
taps upvote or accept-answer". Docs 01–07 are frozen, so the gaps are answered here, following
`decisions/oq-14-session-mechanism.md`.

Everything below is a **build-stage decision, not an upstream requirement**. Each one is
reversible; where reversing costs something, that is stated.

---

## 1. Who may accept an answer

**Only the author of the question.**

"Accepted" answers the question *"did this solve your problem?"*, and exactly one person is in
a position to know. If any reader could accept, the marker would mean "somebody liked this",
which is what the upvote already means — two controls doing one job, and the more valuable
signal lost.

The question's author is identified by `question.author_profile_id`, which is already how
authorship is established everywhere else. Anyone else gets `403 accept_not_question_author`.

**Cost:** a question whose author never returns can never have an accepted answer, even when
one obviously deserves it. Accepted count is therefore an undercount of usefulness, and the
`answer liquidity` metric (R8) should be read against upvotes, not accepts. An operator
override is not built — it would need the M5 console and nothing depends on it yet.

## 2. Can the question's author accept their own answer?

**No — refused, and refused by the database as well as the code.**

Ask a question, answer it yourself, accept it: reputation from nothing. It is the same cheat
as self-voting, and R5's whole premise is reputation "with something to lose", which requires
that it cannot be manufactured.

Migration 003's `prevent_self_vote()` trigger — taken verbatim from the frozen schema §4 —
guards `event_type = 'upvote'` **only**. That is a real gap in the frozen DDL, not an
intentional allowance: the schema wrote the trigger against A6's named error ("self-vote
forbidden") and the accept path simply was not considered. **Migration 009 widens the trigger
to cover `accepted_answer` as well.**

Widening rather than adding a second trigger keeps one function as the answer to "can this
actor credit this answer", so a future third event type has one obvious place to be added.

**Cost:** a genuinely self-answered question — you found the answer yourself and want to
record it for the next person — cannot be marked accepted. That is a real and reasonable use,
and it is being refused to close a cheat. If it matters later, the honest fix is a distinct
event type worth zero reputation, not loosening this.

## 3. Can a question have more than one accepted answer?

**No. One accepted answer per question, and it cannot be moved.**

A second accept returns `409 answer_already_accepted`.

Enforced at the database by a partial unique index on `(question_id) WHERE accepted`, not only
in code — same reasoning as the duplicate-vote index: two accepts arriving together would both
pass an application-layer read.

**Cost, and it is the weakest decision here:** a student who accepts the wrong answer by
mistake is stuck with it. Un-accepting was not built because the reputation delta is already
in an append-only ledger, so reversing it means writing a compensating negative event — a
whole path with its own abuse questions ("accept, un-accept, re-accept to farm"), and nothing
upstream asks for it. **Reversible later** by adding a compensating event type; the ledger
shape already supports it, which is precisely why it can wait.

## 4. What a vote and an accept are worth

| Event | Delta | Who receives it |
|---|---|---|
| `upvote` | **+1** | the answer's author |
| `accepted_answer` | **+15** | the answer's author |
| `violation_penalty` | (set by the issuing path, negative) | the offender |

**These two numbers are `[ASSUMPTION]`.** No upstream document sets them; the PRD says only
that reputation "accrues from helpful contribution (e.g. upvotes / accepted answers) and can be
lost". They live as named constants in `reputation.service.ts` so changing them is one edit
rather than a search.

The 1:15 ratio says an accepted answer is worth roughly fifteen upvotes — chosen so that
solving someone's actual problem outranks being agreeable, which is the behaviour the product
wants and the opposite of what a pure-upvote economy rewards.

**Cost:** changing the numbers later does **not** retroactively change existing scores, because
the ledger stores the delta that was applied at the time, not a reference to the current
constant. That is deliberate — a score should not silently move because a constant changed —
but it does mean a re-tune leaves a mixed-vintage ledger. Recomputing history would be a
migration written on purpose.

## 5. Where each rule is enforced

Per `decisions/oq-schema-aggregates-and-vote-enforcement.md`: **the database makes the rule
true, the application produces the message.** Both layers, always.

| Rule | Database | Application |
|---|---|---|
| self-vote | `trg_prevent_self_vote` | pre-check → `403 self_vote_forbidden` |
| self-accept | same trigger, widened by migration 009 | pre-check → `403 self_vote_forbidden` |
| duplicate upvote | `uniq_reputation_event_actor_answer_upvote` | pre-check → `409 duplicate_vote_forbidden` |
| second accept on one question | `uniq_answer_accepted_per_question` | pre-check → `409 answer_already_accepted` |
| not the question's author | — | `403 accept_not_question_author` |
| banned / suspended actor | — | `requireSession`, unchanged |
| answer not found | FK | `404 answer_not_found` |

The database errors are caught and translated, so a race that beats the pre-check produces the
same response the pre-check would have. A student cannot tell which layer refused them.

`accept_not_question_author` has no database half, and that is honest rather than an omission:
"is this caller the question's author" is an authorisation question about the request, not an
integrity property of the row. Postgres would need the caller's identity to check it.

## 6. Cached scores, and proving they are right

`answer.vote_count`, `answer.accepted` and `pseudonymous_profile.reputation_score` are updated
in the **same transaction** as the ledger row, per the T21 decision.

That decision required T22 to make a disagreement detectable rather than assumed impossible.
`findReputationDrift()` in `reputation.repo.ts` is that check: it compares every cached score
against `SUM(delta)` over the ledger, and every cached vote count against the ledger's upvote
rows, and returns the rows that disagree. It is exercised two ways in
`tests/integration/reputation-vote.test.ts` — that normal voting leaves no drift, and that a
deliberately corrupted cache **is** caught. A reconciliation query nobody has watched fail is
not evidence of anything, which this project has learned the expensive way (`TASK-STATUS.md`
problems 8–11e).

It is a query, not a scheduled job. Wiring it into the worker belongs with T32's
reconciliation-audit pattern, and doing it here would duplicate that.
