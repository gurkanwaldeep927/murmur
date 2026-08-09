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
| `S9 SearchPanel.dc.html` | S9 Search | T25 |
| `S10 TopicBrowseList.dc.html` | S10 Topic Browse | T25 |
| `S11 ProfileCard.dc.html` | S11 My Profile | T25 |
| `S13 ReportContentModal.dc.html` | S13 Report Content | T39 |
| `S14 MyReportsList.dc.html` | S14 My Reports | T39 |
| `S15 GrievanceContactPanel.dc.html` | S15 Grievance Officer Contact | T39 |
| `S16 EscalationQueueTable.dc.html` | S16 Operator: Escalation Queue | T39 |
| `S17 GrievanceResolutionPanel.dc.html` | S17 Operator: Grievance Resolution | T39 |
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

## Integration notes for T26 — read before wiring S9–S11

Written at T25 (2026-08-09) when these three landed. Every claim below was checked against
the code named beside it, not against a document. The pattern is the T18/T19 one: the value
of a landing round is this list, not the file copy.

**The headline: S10 and S11 are wireable today; S9 is not.** S10's data (`GET /topics`,
`GET /questions?topic=`) and S11's data (`GET /session`) both exist. S9 has no endpoint at
all. If T26 is ever split, that is where the seam is.

### S9 SearchPanel

1. **There is no search endpoint, and that is the whole of T20.** `GET /questions` is
   browse; `content.service.ts:199` says so in its own comment. So S9's loading, results,
   no-matches and error states have **no source whatsoever** today. Nothing here is a
   mismatch to repair — it is the reason T26 lists T20 as a dependency.

2. **The batch filter needs a wire parameter that nobody has designed.** The chips are the
   display strings `'23 '24 '25 '26` and the mock filters with
   `item.year_badge.includes(this.state.batch)`. The real `year_badge` is `"2026"`, so that
   substring match happens to work and is coincidence, not design. T20 must decide two
   things the client cannot: the parameter shape (a year integer, surely, not `'26`) and
   whether the chip set is hard-coded or derived from what exists. Recorded here so T20
   designs it rather than T26 guessing it.

3. **`resultLabel` states something false when a filter is on.** It appends `· all batches`
   unconditionally, so a search filtered to `'25` renders *"4 questions found · all
   batches"*. That is mock logic, not markup — the integration recomputes the label from the
   filters actually applied. Left as-is in the file because this folder is verbatim.

4. **The result card is a *second copy* of the feed card, not a reuse.** §3.9's
   `must_include` says "results list (reuses feed card)". Two copies of the same card drift
   the moment one is touched. T26 should render `../screens/question-feed.ts`'s card and
   treat S9's copy as reference only.

5. **Wire shape is the serializer's, not the repo's** — the correction T19 already had to
   make once (note 5 above). S9's mock reads `published_at`, `answer_count`, and `topic` as
   a plain string. `questionView` in `../../../server/src/modules/content/content.routes.ts:25`
   sends `publishedAt`, `answerCount`, and `topic: { slug, label }`, while the author
   projection stays snake_case (`pseudonym`, `year_badge`). `../lib/content-view.ts` already
   mirrors this.

6. **Topic chips are labels again — third time.** `All / Placements / Internships /
   Professors / Courses / Advice`; the seed is lowercase
   (`server/migrations/002_content.up.sql:125-129`). Map via `GET /topics`, exactly as T19
   resolved note 4. The `All` chip is client-only and has no slug — do not send it.

7. **Pseudonym, avatar emoji and year badge are the T19 note-8 gap again.** `QuietFalcon` /
   `🦅` / `'25 batch` versus the real `quiet-otter-4821` / no emoji / `"2026"`. Both fixes
   already exist and must be reused, not rebuilt: `formatYearBadge()` in `../lib/format.ts`
   and the stable-hash-into-five-emoji approach in `../screens/question-feed.ts`.

8. **Which queries are invalid is T20's call, not a regex in the design.** The mock decides
   with `/[<>{}\\]/` client-side. The *copy* is good and should survive ("That search got a
   bit tangled — try fewer symbols or a simpler phrase"); the *rule* must come from what the
   server actually rejects, or the client will show a friendly error for a query that would
   have worked.

9. **Two dead links to honour:** "or browse by topic instead" → S10, and "Be the first to
   ask" → S6 with the query pre-filled. Today `href="#"` and `noop`.

### S10 TopicBrowseList

10. **The five hard-coded slugs match the seed exactly** (`placements`, `internships`,
    `professors`, `courses`, `advice`). Combined with `GET /questions?topic=<slug>` already
    existing (`content.routes.ts:153`), the tile grid and its per-topic list are wireable
    **without waiting for T20**.

11. **The per-tile question count has no source.** Tiles render `{{ t.count }} questions`
    (42, 28, 19, 33, 51). `listActiveTopics` returns `{ id, slug, label }` and nothing else
    (`content.repo.ts:67-72`). Two honest options: add a count to `GET /topics`, or drop the
    number from the tiles. **Do not approximate it client-side** — a plausible wrong number
    that nobody can check is precisely the failure class this project keeps re-learning.

12. **The tile emoji is hard-coded per slug and there is no emoji column** on `topic_tag`. A
    topic added by a later seed renders with a blank tile. Needs a client-side map keyed on
    `slug` (not `label`) with an explicit fallback glyph.

13. **`is_active` is in the contract's `fields_bound` but is never sent, and that is
    correct.** `listActiveTopics` applies `WHERE is_active = true` server-side, so an
    inactive topic never reaches the client. Noted so nobody adds the field looking for it.

14. **The search-degraded state cannot be detected yet.** `searchDegraded` is a prop the
    designer exposed; no API response says "search is down". That signal belongs to T20 and
    the search-availability NFR. **Do not fake it with a client-side timeout** — a screen
    that says "search is resting" when search is merely slow is a lie the user acts on.

15. **`published_at` → `publishedAt`** on the topic list card too. Same as note 5.

### S11 ProfileCard

16. **The identity card is fully sourced today, and that is a change since T19.**
    `GET /session` returns `{ profile }` carrying `pseudonym`, `year_badge`,
    `reputation_score` and `status` (`session.routes.ts:59`; `profile.repo.ts:31`). At T19
    reputation had to be hidden behind `FEATURES.voting` because the ledger did not exist.
    T21/T22 landed on 8 August, so **the reputation chip is real and needs no flag.**

17. **The three status values match the database exactly** — `profile_status_enum` is
    `('active','suspended','banned')` (`server/migrations/001_identity.up.sql:9`), and the
    design shows the card only when not `active`. No mapping layer.

18. **The `suspended` copy promises something the product cannot do.** It reads *"This
    clears automatically; nothing is permanent."* **Nothing in the app ever sets
    `suspended`, and nothing would clear it** — T24 deliberately built no automatic
    suspend/ban trigger, and the moderator's desk is M5. A student reading that sentence
    would wait for an expiry that does not exist. This is the same shape as T19's "usually
    takes a few minutes", and it gets the same treatment: **a Claude Design copy fix, not a
    Claude Code one.** It belongs in a round-3 design prompt.

19. **The `banned` copy points at a grievance officer who is not configured.** "the
    grievance officer will personally review it" — those contact details are **T42**, a
    human task, and T38 already found that the SLA watchdog has nobody to email for the same
    reason. The copy is not wrong in intent; it is unbacked until T42.

20. **"Your asks & answers" has no endpoint, and no task builds one.** `browseSchema`
    accepts `topic`, `before`, `limit` — there is no author filter anywhere
    (`content.routes.ts:153`). This is the **same gap shape as T34's "no way to read your
    own reports back"**: a screen the plan requires, with no task that supplies its data.
    **Likely home is T26**, the first task that cannot proceed without it. Recorded rather
    than quietly invented here.

21. **"My Reports" targets S14 (M5)** and its endpoint is the one T34 already recorded as
    T40's job. `FEATURES.reporting` already exists — reuse it, do not add a flag.

22. **"Safety & Legal" targets S15 (M5)** and its *content* is T42. No existing flag covers
    it; T26 needs a decision on whether to hide it or route it to a placeholder.

23. **The post-list `meta` copy is honest and should be kept.** "in review — keeping this
    space safe" matches the fail-closed posture exactly. Worth knowing: until **T14b** binds
    a real provider, *every* entry reads that way and none reads "published" — which is
    true, not a bug.

24. **`FEATURES.searchAndProfile` is still the right switch** for S9 and S11, and its
    comment ("Turn on with T26") survives this landing unchanged. **S10 is deliberately not
    behind it** — browse-by-topic's data exists today, so gating it would hide a working
    screen.

25. **Checked and clean: no real-identity data anywhere in S11's markup or props** — no
    email field, no `identity_account_id`, nothing address-shaped. §3.11's hard rule holds.

## Integration notes for T40/T41 — read before wiring S13–S17

Written at T39 (2026-08-09). Same rule as every landing round: each claim is checked against
the file named beside it. **Finding 26 is the one to read first — it has legal weight.**

Milestone 5 is the widest gap yet between what is drawn and what exists. S13 has a complete
backend (T34); S14 and S15 have none and no task builds one; S16 and S17 have their *tables*
but neither endpoint nor an operator to call them.

### S13 ReportContentModal

26. **The picker is missing two of the three legally-expedited reasons, and that is not
    cosmetic.** The server's vocabulary is eight fixed values
    (`server/src/modules/grievance/grievance.slas.ts:17-31`); three of them —
    `non_consensual_imagery`, `sexual_content_morphed`, `impersonation` — start the **24-hour**
    statutory clock, and the other five start the **15-day** one. The design offers five
    labels, and two of the three expedited categories **cannot be selected at all**. A student
    reporting intimate images posted without consent would have to choose "Something else
    serious" → `other` → the 15-day clock. T34 built the category *specifically* so the clock
    could not be wrong; a picker that omits the category defeats it from the other end.
    **This is a design change (a fuller list), not something to paper over in the client.**

27. **Two further mapping problems in the same list.** "Hate or threats" collapses
    `hate_speech` and `threat_of_violence` into one chip — the client cannot decide which to
    send. And "Reveals someone's real identity" maps to **nothing**: `impersonation` is
    *pretending to be* someone, not *unmasking* them. Doxxing is the single harm this product
    exists to prevent and there is no reason code for it. That gap is upstream of the client
    — it belongs with the T43 legal review and `decisions/a8-report-intake-slas.md`, not in
    a wiring task.

28. **Fetch the reasons, never hard-code them.** `GET /reports/reasons` exists for the same
    reason `/topics` does: the list is pinned by a database CHECK (migration 010), and a
    stale client copy offers a reason every submit refuses. Third time this lesson appears in
    this file.

29. **Wire names differ from the contract's field names.** §3.13 binds `sla_deadline` and
    `merged_into_report_id`; `reportView` (`server/src/modules/grievance/grievance.routes.ts:47`)
    sends **`resolutionDueAt`** and a bare boolean **`merged`**. The merged-into ticket id is
    deliberately never returned.

30. **The merged-state copy is factually wrong and mildly disclosive.** It reads *"Someone
    else flagged this too… it's under review as ticket GRV-2093"*. T34's merge is **your own
    duplicate folding into your own open ticket** — the server's own words are *"You'd already
    reported this."* The design also prints another ticket's id, which the API refuses to
    return precisely so one reporter learns nothing about another. Use the server's `message`.

31. **The anonymity default contradicts the success screen.** `anonymous` defaults to **true**,
    and the toggle's own hint correctly says *"You won't get status updates."* The success
    card then says *"Track it anytime in My Reports."* Both cannot be true on the default
    path. The underlying fact is real and permanent: an anonymous report stores no reporter
    (T33), so it can never appear in S14 and can never be de-duplicated. **Whether anonymous
    should stay the default is a product call** — the honest options are to flip the default,
    or to make the success card conditional. Do not "fix" it by linking anonymous reports back
    to their reporter; that would undo what T33 built.

32. **The rate-limit error copy is right and worth keeping.** T34's limiter counts **per
    profile**, not per device, deliberately — a campus shares one address. The design's
    "Everything you've sent is safely in the queue" matches that.

33. **Ticket ids are UUIDs, not `GRV-2107`.** A short display form is a real need on a
    compliance screen; there is no such column. Either render the UUID or add a display id —
    do not invent a sequence in the client, which would not be stable.

### S14 MyReportsList

34. **No endpoint, and no task in the plan builds one.** T34 recorded this already and named
    **T40** as its home. The list, the status chip, the timeline and the SLA line all have
    real columns behind them (`status`, `sla_deadline`, `resolution_action`, `resolved_at`,
    `sla_breached`) — what is missing is a route that reads them for the caller.

35. **The "Under review — a person is on it now" step is not true yet.** There is no operator
    (T37) and no resolution route (T35). Until M5 lands, every open ticket sits at *Received*
    and nothing advances it. The timeline should render from real state, not from an assumed
    progression, or it becomes the same class of lie as "usually takes a few minutes".

36. **`sla_breached` must not be shown here by default** — OQ-13, and the design already
    honours it. Keep that.

### S15 GrievanceContactPanel

37. **The table matches the contract exactly** —
    `grievance_officer_contact(officer_name, contact_email, contact_phone, process_summary)`
    plus `effective_from` (`server/migrations/005_grievance.up.sql:83`). **Nothing serves
    it**: `findCurrentOfficerEmail` is internal to the SLA job and returns only the email. The
    read route is T40's.

38. **The hardest constraint is architectural, and the obvious implementation gets it
    wrong.** §3.15 requires this page reachable from the *refused-registration* state, and
    the design's own footer promises it works "even without an account". Every grievance
    route today sits behind `requireSession`. **This endpoint cannot be session-gated** — and
    it is the one unauthenticated read in the product, so it needs its own rate limit.

39. **The placeholder marking is on the wrong half.** The process summary is correctly
    stamped `PLACEHOLDER`. The officer's *name, email and phone* — "A. Deshmukh",
    "grievance@murmur.app", "+91 98xx-xx-2140" — are **not**, and a plausible named human on
    a legally-required contact page reads as real. §3.15's own state list says the empty case
    "must never ship". The safer shape: **the page refuses to render contact details it does
    not have**, rather than falling back to the design's defaults. T42 supplies the real ones.

40. **The 24-hour figure in the process copy is a named assumption** (`ACKNOWLEDGEMENT_SLA_MS`,
    awaiting T43). Hard-coding it in the client means T43's one-line edit will not reach this
    screen. Serve it, or leave the number out.

### S16 EscalationQueueTable (operator — also needs T36 and T37)

41. **The data model is already complete** — `moderation_case` carries all seven bound fields
    (`server/migrations/002_content.up.sql:78-84`) and the queue is indexed
    (`idx_moderation_case_escalation_queue` on `risk_tier='escalate' AND decision='pending'`).
    Nothing here needs a migration.

42. **`HIGH` / `MEDIUM` are not risk tiers.** `ai_risk_tier_enum` is
    `('auto_pass','auto_block','escalate')`, and **every row in this queue is `escalate` by
    definition** — that is the filter. So the tier column cannot vary. If the ranking §3.16
    asks for is wanted, it has to come from `risk_score` alone.

43. **Until T14b, every row in this queue has no AI verdict at all.** The `hold-all` provider
    classifies nothing; items reach the queue through `escalateToHuman`
    (`server/src/modules/moderation/moderation.repo.ts:145`), which sets
    `risk_tier='escalate'` and leaves `ai_classification_label`, `risk_score` and
    `external_provider_case_ref` **NULL**. The console must say *"escalated because
    classification never succeeded"* — a blank chip reads as missing data and invites someone
    to go looking for a bug that isn't there.

44. **Per-operator attribution cannot be stored on a moderation decision.**
    `moderation_decided_by_enum` is `('ai','human')` — there is no operator column. The design
    prints "operator: gurkanwaldeep" in the header and "by gurkanwaldeep" on each decided row.
    **That needs a schema change or it needs to go.** Note the asymmetry with S17 below, where
    it *is* storable — deciding one way for both is T36/T37's call.

45. **The row needs the content body, which the case row does not carry.** `findCaseById`
    selects case columns only; the preview requires a join to `question`/`answer`. T36's query,
    not a client concern, but it is the reason a naive queue endpoint returns rows with nothing
    to read.

46. **The design's own footnote is correct and should survive** — the decide contract is
    OQ-11, which is exactly what T36 is for.

### S17 GrievanceResolutionPanel (operator — needs T35 and T37)

47. **Reading `sla_breached` for the pre-resolution warning would make it never fire.** The
    design shows *"Past SLA — resolving now will be logged as an SLA breach"* **before** the
    operator acts. But `sla_breached` is generated from `resolved_at > sla_deadline`, so an
    overdue-but-*unresolved* ticket reads **false** — deliberately, from T33. The warning must
    be computed as `now() > sla_deadline AND status = 'open'`. Wiring it to the bound field
    would produce a silent, permanently-off warning on a compliance screen: the exact failure
    shape this project has hit five times.

48. **One action key is wrong.** The design sends `escalate`; the enum value is
    `escalate_further` (`005_grievance.up.sql:17`). The three *labels* are otherwise right.

49. **Operator identity here *is* storable, unlike S16.** `grievance_audit_log` has
    `actor_profile_id` alongside `actor_type IN ('reporter','operator','system')`. But the only
    identity this product has for a person is a **pseudonym** — there is no real-name field
    anywhere. So the audit line reads "by quiet-otter-4821", not "by gurkanwaldeep". Whether
    operators get a separate real-name identity is a T37 decision with privacy consequences;
    it is not a rendering detail.

50. **"The reporter's My Reports view now shows this resolution" is not always true.** For an
    anonymous report there is no reporter link and therefore no such view (finding 31). The
    detail pane already distinguishes the two — the confirmation copy should too.
