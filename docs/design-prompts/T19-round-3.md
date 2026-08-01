# Claude Design — Round 3 (T19 integration gaps)

**Raised:** 2026-08-02, during T19 (integrating S5–S8 against the real API).
**Project:** `ecb9e3e6-a250-49f3-9b7a-f356994a9f54` — "Murmur email entry form"
(owner: rishi, type `PROJECT_TYPE_PROJECT`, so `list_projects` does not return it —
pass the UUID directly to `get_project` / `get_file`).
**Design contract:** `docs/06-ui.md` §2. **Briefs:** §3.5–3.8. **Taste direction:** D2
(`docs/gates/taste-gate.json`).

---

## Why this round exists

S5–S8 were designed in T18 against mock data. Wiring them to the real backend at T19
surfaced five places where the design assumes something the API does not do. Four are
copy or a missing state; one is a layout tolerance.

**These are NOT bugs in the design.** Every one is a case where the mock data was
reasonable and the real system turned out different. They are listed here so a designer
decides them, rather than Claude Code inventing replacement copy — per the stage-6
division (`docs/06-ui.md` deviations[0]).

**What T19 shipped in the meantime** is recorded under each gap. In every case the
interim uses text the *server* already sends, so nothing was invented; the designer's
headings, layout and colour are untouched. Replacing the interim is a small, contained
edit once this round lands (tracked as **T19b**).

---

## Gap 1 — the pending card promises a wait that never ends ⚠️ highest value

**Screens:** S6 AskComposer, S8 AnswerComposer — the `pending` outcome card.

**What the design says:**

> S6: "Every post gets a quick review to keep this space safe for everyone. Yours is in
> line — **it usually takes a few minutes**, and we'll nudge you when it's live."
>
> S8: "Every post gets a quick review to keep this space safe. Yours **will appear under
> the question in a few minutes**."

**Why it is wrong:** until T14b (milestone 6) no AI moderation provider is bound. The
default adapter holds *every* submission and publishes *nothing* — that is R6's
fail-closed posture working correctly, not an outage. The true wait is **indefinite**.
There is also no notification channel, so "we'll nudge you" has nothing behind it.

RR-5 forbids rendering held content as live, and this copy does not claim it is live — so
this is not a safety breach. It is a promise the product cannot keep, made at the most
emotionally loaded moment in the whole app (brief §3.6: "the single highest-stakes
emotional moment").

**What T19 ships:** the designer's heading ("Asked — just one quick check" / "Posted —
one quick check first") and card layout, verbatim, with the paragraph replaced by the
server's own line: *"Your post is being reviewed. It'll appear once it's cleared."*

**The ask:** rewrite both paragraphs so they are true when nothing publishes for days and
still true when review takes 30 seconds. Constraints from brief §3.6: protective framing,
never suspicion, never punitive. Consider whether the card should offer something to *do*
(see gap 3) rather than a duration.

---

## Gap 2 — there is no `blocked` outcome card

**Screens:** S6, S8.

**What exists:** `published`, `pending`, `queued_offline`, and inline error strings for a
suspended account / removed parent question.

**What the API can return:** a 201 with `moderationStatus: "blocked"` — the classifier
auto-blocked the post. It is a normal, expected outcome, not an error, and it is
*terminal*: no retry will change it. Under `hold-all` it cannot occur yet, but it becomes
routine the moment T14b binds a real provider, so the gap will land at exactly the point
the product goes live.

**What T19 ships:** the shield card reused with the heading "Not published" and the
server's reason, plus a "Back to the feed" button. Functional and honest; it is not a
designed state.

**The ask:** a proper `blocked` card for both composers. Brief §3.7 already sets the tone
for the author-facing side of moderation — *"blocked state: author-only notice routing to
My Content"*, and `must_not_include: punitive blocked framing to the author*. The user
just had something they wrote refused; the card should say what happened, not imply they
are in trouble. Decide also whether the draft text stays recoverable on screen (T19 keeps
it) and what the single action is.

---

## Gap 3 — "Track it in My Posts" points at a screen that does not exist

**Screen:** S6, `pending` outcome card CTA.

**Why it is wrong:** S12 *My Content & Sync Status* is milestone 4/5 (tasks T30/T31).
There is no My Posts to open.

**What T19 ships:** the label is untouched and the button opens the **S7 thread** for the
question just created. That works — the server lets an author read their own held post,
and S7 renders it with the "Under review" chip — but the label and destination disagree.

**The ask:** either re-label the CTA for the destination that exists now (the thread), or
confirm the label and accept the mismatch until S12 lands. Same question applies to the
`published` card's "View your question", which is already accurate.

---

## Gap 4 — real pseudonyms do not look like the mock ones

**Screens:** S5, S7, S6/S8 headers.

**Mock data:** `MistyHeron`, `QuietFalcon`, `AmberLynx`, `SolarWren`, `VelvetOwl` — short
CamelCase, each with a matching animal emoji.

**Real data:** `quiet-otter-4821` — lowercase `adjective-noun-NNNN`, generated from a
20-adjective × 20-noun list plus a 4-digit disambiguator
(`server/src/modules/profile/pseudonym.ts`). Roughly twice the character count, and the
nouns are mostly **not animals**: cedar, quartz, meadow, lantern, pixel, comet, willow,
cobalt, ember, delta, maple, orbit, pebble, tundra, zephyr.

So the mock's pseudonym→emoji dictionary cannot be carried over, and the S5 card's
attribution row — avatar + pseudonym + year badge + relative time, on one flex line — has
to hold a much longer handle at 420px.

**What T19 ships:** pseudonyms rendered verbatim; the avatar chosen by a stable hash into
the designers' existing five-emoji palette, so an author always looks the same.

**The ask:** (a) confirm the S5/S7 attribution rows wrap gracefully with a
`vivid-zephyr-1007`-length handle — or restyle if not; (b) decide the avatar treatment
now that a name→animal mapping is impossible. Options worth considering: a generated
geometric/identicon mark, a colour derived from the handle, an emoji set that covers the
noun list, or dropping the avatar entirely.

---

## Gap 5 — year badge format *(confirmation only, non-blocking)*

**Screens:** S4, S5, S7, S8.

The API stores the bare enrollment year, `"2026"`. Every design chip reads `'26 batch`.
T19 added `formatYearBadge()` producing exactly the designer's format, and applied it to
S4 as well — S4 had been rendering the raw `"2026"` into that chip since T10.

**The ask:** confirm `'26 batch` is right, or specify the alternative. No design work
needed if it is.

---

## Out of scope for this round

Deliberately **not** asked for here — they belong to later milestones and already have
designs in the project:

- **S9 Search, S11 Profile** (M3, T25/T26) — S5's bottom nav points at them. Rendered
  muted with no handler until then.
- **S13 Report Content** (M5, T39) — S7's "Report quietly" overflow item. Not rendered.
- **S12 My Content & Sync Status** (M4, T30) — see gap 3.

`S1`–`S17` all already exist in the design project. T25/T30/T39 remain **copy jobs, not
design sessions** — pull the file a milestone needs at integration time.
