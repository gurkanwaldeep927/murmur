# Claude Design — Round 4 (T30: S12 My Content & Sync Status)

**Raised:** 2026-08-09, after T27/T29/T32 built the offline queue end to end.
**Project:** `ecb9e3e6-a250-49f3-9b7a-f356994a9f54` — "Murmur email entry form"
(owner: rishi, type `PROJECT_TYPE_PROJECT`, so `list_projects` does not return it —
pass the UUID directly to `get_project` / `get_file`).
**Design contract:** `docs/06-ui.md` §2. **Brief:** §3.12. **Taste direction:** D2
(`docs/gates/taste-gate.json`).
**Screen spec:** `docs/04-ux.md` §4 S12.

---

## Why this round exists now

The backend for offline posting is finished and tested: the outbox table (T27), the batch
endpoint that receives a queue a phone wrote with no signal (T29), and the watchdog that
notices anything stuck (T32). **S12 is the only screen that shows a student any of it**, and it
has never been designed.

Building it now rather than after the client work (T28/T31) is deliberate: the states below are
facts the server already produces, so the design can be drawn against what is real instead of
against a guess — which is what round 3 had to correct.

---

## The one thing to understand before drawing anything

**There are two separate questions about every post, and they are not one chain.**

1. **Did it reach the server?** — queued → sending → arrived. This is the *sync* question.
2. **Is it visible to anyone?** — being checked → live / refused. This is the *moderation*
   question, and it is the same question S6 and S8 already answer.

`docs/04-ux.md` lists them as one sequence, which reads naturally but is not how it behaves. A
post can have **arrived at the server and still be blocked**. It can have **arrived and be
waiting for review for days** (see round 3, gap 1 — until T14b, nothing publishes at all).

**The ask:** decide whether S12 shows one merged line per item or two. One line is calmer and
risks implying a post failed to send when it actually sent fine and was refused on content. Two
is honest and risks looking like a dashboard. This is a judgment call and it is yours; the note
below on `refused` is the case that makes it matter.

---

## The states, with what is actually true behind each

### `queued` — written, not sent yet
On the phone only. The server has never heard of it. **This is the normal state offline, not an
error**, and it may last days. Nothing is lost — it is stored on the device.

### `sending`
A batch call is in flight. Typically under a second; not worth a design that assumes it lingers.

### `waiting on something else` ⚠️ **new — not in the UX spec, and it is not a failure**
A real case the spec did not anticipate. If a student writes a question offline and then answers
their own question offline, the answer cannot be sent until the question has landed. If the
question hasn't landed yet, **the answer is deliberately kept waiting rather than refused** — its
only problem is its position in a queue.

The same shape covers a post held back because too many reports were filed too quickly.

**The ask:** copy that says *this will go, just not yet* without implying anything is wrong.
It must not read as an error, and it must not read as "sent" either.

### `being checked` — arrived, awaiting moderation
Identical in meaning to S6/S8's pending card. **Reuse that copy once round 3 settles it** — two
different sentences for the same situation in two places is how a product starts feeling
unreliable. Please do not write a new one here.

### `live` / `refused on content`
Terminal moderation outcomes. `refused on content` means it arrived fine and broke the rules.

### `could not be posted` — terminal, and the reasons are not alike
The server refuses an item permanently for reasons that need very different words:

| What happened | What the student did | Tone |
|---|---|---|
| the topic no longer exists | nothing wrong | apologetic, offer to re-pick a topic |
| the question they were answering was itself refused | nothing wrong | explanatory, not blaming |
| they voted on their own answer | a rule they may not know | light, informative |
| the post they were reporting is gone | nothing wrong | neutral |

**The ask:** decide how many distinct refusal cards S12 needs. One generic card is honest but
cold at a moment where most causes are **not the student's fault**. Four is probably too many.
Brief §3.6's rule holds here: protective framing, never suspicion, never punitive.

### `conflict` — ⚠️ **please do not design this state**
The UX spec lists it. **It cannot happen.** It exists for "two versions of the same thing, newest
wins" — and nothing in this product can be edited. Every kind of thing the queue carries is a
*new* post. There is a test in the backend asserting no conflict is ever produced, so it will
start failing on the day editing is built, which is when this state needs designing and not
before. Drawing it now means drawing something no student will ever see.

---

## The account-removed case, which needs a screen and does not have one

If a student is banned while they have posts queued, the server refuses **the whole batch at
once** — not item by item — because a ban applies to the person, not to a post.

**The phone must then stop trying.** If it keeps retrying, it carries those posts for ever and
the student watches a queue that will never move.

**The ask:** a state for *"your account was removed — these posts will not be sent."* It has no
retry affordance and no reassurance that they might go later, because they will not. It should
point at the grievance-officer contact screen (S15), which is where someone who thinks this is a
mistake can act. This is the same terminal-and-final tone as S4's refused state, so please look
at that first rather than inventing a second register for it.

---

## Empty state

A student who has never posted, and a student who has posted and everything is live, are two
different situations and both land here with nothing to show. The second is a **good** outcome
and should not read like the first.

---

## What is deliberately NOT being asked for

- **No retry button.** The phone retries on its own. A button that duplicates automatic behaviour
  invites a student to tap it repeatedly during an outage and learn that tapping does nothing.
- **No "delete from queue".** Nothing in the backend supports withdrawing a queued post, and a
  control that looks live and does nothing is worse than no control (`client/src/lib/features.ts`).
- **No time estimates anywhere.** This is round 3's gap 1 in a new place. Nothing here has a
  predictable duration: not the queue (depends on signal), not moderation (nothing publishes at
  all until T14b).

---

## What lands after this

`SyncStatusList` from this round is wired up in **T31**. The client-side queue itself is **T28**.
Neither invents copy; both use what this round produces.
