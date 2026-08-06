---
name: execute-plan
description: Decide and drive what gets built next from docs/07-plan.md — next-task selection, who owns it, what to do with problems found mid-task, and what must actually be green before a task counts as done. Use this skill whenever the user asks what to work on, says "what's next", "continue the build", "start T<n>", or picks up work on the Murmur build; and whenever finishing a task, to run the definition-of-done checklist and update docs/TASK-STATUS.md. This is the missing stage between write-plan (which produced the plan) and the stage-08+ quality gates (which audit the built code).
---

# Execute Plan

## Why this exists

`docs/07-plan.md` says **which** 77 tasks exist, their order, and their dependencies. It says
nothing about **how to work through them**. So the same four questions were re-answered from
scratch in every session:

- a bug is found mid-task — fix it now, or write it down and carry on?
- who owns this task: Claude Code, Claude Design, or the human?
- what has to actually be green before a task may be called done?
- which check tells the truth, and which one lies?

That gap is structural, not carelessness. The global `workflow` skill's 15-stage map has a
literal blank row where this belongs:

```
| — | *(the plan gets executed — actual build happens here)* | | |
```

Every other stage has a skill. The stage that consumes almost all of the build time had
none. This is that stage.

**The rules below are decisions, already made. Follow them; do not re-open them per task.**
If one turns out to be wrong, change this file — that is the point of writing them down.

---

## 1. Picking the next task

### Inputs

- `docs/07-plan.md` — the trailing ```json handoff block, `tasks[]`, each with `id`,
  `task`, `milestone`, `depends_on`, `size`, `trace`. This is the frozen spec: **it carries
  no status and is never edited to record progress.**
- `docs/TASK-STATUS.md` — the live tracker. Status symbols live here and nowhere else:
  ✅ done · 🟡 half · ⬜ not started · 🔴 waiting on something outside the code.

Never trust `docs/gates/*.json` or `.pipeline/sec/*.json` for what is open. They have been
found recording findings as unfixed that were fixed days earlier. Re-check against the code.

### The rule, in order

1. **A blocking milestone gate outranks new feature work.** A milestone cannot close with
   its gate open, so work that piles on top of an open gate only makes the gate's job
   bigger. Gates are the `T6x`/`T7x` quality-kit tasks.
2. **Every `depends_on` must be ✅.** A 🟡 dependency does not count. "Half done" means the
   part you need may be the missing part.
3. **Route by owner (§2).** A task in the human or design lane is *reported*, never started,
   and the search continues to the next candidate rather than stopping.
4. **Readiness is not the same as unblocked.** A task whose dependencies are met can still
   be the wrong task: if an open gate is about to inspect an area, do not reshape that area
   first. Say so explicitly rather than silently skipping it.
5. **Ties break** toward the task that unblocks the most others, then toward the smaller
   `size`.

### The answer format

Always report in this shape, so it can be argued with:

- **The task** — id and what it means in plain words, not the plan's wording.
- **Why it is next** — which rule above selected it.
- **Who owns it** — one of the three lanes.
- **What it will touch** — the files or modules, named.
- **What would make it not-next** — the condition under which this answer changes.

---

## 2. The three lanes

| Lane | Owns | Current examples |
|---|---|---|
| **Claude Code** | backend, API, integration wiring, tests, migrations, CI, instrumentation | T20–T24, T51, gate fix-lists |
| **Claude Design** | anything visual — screens, components, copy on screens | T18, T25, T30, T39, T19b |
| **Human only** | deploys, vendor selection, legal text, secrets, gate/unlock files | T49, T54, T43, T42, T72–T75 |

**Human-lane handling:** surface it as one concrete line the user can act on, then move to
the next Claude-Code-lane task in the same reply. Do not idle on it, and do not re-raise it
every session — `docs/TASK-STATUS.md` already carries it.

**Design-lane handling:** produce the prompt/brief in `docs/design-prompts/`, never the
visual code. Landing the returned components into `client/src/screens/` is a copy job and
*is* Claude Code's lane.

---

## 3. Problems found mid-task

This is the rule that used to be re-negotiated every time. Apply it without asking.

### Fix it inside the current task when **all three** hold

- it lives in a file the task already touches,
- fixing it changes no behaviour outside the task's blast radius,
- a test for it can be added on the same branch.

### Record it and keep going when **any** holds

- it touches another module,
- it changes runtime behaviour outside the task's scope,
- it needs a human action (rotate a secret, deploy something, buy something).

Recording means: an entry in `docs/TASK-STATUS.md`'s problems section, in that file's plain
English, saying what it is, what it costs, whether it is fixed, and who owns the next move.
**It is written down, not raised as a question.** A recorded finding is visible and can be
overruled; a question stops the work.

### Stop and ask only when

- continuing would ship something known-broken or unsafe, or
- the next step would destroy data, or
- the task as specified cannot be completed and any assumption would make the work useless
  if wrong.

### Security findings

Same rule, one addition: **never silently deferred.** Always recorded, always with severity
and what it would cost if exploited, even — especially — when not fixed in this task.

---

## 4. Definition of done

A task is ✅ only when every line below has actually been run and seen. Not inferred, not
assumed from a previous run.

1. `npm run typecheck` **and** `npm run typecheck:client`
   — **after** the tests are written. The root tsconfig type-checks `tests/`, so a test that
   imports a client module pulls it into the server program. Running typecheck before the
   tests exist checks the wrong thing; CI caught exactly this on 2026-08-06.
2. `npm run lint` — zero errors.
3. `npm run sql:check` — every statement plans cleanly. TypeScript cannot see inside SQL
   strings; this is the only thing that can.
4. `npx vitest run tests/unit` locally — fast, no database.
5. **CI green on the pushed branch** — the authoritative signal for anything touching the
   database (§5). Read the run's `conclusion`, not a summary.
6. `docs/TASK-STATUS.md` updated in the same turn: the symbol, the score line, the date, the
   "what to do next" section, and any problems found.
7. Merged to `main` with `--no-ff`, on a branch named for the task.

Never mark ✅ on an agent's claim, a gate JSON, or a previous session's note. Only on a
signal reproduced in this session.

---

## 5. Which check tells the truth

Two facts that have each cost this project real days.

### Database tests are verified on CI, not on this laptop

The local suite talks to a Supabase pooler in Sydney. Every query is a round trip: about
**15 minutes** for a full run on a good day, and on a bad one a single test sat for
**28 minutes** before the connection died and took its whole file with it. **Three tests in
`tests/integration/content.test.ts` fail on a completely clean tree.** A local red therefore
proves nothing by itself.

CI runs its own `postgres:16` on the same machine as the tests and finishes in about a
minute. So:

- locally: `tests/unit`, plus at most the one integration file being worked on;
- for anything else: push the branch and read CI.

There is no Docker on this machine, so a local Postgres is not currently an option.

### Never read an exit code through a pipe

`cmd | tail` reports `tail`'s exit code, not `cmd`'s. A verification run was reported green
on 2026-08-05 when four test files had failed. Use `${PIPESTATUS[0]}`, redirect to a file
and check separately, or query the result directly (`gh run view --json conclusion`).

**The general form, and this project's most-repeated lesson:** a green tick is worth exactly
what it is reporting on. Check what that is before trusting it.

---

## 6. Never

- **Never write `.pipeline/unlock`.** It gates the security stages and must contain the
  stage prefix (`08`). A human writes it. A guard an agent can lift for itself is not a
  guard — the precedent was set when T60 refused to self-grant its own unlock (OQ-SEC-06).
- **Never write `docs/gates/taste-gate.json`.** Human-only, always.
- **Never write visual design code.** That lane belongs to Claude Design.
- **Never edit frozen docs 01–07** to record progress or work around a gap. Write to
  `decisions/` instead — the pattern `decisions/oq-14-session-mechanism.md` set.
- **Never design around a CRITICAL finding or a blocking open question.** Report it verbatim
  and name its owner.

---

## 7. When invoked

**No arguments** ("what's next", "/execute-plan"): run §1 and answer in the §1 format. If the
top candidate is human- or design-owned, say so in one line and give the next Claude-Code
task in the same reply.

**With a task id** ("/execute-plan T20"): confirm its dependencies against §1 rules 2 and 4,
state the lane, then plan the work — plan mode first, always, per the standing rule — and on
approval drive it through §4.

**On finishing any task**: run §4 in order and report each result, including anything that
failed. Then update `docs/TASK-STATUS.md` before saying the task is done.

---

## Current state of the lanes (verify, do not trust — last checked 2026-08-06)

- **Blocking now:** T62, the M2 security gate. Blocked on an *empty* `.pipeline/unlock`,
  which behaves exactly like a missing one and is invisible in a directory listing. Needs
  the literal `08`, written by the human.
- **Human lane, unblocking the most:** T49 (staging deploy → unblocks T11 and closes M1) and
  T54 (moderation vendor quotes → unblocks T14b, which is what finally lets any post go
  public).
- **Recorded and not fixed:** the database pool has no `error` listener
  (`server/src/db/pool.ts`) — a dropped idle connection becomes an unhandled crash and
  prints the database password. See `docs/TASK-STATUS.md` problem #4.
