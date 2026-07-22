# Stage 2 — PRD: Murmur (Verified Anonymous Campus Q&A)

**Date:** 2026-07-15
**Inherits:** `docs/01-research.md` — verdict **PASS**, composite **6.8/10**, iteration 3 (first passing composite across three iterations).
**Scores carried in:** problem_severity 8 · willingness_to_pay 7 · distribution 7 · unit_economics 5 · why_now 6.
**Scope of this document:** WHAT Murmur v1 is and must do. No technical design (stack, schema, architecture) — that is the TRD's job.

> **Provenance discipline.** Every claim below traces to a research dimension (cited inline) or to a fixed founder decision (cited as `[FOUNDER DECISION #n]`). Anything not sourced from either is tagged **`[ASSUMPTION]`** and collected in the handoff. Nothing is silently invented.

---

## 1. Positioning

### ICP statement

**Junior undergraduate students at Murmur's single launch campus** (Gen Z, in or approaching placement/internship season) **who avoid asking their assigned senior the placement, course, professor, and internship questions they most need answered — because that senior knows their name, face, and branch.** They are the *users*. They do not pay and are not expected to. *(Source: problem_severity — the shame/identity-friction mechanism, 9/10 informal survey; willingness_to_pay — student is not the payer.)*

**Payer ≠ user.** The near-term payer is **hyperlocal campus sponsors** — coaching institutes (CAT/GATE/placement-prep), PG/hostel operators, and campus-proximate local businesses — who already spend real, revealed money reaching this exact single-campus audience through physical channels. *(Source: willingness_to_pay 7/10 — named OOH agency category, revealed local ad prices, ed-tech campus-ambassador budgets.)* The PRD speaks to the student experience in v1 and holds the sponsor relationship as a **documented, sequenced-later rung — not a v1 build** `[FOUNDER DECISION #5, #6]`.

### Value proposition

> For **juniors at the launch campus who avoid asking their assigned senior the placement and course questions they most need answered**, **Murmur** is the **verified, anonymous campus Q&A network** that lets them **ask the entire senior pool — searchable across batches — without exposing who they are, while trusting the answer**. Unlike **Incog** (the live Indian incumbent — confession/rant-first, no persistent reputation, alleged to lack real moderation), **Murmur is Q&A-first with persistent pseudonymous reputation and AI moderation from day one**, making toxicity architecturally harder and a credible answer easier to find.

*Wedge source: distribution.incumbent_motion (Incog's confession-first shape) + why_now.incumbent_inertia (the anti-toxicity difference is a design-level gap, not a bolt-on feature) `[FOUNDER DECISION #8]`.*

### Goals (measurable outcomes — v1 is a density/retention validation experiment `[FOUNDER DECISION #5]`)

Metric names are research-sourced (campus penetration, WAU density, D30 retention); numeric **targets are `[ASSUMPTION]`** — the research names the metrics but not baselines. See Open Question OQ-9.

1. **Registration penetration:** ≥ **25%** `[ASSUMPTION]` of the launch campus student body completes verified registration within **90 days** of launch.
2. **Weekly active density:** sustained **WAU ≥ 40%** `[ASSUMPTION]` of registered users, dense enough that a posted question reliably reaches an answering senior.
3. **D30 retention:** ≥ **30%** `[ASSUMPTION]` of a registration cohort is still active on day 30.
4. **Answer liquidity:** median question receives **≥ 1 substantive answer within 24 hours** `[ASSUMPTION target; the read-heavy/answerable wedge is research-sourced]`.
5. **Safety integrity:** **100%** of user-generated content passes AI moderation at publish, and every grievance/takedown is actioned within an IT-Act-compliant SLA `[FOUNDER DECISION #3]`.

```json
{
  "artifact": "positioning",
  "icp": "Junior undergraduates at Murmur's single launch campus who avoid asking their assigned senior placement/course/internship/professor questions because that senior knows their identity",
  "payer": "Hyperlocal campus sponsors (coaching institutes, PG/hostel operators, local businesses) — NOT the student user; monetization is documented and sequenced later, not built in v1",
  "value_proposition": "For juniors at the launch campus who avoid asking their assigned senior the placement and course questions they most need answered, Murmur is the verified, anonymous campus Q&A network that lets them ask the entire senior pool — searchable across batches — without exposing who they are, while trusting the answer; unlike Incog (confession/rant-first, no persistent reputation, no real moderation), Murmur is Q&A-first with persistent pseudonymous reputation and AI moderation from day one, making toxicity architecturally harder.",
  "category": "verified anonymous campus Q&A network",
  "key_benefit": "ask the whole senior pool the shame-laden questions you can't ask your assigned senior — anonymously, and trust the answer",
  "primary_alternative": "Incog (live Indian incumbent, confession/rant-first) + assigned senior mentors + public WhatsApp groups",
  "differentiation_wedge": "anti-toxicity is architectural, not a feature: Q&A-first format + persistent pseudonymous reputation with something to lose + permanent email-based bans + AI moderation from day 1 — a design-level gap Incog cannot bolt on",
  "goals": [
    "Registration penetration >=25% of launch-campus student body within 90 days [target ASSUMPTION]",
    "Weekly active density >=40% of registered users, sustained [target ASSUMPTION]",
    "D30 retention >=30% of a registration cohort [target ASSUMPTION]",
    "Answer liquidity: median question answered within 24h [target ASSUMPTION]",
    "100% of UGC passes AI moderation at publish; grievance/takedown within IT-Act-compliant SLA"
  ],
  "provenance": {
    "icp": "problem_severity (shame/identity-friction mechanism, 9/10 informal survey) + willingness_to_pay.payer (student is not payer)",
    "wedge": "distribution.incumbent_motion (Incog confession-first) + why_now.incumbent_inertia (design-level, not feature-level, gap) + FOUNDER DECISION #8"
  },
  "assumptions": [
    "All numeric goal targets (penetration %, WAU %, D30 %, 24h answer window) are placeholders — research names the metrics, not the baselines",
    "The launch campus's email/roll-number scheme reliably encodes enrollment year for badge derivation"
  ],
  "handoff": "write-spec"
}
```

---

## 2. Problem Statement

Juniors have a recurring, sometimes acute need for candid placement, internship, course, and professor information. The status quo fails them on **identity, not just access**: colleges formally assign a senior mentor who knows the junior's name, face, and branch — so shame-laden or reputation-risky questions go **unasked**, and the junior is limited to one senior by luck of the draw rather than the whole senior pool. *(Source: problem_severity 8/10, status_quo.)*

**Evidence (research-sourced):**
- **`[FOUNDER-REPORTED, informal survey, n=10]` 9/10 juniors report avoiding asking their assigned senior something they genuinely needed to ask** — direct, on-point primary evidence of the exact mechanism (small sample, non-independent).
- Documented failure of Indian assigned-mentor / placement-committee structures on power-imbalance grounds (LinkedIn thread) — corroborates the broken hierarchy.
- Grassroots confession pages (`nsut_dtu_igdtuw_confession`, ~7,700+ followers) predating any app — unprompted pull toward campus anonymity.
- A live purpose-built incumbent (**Incog**, verified-anonymous, 8+ Indian campuses, incl. placement salary-sharing) proves category demand.
- Global comp **Fizz**: 80 → 700+ campuses, 1M+ users, $41.5M raised — durable, scaling category demand.

**Severity:** painkiller approaching acute *on the specific mechanism*; frequency occasional-to-weekly (bursty in placement season, more continuous for course/professor/advice). *(Source: problem_severity.)*

---

## 3. Target Users

| | |
|---|---|
| **Primary user** | Junior undergraduate at the launch campus, identity-anxious, placement/course/internship information need. *(problem_severity ICP.)* |
| **Secondary user** | Seniors/recent-batch students at the same campus who answer — the supply side of the read-heavy Q&A archive. *(Implied by the junior↔senior wedge `[FOUNDER DECISION #1]`.)* |
| **Payer (not the user)** | Hyperlocal campus sponsors — coaching institutes (CAT/GATE/placement-prep), PG/hostel operators, local businesses. Already spend on this audience via physical channels. **v1 builds nothing for them.** *(willingness_to_pay 7/10; `[FOUNDER DECISION #5, #6]`.)* |
| **Operator** | The founder — a current student at the launch campus, and the distribution channel. Sole operator/moderator at launch, which is why moderation must be AI-first with human escalation. *(distribution.founder_channel_fit; `[FOUNDER DECISION #3, #4]`.)* |

**Identity principle (fixed):** *hide the identity, verify the attributes.* Persistent pseudonym + a single **VERIFIED year badge** derived from the college email/roll number at registration (enrollment year is encoded, not self-declared). **No other badges in v1** — year+branch+hostel together would shrink the anonymity set. `[FOUNDER DECISION #2]`

---

## 4. Goals & Non-Goals Summary

v1 exists to answer one question: **does a verified, anti-toxic, Q&A-first anonymous network reach density and retention on one greenfield campus?** Not "does it make money" — that is a separate, later experiment. `[FOUNDER DECISION #5]` Goals are in §1; success metrics in §5; non-goals in §9.

---

## 5. Success Metrics

**Leading (early signal — activation & liquidity):**
- % of registrations that verify successfully (email → year badge) in one session.
- % of new users who post or answer within week one (activation).
- Answer liquidity: median time-to-first-substantive-answer < 24h `[ASSUMPTION target]`.
- % of UGC auto-actioned by AI moderation vs. escalated to human (operational health, not a user goal).

**Lagging (the experiment's verdict):**
- Registration penetration of campus body (Goal 1).
- Sustained WAU density (Goal 2).
- D30 retention (Goal 3).

**Monetization targets — NOT a v1 build, documented for the ladder only** `[FOUNDER DECISION #5, #6]`:
- **Rung 1 (revenue experiment #2, after retention proven):** sign **1–2 hyperlocal campus sponsors** at a **modest monthly rate** (anchored to research comps: ~INR 5,000–8,000/event fest-stall to sub-hoarding-tier; illustrative ~INR 8,000/mo, ~6-mo retention, ~90% margin → illustrative LTV ~INR 43,200/$500, LTV:CAC >3:1). All figures are **projections `[ASSUMPTION]`, zero sponsors signed.** *(willingness_to_pay / unit_economics iteration 3.)*
- **Rung 2 (much later):** Fizz-style multi-campus ads/marketplace at scale.
- **Rung 3 (most distant, gated):** college-pays B2B2C — **only after a signed pilot LOI** `[FOUNDER DECISION #6]`.

---

## 6. Timeline & Constraints

**Why now (urgency):** The launch campus is **`[FOUNDER-VERIFIED]` confirmed greenfield** — Incog is not active there. But this is a **time-limited land-grab, not a moat**: Incog runs a proven campus-by-campus expansion playbook and could arrive with no notice. **Speed to density is the operative constraint.** *(why_now 6/10; distribution 7/10.)*

**Constraints (fixed):**
1. **IT Act intermediary compliance is a hard requirement** — grievance mechanism + takedown process must exist at launch. `[FOUNDER DECISION #3]`
2. **AI moderation live from day 1** — it is a legal/safety shield (founder liability; a competitor's founder was reportedly suspended), not merely a differentiator. It is a **committed day-1 cost**, still unsized in rupee terms (OQ-3). `[FOUNDER DECISION #3]`
3. **DPDP Act 2023** (phased through ~2027, penalties to INR 50 crore) governs storage of college-email-derived enrollment-year data — raw email is **never displayed**; consent/data-minimization design required (OQ-5).
4. **Single campus only in v1.** Campus-by-campus expansion only after density/retention proven; each new campus is a fresh cold-start. `[FOUNDER DECISION #4]`
5. **Single-founder operator at launch** — moderation must be AI-first with human escalation, not founder-as-sole-manual-moderator.
6. **Zero monetization build in v1** — no ad infra, no sponsor tooling, no B2B config. `[FOUNDER DECISION #5]`

---

## 7. Prior Art & Alternatives

| Alternative | What it is | Why Murmur wins for this ICP |
|---|---|---|
| **Incog** (flitting.app) | Live Indian verified-anonymous campus app; confession/rant-first, placement salary-sharing; **not at the launch campus**. *(distribution.incumbent_motion)* | Q&A-first format + persistent pseudonymous reputation + permanent email-based bans + AI moderation = **architectural anti-toxicity** Incog's shape can't bolt on. `[FOUNDER DECISION #8]` |
| **Assigned senior mentors** | College-assigned; senior knows junior's identity. *(problem_severity.status_quo)* | Ask the **whole** senior pool anonymously, not one senior by luck of the draw. |
| **Public WhatsApp groups / confession pages** | Identity-exposed or unverified, unsearchable, no reputation. | Verified year badge + searchable-across-batches archive + reputation-backed answers. |
| **Fizz** (US) | Confession/social-first, national-brand ads; not India-specific. *(category comp)* | Not a launch-campus competitor; informs the model, not the field. |

---

## 8. Requirements

### P0 — v1 wedge + verification + moderation + measurement (each is load-bearing; cut any and the core value prop or the experiment fails)

**R1 — College-email verification with derived verified-year badge**
Registration gated by college email; enrollment year is **derived from the email/roll-number**, not self-declared; the verified-year badge is the *only* attribute badge in v1. Raw email is never displayed. *(`[FOUNDER DECISION #2]`; distribution — email gate as natural qualifier.)*
- **Given** a prospective user with a valid launch-campus college email, **when** they complete verification, **then** a verified-year badge is derived and attached to their account and the raw email is stored minimized/never shown.
- **Given** an email whose year cannot be reliably parsed, **then** registration is blocked or routed to a fallback, never defaulted to a guessed year.
- **Given** a non-campus or already-used email, **then** verification is refused.

**R2 — Persistent pseudonymous identity**
A stable pseudonym persists across sessions so reputation can attach; real identity is never surfaced to other users. *(`[FOUNDER DECISION #2]`; wedge — reputation "with something to lose".)*
- **Given** a verified user, **when** they post or answer, **then** their persistent pseudonym + year badge is shown and their identity is not.
- **Given** repeat activity, **then** the same pseudonym and its accrued reputation carry forward.

**R3 — Anonymous junior↔senior Q&A core**
Post questions and answers under pseudonym, threaded, across the wedge topics: placements, internships, professors, courses, advice. *(`[FOUNDER DECISION #1]`; problem_severity — the wedge.)*
- **Given** a verified user, **when** they post a question in a supported topic, **then** it is published (post-moderation, see R6) under their pseudonym and is answerable by others.
- **Given** a question, **when** a user answers, **then** the answer threads under it and is attributed to the answerer's pseudonym + year badge.

**R4 — Search & browse across batches (read-heavy archive)**
The question archive is searchable and browsable across batches — the read-heavy behavior the wedge depends on. *(`[FOUNDER DECISION #1]`; problem_severity — "read-heavy, searchable across batches".)*
- **Given** a user with an information need, **when** they search a keyword/topic, **then** relevant existing questions and answers from prior and current batches are returned.
- **Given** no matching content, **then** an empty state invites posting a new question.

**R5 — Reputation + permanent email-based bans (anti-toxicity architecture)**
Pseudonymous reputation that accrues from helpful contribution (e.g., upvotes / accepted answers) and can be lost; bans are keyed to the verified email so a banned person cannot trivially return. *(`[FOUNDER DECISION #8]`; wedge.)*
- **Given** contribution activity, **then** reputation adjusts and is visible enough to make it "something to lose."
- **Given** a user banned for violations, **when** they attempt to re-register with the same college email, **then** re-entry is blocked.

**R6 — AI moderation live from day 1**
Every piece of user-generated content passes AI moderation; toxic/harassing/unsafe content is blocked or escalated. This is a launch-blocking shield. *(`[FOUNDER DECISION #3]`; why_now.)*
- **Given** any submitted post/answer/comment, **when** it is submitted, **then** it passes through AI moderation before or at publish — no UGC bypasses it.
- **Given** content the AI flags as high-risk, **then** it is blocked or routed to human escalation per policy, not silently published.
- **Given** ambiguous content, **then** it is routed to the human-escalation tier rather than auto-approved.

**R7 — IT Act intermediary compliance (grievance + takedown)**
A working grievance mechanism (published grievance-officer contact, in-app reporting) and a takedown process with a defined SLA. *(`[FOUNDER DECISION #3]`; constraint.)*
- **Given** any user, **when** they report content, **then** the report enters a tracked grievance queue with an acknowledged, SLA-bound response.
- **Given** a valid takedown-worthy report, **then** the content is removed within the compliant SLA and the action is logged.
- **Given** the app at launch, **then** grievance-officer contact details are published and reachable.

**R8 — Retention & density instrumentation**
Event instrumentation sufficient to compute the experiment's metrics: registration penetration, WAU density, D30 retention cohorts, activation, and answer liquidity. *(`[FOUNDER DECISION #5]` — v1 IS the measurement experiment.)*
- **Given** the metrics in §1/§5, **when** the experiment runs, **then** each metric is computable from captured events (no metric is un-instrumented).
- **Given** a registration cohort, **then** D30 retention and WAU density for that cohort are derivable.

### P1 — layered onto proven density; sponsor-experiment readiness (not built until v1 succeeds)

- **P1-A — v1.5 anonymous campus-issue discussions**, layered onto the existing density (a discussion surface beyond strict Q&A). `[FOUNDER DECISION #7]`
- **P1-B — Sponsor-experiment readiness**: the sponsored-post ad unit is a *standard* unit (no new product surface) plus a rate card anchored to research comps — **staged for "revenue experiment #2," sequenced strictly after the retention experiment succeeds.** `[FOUNDER DECISION #6]; willingness_to_pay.`

### P2 — deferred / gated

- **P2-A — Seasonal roommate-finding** at year-end. **Note:** inherently requires **opt-in de-anonymization** — a deliberate exception to the anonymity principle, scoped and consented per use. `[FOUNDER DECISION #7]`
- **P2-B — Mentor/support feature for struggling students.** **Explicitly deferred and blocked** — cannot be built until a human-designed safety/escalation protocol exists (see OQ-1, blocking). `[FOUNDER DECISION #7]`
- **P2-C — Fizz-style multi-campus ads/marketplace** (monetization rung 2). `[FOUNDER DECISION #6]`
- **P2-D — College-pays B2B2C** (rung 3) — only after a signed pilot LOI. `[FOUNDER DECISION #6]`

---

## 9. Non-Goals (v1 explicitly does NOT include)

1. **No monetization build of any kind** — no ad infra, no sponsor dashboards, no B2B config tooling. *Rationale:* v1 is pre-revenue by design; monetization is a separate, later experiment. `[FOUNDER DECISION #5]; unit_economics.`
2. **No multi-campus expansion.** *Rationale:* each campus is a fresh cold-start; expand only after density/retention proven on campus 1. `[FOUNDER DECISION #4]; distribution.repeatability.`
3. **No confession / rant / meme free-form feed.** *Rationale:* the free-form format is the incumbent's toxicity failure mode; Q&A-first is the architectural anti-toxicity choice. `[FOUNDER DECISION #8].`
4. **No identity badges beyond the single verified year** (no branch, hostel, or gender badges). *Rationale:* this is what the research shows does **not** serve the ICP — additional attributes shrink the anonymity set and directly harm the anonymity the ICP came for. Principle: hide the identity, verify the attribute. `[FOUNDER DECISION #2].`
5. **No mentor/support feature.** *Rationale:* it cannot ship safely until a human-designed safety protocol exists (OQ-1, blocking). `[FOUNDER DECISION #7].`

---

## 10. Open Questions

*Replacement for interactive Q&A. Carried forward from the iteration-3 research handoff; PRD-specific additions marked. Resolved items retained for traceability.*

| ID | Question | Owner | Blocking |
|---|---|---|---|
| OQ-1 | **What safety/escalation protocol (trained volunteers or counseling-cell tie-up) will exist before the deferred mentor/support feature is ever built? Not scored as part of v1, but flagged per house rules as a blocking future requirement — this does not gate the v1 wedge's pass verdict, since the mentor feature is explicitly out of v1 scope.** *(Carried verbatim from research.)* | human | **true** |
| OQ-2 | Moderation & legal-liability plan — answered in principle (AI moderation from day 1, IT Act intermediary compliance accepted as hard requirement); detailed spec (response-time SLAs, who staffs grievance handling, escalation contacts, what AI catches vs. routes to human) deferred to TRD. | engineering | false |
| OQ-3 | Roughly size the AI-moderation inference cost per active user (cheap classifier vs. full LLM-per-post vs. human-escalation tiers), now that it is a committed day-1 cost. | engineering | false |
| OQ-4 | Independently verify the Incog toxicity / founder-suspension claim — still uncorroborated insider testimony; not load-bearing for any scored dimension, but worth confirming for the founder's own risk awareness. | human | false |
| OQ-5 | Under DPDP Act 2023, what specific consent/data-minimization design is needed for storing college-email-derived enrollment-year data (raw email never displayed)? | engineering | false |
| OQ-6 | Run revenue experiment #2 (sign 1–2 hyperlocal campus sponsors) only after the retention experiment succeeds, to convert the unit-economics projection into an observed result. | user | false |
| OQ-7 | Is there credible evidence a college administrator would pay for a "verified official channel + anonymized sentiment insight" product? B2B2C remains unvalidated, the most distant ladder rung. | user | false |
| OQ-8 | If resourcing allows, replicate the 10-junior test at larger scale / independent administration to firm up the core mechanism beyond informal n=10. | user | false |
| OQ-9 | **[PRD-added]** Set concrete numeric targets for campus penetration %, WAU/registered density %, D30 retention %, and the answer-liquidity window for the launch campus — research names the metrics but not baselines (all currently `[ASSUMPTION]`). | user | false |

**Resolved (retained for traceability):** 10-junior validation test — RESOLVED `[FOUNDER-REPORTED, n=10]` 9/10 report the avoidance behavior. · Campus Incog-penetration check — RESOLVED `[FOUNDER-VERIFIED]` greenfield confirmed.

---

## 11. Handoff → TRD

```json
{
  "artifact": "prd",
  "product": "Murmur",
  "icp": "Junior undergraduates at Murmur's single launch campus who avoid asking their assigned senior placement/course/internship/professor questions because that senior knows their identity",
  "payer": "Hyperlocal campus sponsors (coaching institutes, PG/hostel operators, local businesses) — NOT the student user; monetization is documented and sequenced later, not built in v1",
  "value_proposition": "For juniors at the launch campus who avoid asking their assigned senior the placement and course questions they most need answered, Murmur is the verified, anonymous campus Q&A network that lets them ask the entire senior pool — searchable across batches — without exposing who they are, while trusting the answer; unlike Incog (confession/rant-first, no persistent reputation, no real moderation), Murmur is Q&A-first with persistent pseudonymous reputation and AI moderation from day one.",
  "goals": [
    "Registration penetration >=25% of launch-campus student body within 90 days [target ASSUMPTION]",
    "Weekly active density >=40% of registered users, sustained [target ASSUMPTION]",
    "D30 retention >=30% of a registration cohort [target ASSUMPTION]",
    "Answer liquidity: median question answered within 24h [target ASSUMPTION]",
    "100% of UGC passes AI moderation at publish; grievance/takedown within IT-Act-compliant SLA"
  ],
  "p0_requirements": [
    {
      "id": "R1",
      "requirement": "College-email verification with a verified-year badge derived from the email/roll-number (enrollment year encoded, not self-declared); year badge is the only attribute badge in v1; raw email never displayed",
      "acceptance_criteria": [
        "Given a valid launch-campus email, when verification completes, then a verified-year badge is derived and attached and the raw email is stored minimized/never shown",
        "Given an email whose year cannot be reliably parsed, then registration is blocked or routed to fallback, never defaulted to a guessed year",
        "Given a non-campus or already-used email, then verification is refused"
      ]
    },
    {
      "id": "R2",
      "requirement": "Persistent pseudonymous identity — stable pseudonym across sessions so reputation attaches; real identity never surfaced to other users",
      "acceptance_criteria": [
        "Given a verified user, when they post or answer, then their persistent pseudonym + year badge is shown and their identity is not",
        "Given repeat activity, then the same pseudonym and its accrued reputation carry forward"
      ]
    },
    {
      "id": "R3",
      "requirement": "Anonymous junior-senior Q&A core: post/answer under pseudonym, threaded, across placements/internships/professors/courses/advice",
      "acceptance_criteria": [
        "Given a verified user, when they post a question in a supported topic, then it is published (post-moderation per R6) under their pseudonym and is answerable",
        "Given a question, when a user answers, then the answer threads under it, attributed to the answerer's pseudonym + year badge"
      ]
    },
    {
      "id": "R4",
      "requirement": "Search and browse the Q&A archive across batches (the read-heavy behavior the wedge depends on)",
      "acceptance_criteria": [
        "Given an information need, when the user searches a keyword/topic, then relevant existing questions and answers from prior and current batches are returned",
        "Given no matching content, then an empty state invites posting a new question"
      ]
    },
    {
      "id": "R5",
      "requirement": "Pseudonymous reputation with something to lose + permanent email-based bans (the anti-toxicity architecture)",
      "acceptance_criteria": [
        "Given contribution activity, then reputation adjusts and is visible enough to make it something to lose",
        "Given a user banned for violations, when they attempt to re-register with the same college email, then re-entry is blocked"
      ]
    },
    {
      "id": "R6",
      "requirement": "AI moderation live from day 1 — every UGC item passes moderation before/at publish; high-risk blocked or escalated, ambiguous routed to human",
      "acceptance_criteria": [
        "Given any submitted post/answer/comment, when submitted, then it passes AI moderation before or at publish — no UGC bypasses it",
        "Given content flagged high-risk, then it is blocked or routed to human escalation, not silently published",
        "Given ambiguous content, then it is routed to human escalation rather than auto-approved"
      ]
    },
    {
      "id": "R7",
      "requirement": "IT Act intermediary compliance: working grievance mechanism (published grievance-officer contact, in-app reporting) + takedown process with a defined SLA",
      "acceptance_criteria": [
        "Given any user, when they report content, then the report enters a tracked grievance queue with an SLA-bound acknowledgement and response",
        "Given a valid takedown-worthy report, then content is removed within the compliant SLA and the action is logged",
        "Given the app at launch, then grievance-officer contact details are published and reachable"
      ]
    },
    {
      "id": "R8",
      "requirement": "Retention and density instrumentation sufficient to compute registration penetration, WAU density, D30 retention cohorts, activation, and answer liquidity",
      "acceptance_criteria": [
        "Given the experiment metrics, when the experiment runs, then each metric is computable from captured events with no metric un-instrumented",
        "Given a registration cohort, then D30 retention and WAU density for that cohort are derivable"
      ]
    }
  ],
  "p1_requirements": [
    "v1.5 anonymous campus-issue discussions layered onto existing density",
    "Sponsor-experiment readiness: standard sponsored-post ad unit (no new product surface) + rate card, staged for revenue experiment #2 AFTER retention proven"
  ],
  "non_goals": [
    "No monetization build of any kind in v1 (no ad infra, no sponsor tooling, no B2B config) — pre-revenue by design",
    "No multi-campus expansion — single greenfield campus only; expand campus-by-campus after density/retention proven",
    "No confession/rant/meme free-form feed — Q&A-first is the architectural anti-toxicity choice",
    "No identity badges beyond the single verified year (no branch/hostel/gender) — extra attributes shrink the anonymity set and harm the ICP",
    "No mentor/support feature — blocked until a human-designed safety protocol exists (OQ-1)"
  ],
  "constraints": [
    "IT Act intermediary compliance (grievance mechanism + takedown process) is a hard launch requirement",
    "AI moderation live from day 1 as a legal/safety shield; it is a committed day-1 cost, still unsized (OQ-3)",
    "DPDP Act 2023 governs storage of college-email-derived enrollment-year data; raw email never displayed; consent/data-minimization required (OQ-5)",
    "Single launch campus only in v1; each new campus is a fresh cold-start",
    "Single-founder operator at launch — moderation must be AI-first with human escalation",
    "Zero monetization build in v1",
    "Time-limited land-grab: launch campus is confirmed greenfield but Incog could expand there anytime — speed to density is the operative constraint"
  ],
  "open_questions": [
    {"q": "What safety/escalation protocol (trained volunteers or counseling-cell tie-up) will exist before the deferred mentor/support feature is ever built? Not scored as part of v1, but flagged per house rules as a blocking future requirement — this does not gate the v1 wedge's pass verdict, since the mentor feature is explicitly out of v1 scope.", "owner": "human", "blocking": true},
    {"q": "Moderation & legal-liability plan answered in principle (AI moderation day 1, IT Act intermediary compliance accepted); detailed spec (SLAs, grievance staffing, escalation contacts, AI-catches vs. human-routes) deferred to TRD.", "owner": "engineering", "blocking": false},
    {"q": "Roughly size the AI-moderation inference cost per active user (cheap classifier vs. full LLM-per-post vs. human-escalation tiers), now a committed day-1 cost.", "owner": "engineering", "blocking": false},
    {"q": "Independently verify the Incog toxicity / founder-suspension claim — still uncorroborated insider testimony; not load-bearing, but worth confirming for the founder's own risk awareness.", "owner": "human", "blocking": false},
    {"q": "Under DPDP Act 2023, what specific consent/data-minimization design is needed for storing college-email-derived enrollment-year data (raw email never displayed)?", "owner": "engineering", "blocking": false},
    {"q": "Run revenue experiment #2 (sign 1-2 hyperlocal campus sponsors) only after the retention experiment succeeds, to convert the unit-economics projection into an observed result.", "owner": "user", "blocking": false},
    {"q": "Is there credible evidence a college administrator would pay for a verified-official-channel + anonymized-sentiment-insight product? B2B2C remains unvalidated (most distant ladder rung).", "owner": "user", "blocking": false},
    {"q": "If resourcing allows, replicate the 10-junior test at larger scale or with independent administration to firm up the core mechanism beyond informal n=10.", "owner": "user", "blocking": false},
    {"q": "[PRD-added] Set concrete numeric targets for campus penetration %, WAU/registered density %, D30 retention %, and answer-liquidity window for the launch campus — research names the metrics but not baselines (all currently ASSUMPTION).", "owner": "user", "blocking": false}
  ],
  "assumptions": [
    "All numeric goal/metric targets (penetration >=25%, WAU >=40%, D30 >=30%, 24h answer window) are placeholders — research names the metrics, not baselines",
    "The launch campus email/roll-number scheme reliably encodes enrollment year for badge derivation",
    "Q&A-first format is structurally lower-toxicity than confession/rant format (founder claim, plausible, not independently proven)",
    "Sponsorship economics (~INR 8,000/mo price, ~6-mo retention, ~90% margin, LTV:CAC >3:1) are conservative projections anchored to local ad comps — zero sponsors signed",
    "Advertiser/sponsor value is driven by audience access, orthogonal to the product's anti-toxicity differentiation (from willingness_to_pay)"
  ],
  "handoff": "trd"
}
```
