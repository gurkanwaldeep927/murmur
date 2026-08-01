# `client/src/components/` — Claude Design output ONLY

Per the stage-6 human decision (docs/06-ui.md `deviations[0]`, plan `deviations[0]`),
visual component code is authored **exclusively by Claude Design** and lands here
verbatim. Claude Code never authors or restyles files in this folder — it only
*integrates* them (wiring props to the API and state machines) from `../screens/`.

## Source project

`ecb9e3e6-a250-49f3-9b7a-f356994a9f54` — "Murmur email entry form" (owner: rishi).
Its type is `PROJECT_TYPE_PROJECT`, **not** `PROJECT_TYPE_DESIGN_SYSTEM`, so DesignSync
`list_projects` does not return it; pass the UUID directly to `get_project` / `get_file`.
All 17 screens `S1`–`S17` already exist there — later rounds (T25/T30/T39) are **copy
jobs, not design sessions**.

## Landed here

| File | Screen | Round |
|---|---|---|
| `S5 QuestionFeedCard.dc.html` | S5 Home Feed | T18 |
| `S6 AskComposer.dc.html` | S6 Ask a Question | T18 |
| `S7 QuestionThread.dc.html` | S7 Question Detail / Thread | T18 |
| `S8 AnswerComposer.dc.html` | S8 Answer Composer | T18 |
| `Landing Page.dc.html` | designer-added marketing surface, pre-S1 (outside the S1–S17 inventory) | — |
| `support.js` | shared Claude Design runtime (`<x-dc>` + `DCLogic`) | — |

S1–S4 were ported at T10 and their `.dc.html` sources were **not** kept. That is why
S5–S8 are: losing sight of the design project cost a session on 2026-08-01, and the
source file is the only reference for a re-port.

## How to integrate (the T10 pattern)

Port into `../screens/<name>.ts`, keeping the designer's markup and copy **verbatim** and
replacing the mock `DCLogic` with real handlers. See `../screens/email-entry.ts` for the
worked example.

## Integration notes for T19 — read before wiring these up

Found while porting. Each is a real mismatch between what the design assumes and what the
backend currently does.

1. **The "pending" copy promises a wait that never ends.** S6 and S8 both say a held post
   "usually takes a few minutes". With no provider bound (`hold-all` default until
   **T14b/M6**) *nothing ever publishes* — the true wait is indefinite. RR-5 forbids
   rendering held content as live, and this copy does not claim it is live, but "a few
   minutes" is still untrue in the posture that actually ships. T19 must not use that
   sentence as-is while `hold-all` is the default.

2. **S7 renders voting and reputation; A6 does not exist yet.** `vote_count`,
   `reputation_score`, `accepted` and the vote button all assume the reputation ledger,
   which is **T21/T22 in M3**. At M2 these must be read-only or hidden — a vote button
   that silently does nothing is worse than no button at all.

3. **"Report quietly" targets S13, which is M5.** Both menus (question and answer) offer
   it. Disable or hide until the grievance path exists.

4. **S6 topic chips are display labels, not slugs.** The chips read `Placements`,
   `Internships`, `Professors`, `Courses`, `Advice`; A3 expects the seeded slugs
   (`placements`, …). Map via `GET /topics` rather than lowercasing — the seed is the
   source of truth, and `topic_tag.label` exists precisely so the two can diverge.

5. **S5 field names already match the API.** `pseudonym`, `year_badge`, `topic`,
   `published_at`, `answer_count`, `title`, `body` line up with `QuestionRow` in
   `server/src/modules/content/content.repo.ts`. No translation layer needed.

6. **S7's `blocked` state is exactly right** — "Only you can see this" matches the
   behaviour pinned by `test_R6_author_can_see_their_own_held_question_but_the_feed_cannot`.
   Keep that wording.

## How T19 resolved each — 2026-08-02

T19 integrated all four screens into `../screens/`. What happened to each note above, and
the two further gaps integration surfaced:

| Note | Resolution |
|---|---|
| 1 — "a few minutes" | **Deferred to Claude Design round 3** (`docs/design-prompts/T19-round-3.md` gap 1). The designer's heading and card layout ship verbatim; the paragraph renders the **server's own message** instead. No replacement copy was authored here. |
| 2 — vote / reputation | Vote control **not rendered**, behind `FEATURES.voting` in `../lib/features.ts` with the designer's markup kept in `../screens/question-thread.ts`. The accepted badge and reputation chip are *not* flagged — they render off real fields that are false/zero until M3, so they stay invisible now and appear on their own when T22 lands. |
| 3 — "Report quietly" | **Not rendered**, behind `FEATURES.reporting`. Markup kept, same pattern. |
| 4 — topic slugs | Done. Chips display `label`, submit `slug`, mapped via `GET /topics`. If that call fails the composer shows its error state rather than guessing a slug. |
| 5 — S5 field names | Half right, and worth correcting: the **route serializer**, not the repo row, is the wire shape. `content.routes.ts` renames most fields to camelCase (`moderationStatus`, `publishedAt`, `answerCount`) but leaves the author projection snake_case (`pseudonym`, `year_badge`, `reputation_score`). The client types in `../lib/content-view.ts` mirror the serializer. |
| 6 — blocked wording | Kept verbatim, as instructed. |

**Two more found during integration**, both in round 3:

7. **No `blocked` outcome card exists** on S6 or S8, but A3/A4 can return 201 with
   `moderationStatus: "blocked"`. Interim: the shield card with the server's reason
   (gap 2).
8. **Real pseudonyms are `quiet-otter-4821`**, not `QuietFalcon` — lowercase
   `adjective-noun-NNNN`, roughly double the length, and the noun list is mostly not
   animals, so the mock's name→emoji dictionary cannot be carried over. Interim: verbatim
   rendering plus a stable hash into the designers' five-emoji palette (gap 4).

Also fixed in passing: the year badge. The API stores `"2026"`; every design chip reads
`'26 batch`. `formatYearBadge()` in `../lib/format.ts` is now the single place that gap is
closed — including for S4, which had been rendering the raw year since T10.
