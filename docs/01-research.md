# Stage 1 — Research: Anonymous College Q&A App (Verified Junior↔Senior Wedge)

**Date:** 2026-07-15
**Idea as scored:** An anonymous social app exclusively for college students, gated by
college-email verification. v1 wedge: anonymous junior↔senior Q&A (placements, internships,
professors, courses, advice) — read-heavy, searchable across batches. Identity model: persistent
pseudonym + a VERIFIED year badge derived from the college email/roll number (no other badges in
v1). Launch scope: founder's own campus first, expand campus-by-campus after density/retention
proven. Payer thesis (not built in v1): colleges pay (B2B2C), ~30-40 config questions on
moderation. Roadmap (not scored): v1.5 campus-issue discussions, seasonal roommate-matching,
last-and-deferred mentor/support feature pending a real safety protocol.

**Verdict: REFINE** — composite 4.5 / 10 (target 6.5). No terminal fail. The wedge attacks a real,
evidenced problem, but the willingness-to-pay thesis has zero market precedent, a same-positioned
competitor is already live at scale in this exact market, and unit economics are effectively
pre-revenue with no validated lever yet.

---

## 1. Problem Severity — Score 7/10 (confidence: medium)

**Severity:** painkiller. **Frequency:** occasional-to-weekly (placement season is bursty; course/
professor/advice questions are more continuous). **Status quo:** colleges formally assign
seniors as mentors; the assigned senior knows the junior's name/face/branch, so shame-laden
questions go unasked, and a junior gets one senior by luck of the draw rather than the whole pool
— tolerated but resented, not adequate.

**Evidence:**
- Existing institutional mentor programs are documented to fail on more than just anonymity: a
  widely-discussed LinkedIn thread on Indian MBA placement committees describes student-run
  placement committees creating "almost zero chance of fair placements," with senior committee
  members using position for personal advantage (e.g., taking 2-3 offers while the batch fights
  over one) — [ASSUMPTION-adjacent but sourced]: this is evidence the senior/junior hierarchy in
  Indian placement culture is already recognized as broken, corroborating (not proving) the
  founder's specific "shame to ask" claim. (LinkedIn, Anindya Longvah post, cited via web search)
- Grassroots, unprompted demand for anonymous campus outlets already exists at real Indian
  campuses: Instagram confession pages such as `nsut_dtu_igdtuw_confession` (~7,700+ followers,
  "CAMPUS_DIARIES") and Facebook's "confessDTU," both using DM/Google-Form funnels — low-tech,
  unverified, but genuine behavioral pull toward anonymity in exactly this population.
- **A direct, purpose-built competitor already exists and is live:** "Incog" (flitting.app),
  marketed as "India's first Verified Anonymous Social Network exclusively for college students,"
  gates access via college email (.ac.in/.edu) or ID card, and is live at IIT Delhi, DTU, NSUT,
  VIT, Manipal, Amity, Bennett, and SRCC — with features including placement salary-sharing,
  Q&A-style threaded discussion, rants, and polls. Its existence and multi-campus reach is the
  single strongest piece of revealed-behavior evidence: real students in this exact market already
  install and use a verified anonymous campus app. (Full detail under Distribution/Why-Now below.)
- Global comp: Fizz (US) grew from ~80 campuses (2023) to 700+ campuses and 1M+ users (2026) with
  $41.5M raised — proof the anonymous-campus-community category has durable, scaling demand, even
  though Fizz is confession/social-first, not Q&A-first, and is not India-specific.
- General context: 69.9% of surveyed Indian college students (n=1,628, 8 cities, 2025) show
  moderate-to-high anxiety, and career/education pressure is named as a structural driver — supports
  that placement-season stress is real and severe, but this is general mental-health data, not
  direct evidence of the specific "afraid to ask my assigned senior" mechanism.

**Critical gap:** the founder's own cheap validation test — asking 10 juniors "did you ever ask
your assigned senior something you'd be embarrassed to ask publicly?" — has **not been run**. The
founder's predicted ~9/10 "no" is currently an assertion, not a finding. This is the cheapest,
highest-leverage validation action available and should happen before any further build spend
(see open_questions).

**Why not higher / not terminal:** Frequency outside placement season is speculative (courses/
professors/advice may not generate enough volume alone to sustain read-heavy engagement
year-round); the existence of Incog means the "insight" isn't unclaimed, even though the
underlying problem is real.

```json
{
  "dimension": "problem_severity",
  "score": 7,
  "confidence": "medium",
  "severity": "painkiller",
  "frequency": "occasional-to-weekly",
  "status_quo": "assigned senior mentors + public WhatsApp groups; identity-exposed, tolerated but resented, doesn't scale to the whole senior pool",
  "evidence": [
    "LinkedIn thread on Indian MBA placement-committee power abuse — institutional recognition the senior/junior hierarchy is already broken",
    "Live direct competitor 'Incog' (flitting.app) already verified-anonymous at IIT Delhi/DTU/NSUT/VIT/Manipal/Amity/Bennett/SRCC, including placement salary-sharing — strong revealed-behavior proof of demand",
    "Grassroots Instagram/Facebook confession pages (7,700+ followers) predating any formal app — unprompted pull toward anonymity in this population",
    "Fizz (US comp): 80→700+ campuses, 1M+ users, $41.5M raised 2023-2026 — category has durable scaling demand"
  ],
  "terminal_fail": false,
  "verdict": "Proceed to sharpen, but run the founder's own 10-junior validation test first — the core shame-mechanism claim is currently unvalidated, and a live India-specific competitor proves the category, not the founder's specific differentiation."
}
```

---

## 2. Willingness To Pay — Score 3/10 (confidence: medium)

**Payer:** future thesis only — colleges (B2B2C), explicitly not built/monetized in v1. The
paying entity (college administration) is not the person in pain (the student), and — sharper
than the usual sufferer≠payer gap — the payer may often be the *subject* of the anonymous
complaints the app surfaces (professors, placement cells, hostel administration), a structural
conflict of interest.

**Revealed-payment evidence:** none found, anywhere in the category, at any comp.
- Fizz — the best-funded, largest-scale player (700+ campuses, $41.5M raised, years of
  operation) — monetizes via **B2C advertising and a peer-to-peer marketplace**, not institutional
  licensing, despite having the most leverage to sell to schools if that worked. That the market
  leader chose ads over B2B2C after years of scale is a meaningful negative signal for the
  college-pays thesis specifically.
- Institutions' revealed behavior toward anonymous apps skews **adversarial, not commercial**: the
  UNC university system banned Fizz, Yik Yak, Sidechat, and Whisper across 16 campuses in 2024
  over bullying/safety concerns. The instinct to *block* an anonymous app is at least as strong,
  and much better evidenced, than any instinct to *buy* one.
- No evidence was found of Indian colleges purchasing anonymized student-sentiment or
  wellbeing SaaS from a third party; the only college-side survey infrastructure found is NAAC's
  own mandated Student Satisfaction Survey process, run by the accreditation body itself, not a
  vendor market for institution-paid anonymous-insight tools. Absence of evidence here is treated
  as a finding, not proof of no market — confidence is lowered accordingly, not the score raised.
- The Indian DPDP Act 2023 (phased through ~2027, penalties up to INR 50 crore) raises the
  compliance bar for any vendor handling student data tied to identity — this is a headwind for
  institutional adoption of a *new, anonymous-content* vendor, not a tailwind.

**Value-to-price:** unknowable with any rigor yet — no comp has published institutional pricing
because no comp sells this way. The only proven monetization path in the category (Fizz's ads/
marketplace) requires a large, multi-campus user base before it generates meaningful revenue.

**Pain-to-pay gap:** real and currently unclosed. Students (the sufferers) have no budget and
won't pay for anonymous Q&A directly (norm is free social apps). Colleges (the notional payer) have
budget but show no revealed appetite for this category, and are more likely to see the product as
liability than as a purchasable insight tool — this is precisely the gap this gate exists to catch.

**Not terminal** because a credible payer-pivot exists and is already proven in this exact
category: Fizz's B2C ad/marketplace model. The founder isn't proposing that model today, but it is
the only model with real evidence behind it.

```json
{
  "dimension": "willingness_to_pay",
  "score": 3,
  "confidence": "medium",
  "payer": "future thesis: college administration (B2B2C) — not the student in pain, and potentially the subject of the complaints the app surfaces",
  "revealed_payment_evidence": [],
  "value_to_price_multiple": "unknown — no comp has ever sold this model, so no price anchor exists",
  "pricing_signal": {
    "likely_model": "unproven B2B2C subscription (thesis only) vs. the only market-proven alternative — B2C advertising/marketplace (Fizz)",
    "rough_price_band": "not determinable; zero market comps for institution-paid anonymous campus apps"
  },
  "pain_to_pay_gap": "Students won't pay (expect free); colleges hold budget but show adversarial (bans), not commercial, behavior toward this category — the gap is currently unclosed.",
  "terminal_fail": false,
  "payer_pivot": "Switch the monetization thesis to the only market-validated model in this category: B2C advertising/marketplace at scale (Fizz's proven path), and treat college-pays as a much later, unvalidated upsell requiring its own pilot/LOI evidence before any B2B tooling is built.",
  "verdict": "Pivot-payer — the stated B2B2C thesis has zero precedent and runs against institutions' documented instinct to ban rather than buy; the only proven path in this category is ad-supported B2C, and even that requires scale this app doesn't have yet."
}
```

---

## 3. Distribution — Score 5/10 (confidence: medium-high)

**Reachable:** yes — the payer/user (students of one named campus) is a bounded, findable
community, and the college-email gate is itself a natural, low-cost qualification filter.

**Primary motion:** community/ambassador-led, founder-seeded word of mouth — the correct
motion for a network-effects consumer product, and it is the exact motion both direct comps used
to bootstrap (Fizz recruits student ambassadors/moderators per campus via LinkedIn; single-campus-
first, then campus-by-campus expansion only after density proves out).

**Founder-channel fit: genuinely strong.** The founder is a current student at the launch
campus with real batchmate/senior/WhatsApp-group access — this is a rare, authentic distribution
advantage that most outside founders attempting this category do not have.

**Repeatability:** semi-repeatable. Fizz's 80→700+ campus growth proves campus-by-campus
expansion works at scale, but each new campus is close to a fresh cold-start (new ambassador,
new density-building), not automatic virality across campuses — this is a real, labor-intensive
constraint on scaling past campus 1.

**Saturation: high, and this is the binding constraint.** "Incog" already occupies almost exactly
this position in the Indian market — verified-anonymous, college-email/ID-gated, live at IIT
Delhi, DTU, NSUT, VIT, Manipal, Amity, Bennett, and SRCC, with Q&A-style threads and placement
salary-sharing already shipped. Whether the founder's specific target campus is already
meaningfully penetrated by Incog is an open, unanswered, and blocking question (see
open_questions) — if it is, the founder isn't launching into a green campus, they're launching a
challenger into an occupied one.

```json
{
  "dimension": "distribution",
  "score": 5,
  "confidence": "medium-high",
  "reachable": "yes — one bounded campus, gated naturally by college email",
  "primary_motion": "community",
  "incumbent_motion": "Fizz: paid student ambassadors/moderators, single-campus-first then campus-by-campus expansion (80→700+ campuses). Incog: identical email/ID-gated single-campus model, already live across multiple top Indian colleges.",
  "repeatability": "semi-repeatable — proven at scale by Fizz, but each campus is close to a fresh cold-start",
  "founder_channel_fit": "Strong — founder is a current student at the launch campus with real batchmate/senior/WhatsApp access, a genuine and rare advantage",
  "saturation": "high",
  "terminal_fail": false,
  "recommended_fix": "Before committing to a campus, directly verify Incog's actual penetration there (install it, check post volume/activity on that specific campus). If Incog is already active there, either (a) pick a genuinely uncontested campus, or (b) lead distribution with the persistent-pseudonym + verified-year reputation system as the explicit differentiator Incog doesn't emphasize, and market against it directly rather than assuming a green field.",
  "verdict": "Proceed with caution — founder-channel fit is a real, rare advantage, but the channel is already crowded by a near-identical live competitor, so the launch plan must confirm the specific campus is actually open before betting on it."
}
```

---

## 4. Why Now — Score 4/10 (confidence: medium)

**Enabling shift (category-level, real):** behavior — pseudonymous, community-gated social apps
crossed into mainstream Gen Z acceptance industry-wide only in the last ~2-3 years, evidenced by
Fizz's rise from ~80 campuses (2023) to 700+ campuses / 1M+ users / $41.5M raised (2026), plus a
reported ~25% growth in Gen Z usage of anonymity-adjacent platforms more broadly. This tailwind is
real, checkable, and currently rising.

**Timing risk in the specific Indian market: leans late/crowding, not early.** The category-level
tailwind is genuine, but in India specifically the window is not clean and open — "Incog" already
exists, already brands itself as "India's first Verified Anonymous Social Network exclusively for
college students," and is already live at several top-tier colleges with a feature set
(verification, Q&A threads, placement salary-sharing) that substantially overlaps the founder's
wedge. Someone has already noticed this exact shift and moved on it.

**Incumbent inertia: weak, which is the core problem for this dimension.** The obvious
"incumbent" to worry about isn't a slow legacy player — it's a recent, apparently well-built,
already-multi-campus direct competitor with no structural reason it couldn't extend into the
founder's specific verified-year/reputation/Q&A-first wedge itself.

**Regulatory:** the DPDP Act 2023's phased rollout (full effect ~2027) is not a tailwind for a
scrappy new anonymous entrant — it raises the compliance bar for anyone processing
identity-linked student data going forward, working against speed-to-market, not for it.

```json
{
  "dimension": "why_now",
  "score": 4,
  "confidence": "medium",
  "enabling_shift": "Behavior: pseudonymous, campus-gated social apps crossed into mainstream Gen Z acceptance in the last ~2-3 years (Fizz: 80→700+ campuses, 1M+ users, $41.5M raised, 2023-2026)",
  "tailwind_direction": "rising",
  "timing_risk": "too_late (India-specific) — a near-identical, live, multi-campus competitor already exists",
  "incumbent_inertia": "Weak — the closest incumbent (Incog) is recent and already multi-campus; no structural reason it can't ship the verified-year/reputation/Q&A wedge itself",
  "terminal_fail": false,
  "recommended_fix": "Reposition the why-now around the specific gap Incog leaves open (persistent reputation + verified-year credibility for Q&A, vs. Incog's confession/rant-first design) and treat speed as urgent — the category tailwind is real, but the India-specific window is already filling, so differentiation must be sharp and fast, not assumed as a greenfield head start.",
  "verdict": "Sharpen-timing — the broader category tailwind is real and rising, but in India specifically a live, well-positioned competitor already exists, so this is closer to a crowding window than an open one."
}
```

---

## 5. Unit Economics — Score 3/10 (confidence: low)

Synthesis from the two dimensions above: willingness-to-pay found no validated revenue model (the
stated B2B2C thesis has zero precedent; the only market-proven alternative, Fizz's B2C ad/
marketplace model, only becomes meaningful at large multi-campus scale). Distribution found a
low-cash-cost but labor-intensive, semi-repeatable community motion with real founder-channel fit
but high category saturation.

**LTV:** effectively **$0 in the relevant near-term window.** Under the founder's stated plan,
v1 has no monetization at all (explicitly deferred). Under the only proven pivot (ad-supported,
per Fizz), Fizz itself did not generate meaningful ad revenue until it had scaled to hundreds of
campuses and 1M+ users over several years with a dedicated ad-sales hire — a single-campus v1 has
no advertiser-relevant reach and would earn negligible ad revenue for a long time. [ASSUMPTION]:
assumes ad CPMs require aggregated, cross-campus scale to be commercially interesting to
advertisers, based on Fizz's own multi-year timeline to monetization.

**CAC:** low cash cost via the community/ambassador motion (near-$0 per user in direct spend),
but real, uncosted founder time (moderation, ambassador recruiting, campus-by-campus relaunch
effort) that a pure "CAC" figure doesn't capture. Per distribution's finding, this cost rises
per new campus (semi-repeatable, not viral), and campus 1's success is gated on confirming it
isn't already occupied by Incog.

**LTV:CAC / payback:** **not meaningfully computable** — with LTV at ~$0 pre-scale and no
comp for the B2B2C model's price, any ratio produced would be a fabricated number rather than an
estimate. This is itself the finding: unit economics for this idea, as currently scoped, are
**pre-revenue by design**, not merely thin.

**Gross margin / cost to serve:** likely high once monetized (a text/Q&A social app has standard
software margins, no AI-inference cost mentioned in scope), but moot while revenue is ~$0.

**Not terminal:** a lever exists — treat v1 explicitly as a retention/density proof, not a revenue
business, and validate either monetization path (ad-scale or a B2B2C pilot LOI) only after
density is proven on campus 1, which is exactly what the founder's own roadmap already proposes.
The math isn't "broken," it's simply not yet attempted — the fix is sequencing, not economics.

```json
{
  "dimension": "unit_economics",
  "score": 3,
  "confidence": "low",
  "ltv_estimate": "~$0 in the near-term window under either monetization path — v1 has no revenue by design, and the only market-proven pivot (Fizz's ad model) only pays off at multi-campus scale this app won't have at launch",
  "cac_estimate": "Low cash CAC via community/ambassador motion, but real uncosted founder time; rises per new campus (semi-repeatable, not viral) per distribution's finding",
  "ltv_cac_ratio": "not meaningfully computable pre-revenue — would be a fabricated number, not an estimate",
  "cac_payback_months": null,
  "gross_margin": "likely high (~standard software margin) once monetized; moot while revenue is ~$0",
  "binding_constraint": "No validated revenue model exists yet at any comp; the idea is structurally pre-revenue at the scope currently proposed",
  "terminal_fail": false,
  "recommended_fix": "Explicitly treat v1 as a density/retention proof, not a revenue business — do not build B2B config tooling or ad infra until (a) one campus shows real retention, and (b) either ad-scale is within reach or a college pilot LOI is obtained. Sequencing, not math, is the fix.",
  "verdict": "Assuming zero near-term revenue under any current path, unit economics can't be scored as healthy or broken — it's pre-revenue by design; proceed only if v1 is explicitly funded/scoped as a validation exercise, not a business bet."
}
```

---

## Composite Score

```
composite = (3·7 + 3·3 + 2·5 + 2·3 + 1·4) / 11
          = (21 + 9 + 10 + 6 + 4) / 11
          = 50 / 11
          = 4.5
```

Target to pass: **6.5**. No dimension terminal-failed. **Composite 4.5 < 6.5 → REFINE.**

---

## Key Evidence Summary

1. A near-identical, live, verified-anonymous college Q&A/confession app ("Incog" / flitting.app)
   already operates across multiple top Indian colleges (IIT Delhi, DTU, NSUT, VIT, Manipal,
   Amity, Bennett, SRCC), including placement salary-sharing — this is the single most
   consequential finding across every dimension: it proves the problem (severity ↑) while
   simultaneously crowding the distribution channel and the timing window (distribution/why-now
   ↓).
2. Fizz (US) — 80→700+ campuses, 1M+ users, $41.5M raised (2023-2026) — proves the category has
   durable, scaling demand, and monetizes via **B2C advertising/marketplace**, not the founder's
   proposed B2B2C college-pays model — the strongest available evidence against the stated payer
   thesis.
3. Institutions have shown a documented instinct to **ban** anonymous campus apps (UNC system
   banning Fizz/Yik Yak/Sidechat/Whisper across 16 campuses, 2024) rather than buy or license them
   — directly undercuts the "colleges pay" thesis.
4. Existing assigned-mentor programs are independently documented (Indian MBA placement-committee
   complaints) to fail on power-imbalance and hierarchy grounds, corroborating — but not proving —
   the founder's core "shame to ask" mechanism.
5. The founder's own cheap validation test (ask 10 juniors about their assigned senior) has not
   been run — the core problem claim is currently asserted, not evidenced.
6. India's DPDP Act 2023 (phased through ~2027, penalties up to INR 50 crore) raises the
   compliance bar for any vendor handling identity-linked student data, cutting against both a
   fast-moving consumer launch and a future B2B2C compliance-heavy pitch to colleges.

---

## Handoff — Iteration 0 (superseded — see Iteration 1 below for the current handoff)

```json
{
  "artifact": "research",
  "idea": "Anonymous college Q&A app, gated by college-email verification, wedge = verified junior-senior placement/course Q&A with persistent pseudonyms + verified-year badges",
  "iteration": 0,
  "dimension_scores": {
    "problem_severity": 7,
    "willingness_to_pay": 3,
    "distribution": 5,
    "unit_economics": 3,
    "why_now": 4
  },
  "composite_score": 4.5,
  "target": 6.5,
  "terminal_fail": false,
  "verdict": "refine",
  "weakest_fixable_dimensions": ["willingness_to_pay", "unit_economics", "why_now", "distribution"],
  "fixes_available": [
    "Switch the monetization thesis to the only market-validated model in this category (B2C advertising/marketplace, per Fizz), treating college-pays B2B2C as a much later, unvalidated upsell requiring its own pilot/LOI evidence before any B2B tooling is built.",
    "Before committing to a launch campus, directly verify Incog's actual penetration there; if occupied, either pick an uncontested campus or lead distribution with the persistent-pseudonym + verified-year reputation system as the explicit differentiator Incog doesn't emphasize.",
    "Reposition the why-now around the specific gap Incog leaves open (persistent reputation/credibility for Q&A vs. Incog's confession/rant-first design) and move fast — the category tailwind is real but the India-specific window is already filling.",
    "Explicitly scope v1 as a density/retention validation exercise, not a revenue business, and defer all monetization build (ad infra or B2B config tooling) until retention is proven and a revenue path is separately validated."
  ],
  "key_evidence": [
    "Direct live competitor 'Incog' (flitting.app) already verified-anonymous at IIT Delhi, DTU, NSUT, VIT, Manipal, Amity, Bennett, SRCC, with Q&A threads and placement salary-sharing",
    "Fizz (US): 80->700+ campuses, 1M+ users, $41.5M raised 2023-2026, monetizes via B2C ads/marketplace, not institution-pays",
    "UNC system banned Fizz/Yik Yak/Sidechat/Whisper across 16 campuses (2024) — institutions show adversarial, not commercial, instinct toward this category",
    "Indian MBA placement-committee power-abuse complaints (LinkedIn) corroborate the senior/junior hierarchy problem but do not confirm the specific 'shame to ask' mechanism",
    "DPDP Act 2023 (phased through ~2027) raises compliance cost for identity-linked student data vendors"
  ],
  "open_questions": [
    {
      "question": "Run the founder's own cheap validation test: ask 10 juniors 'did you ever ask your assigned senior something you'd be embarrassed to ask publicly?' before further build spend.",
      "owner": "human",
      "blocking": true
    },
    {
      "question": "Does 'Incog' (flitting.app) already have meaningful active penetration at the founder's specific launch campus? Install it and check post volume/activity before committing to that campus.",
      "owner": "human",
      "blocking": true
    },
    {
      "question": "Is there any credible evidence (even informal) that a college administrator would pay for a 'verified official channel + anonymized sentiment insight' product, given institutions' documented preference to ban rather than buy anonymous apps?",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "What is the moderation and legal-liability plan for v1 (single founder as sole moderator)? Fizz's own postmortem lessons (Yik Yak's death) show moderation under-investment is the historical cause of failure for this category, and India's IT Act intermediary-liability rules apply to founder-run platforms handling user content.",
      "owner": "human",
      "blocking": true
    },
    {
      "question": "What safety/escalation protocol (trained volunteers or counseling-cell tie-up) will exist before the deferred mentor/support feature is ever built? Not scored as part of v1, but flagged per house rules as a blocking future requirement.",
      "owner": "human",
      "blocking": true
    },
    {
      "question": "Under DPDP Act 2023 phased obligations, what specific consent/data-minimization design is needed for storing college-email-derived enrollment year data, even though it's never displayed as raw email?",
      "owner": "human",
      "blocking": false
    }
  ],
  "docs_written": "docs/01-research.md"
}
```

---

# Iteration 1 — Independent Re-Score

**Revised idea:** Same wedge, identity model, and deferred roadmap as iteration 0. Three changes,
each enacting one of iteration 0's `recommended_fix` strings: (1) **payer pivot** — primary
monetization thesis is now B2C campus advertising/marketplace at multi-campus scale (Fizz's
proven path); college-pays B2B2C demoted to a distant, unvalidated upsell requiring a signed pilot
LOI before any B2B tooling is built. (2) **Why-now reposition** — the product is now positioned
explicitly as the anti-toxic challenger to Incog, with new founder evidence that Incog is toxic in
practice (user-to-user shaming, no AI moderation) — **flagged as [USER REPORT, unverified] below,
independent verification attempted and inconclusive** — plus the Fizz-vs-Yik-Yak precedent that a
moderation-led challenger can dethrone a toxic incumbent in this exact category. (3) **Economics
rescope** — v1 explicitly scoped as a single-campus density/retention validation exercise with
named success metrics (campus penetration, WAU density, D30 retention), zero monetization build,
and an acknowledged new per-user serving cost from an AI moderation layer.

Each dimension below is re-judged independently against the revised idea, not anchored to
iteration 0's numbers. Iteration 0's underlying evidence (Incog, Fizz, UNC bans, DPDP Act,
placement-committee complaints, confession pages) remains valid and is reused where still
applicable; new claims are labeled with their evidence status.

**Verification attempt on the new toxicity claim:** targeted searches for Incog-specific
complaints, controversy, or review text mentioning bullying/shaming/moderation quality turned up
no independent corroboration — no news coverage, no located app-store review text, no forum
discussion naming Incog specifically. This is *absence of evidence*, not evidence of absence: it
could mean the claim is wrong, or simply that it hasn't surfaced in indexed text yet (campus-gated
apps produce little public-web footprint by design — posts aren't crawlable outside the verified
community). The claim is carried forward as **[USER REPORT, unverified]** throughout, and is
treated as a live blocking question, not as established fact.

### 1. Problem Severity — Score 7/10 (confidence: medium) — unchanged

Re-judged fresh: the underlying mechanism (identity friction stops shame-laden questions) and its
evidence base are unchanged by this iteration's edits — none of the three changes touch the core
problem claim itself, only the payer, timing narrative, and economics scope. The same evidence
still applies: documented failure of assigned-mentor programs on hierarchy/power grounds, grassroots
confession-page demand, Incog's own existence as revealed-behavior proof, and Fizz as a global
category comp. The founder's 10-junior validation test is still unrun.

One new consideration: *if* the toxicity claim about Incog is true, it would arguably deepen
severity further (people are being harmed by the closest available solution, sharpening the need
for a safer alternative) — but since that claim is unverified, it is not used to raise the score.
Score holds at 7, independently re-derived from the same evidence, not carried over by default.

```json
{
  "dimension": "problem_severity",
  "score": 7,
  "confidence": "medium",
  "severity": "painkiller",
  "frequency": "occasional-to-weekly",
  "status_quo": "assigned senior mentors + public WhatsApp groups + a toxicity-alleged incumbent (Incog, unverified); identity-exposed or unsafe, tolerated but resented",
  "evidence": [
    "LinkedIn thread on Indian MBA placement-committee power abuse — institutional recognition the senior/junior hierarchy is already broken",
    "Live direct competitor 'Incog' (flitting.app) already verified-anonymous at 8 named Indian colleges, including placement salary-sharing — strong revealed-behavior proof of demand",
    "Grassroots Instagram/Facebook confession pages (7,700+ followers) predating any formal app — unprompted pull toward anonymity in this population",
    "Fizz (US comp): 80->700+ campuses, 1M+ users, $41.5M raised 2023-2026 — category has durable scaling demand",
    "[USER REPORT, unverified] Incog is toxic in practice with no AI moderation — not used to raise the score, noted only as a possible severity amplifier if verified"
  ],
  "terminal_fail": false,
  "verdict": "Unchanged — proceed to sharpen, but the founder's own 10-junior validation test is still the single highest-leverage unrun action."
}
```

### 2. Willingness To Pay — Score 5/10 (confidence: medium) — improved from 3

Re-judged fresh against the new payer thesis: the payer is no longer a hypothetical college
administrator but **advertisers**, via Fizz's proven B2C ad/marketplace model. This is a real
improvement in evidentiary footing: Fizz has named, revealed-payment relationships with real
advertisers (Perplexity, Quizlet, Sony Pictures, Amazon) buying access to its college-student
audience — money is demonstrably already flowing in this exact category, which iteration 0's
thesis had zero of.

However, this payer is **scale-gated, not wedge-gated**: advertisers pay for aggregate Gen-Z/
college reach, not specifically for a Q&A-first, anti-toxic architecture — the differentiation
that makes this idea distinct from Incog does not itself increase what an advertiser would pay.
[ASSUMPTION]: assumes advertiser demand is driven by audience size/demographics rather than
content-quality/safety, based on standard digital-ad buying practice and Fizz's own ad-pitch
framing (reach-based, not safety-based). At v1's single-campus scale, this payer is effectively
unreachable — Fizz itself did not build an ad-sales function until it had reached hundreds of
campuses. So willingness-to-pay is real and evidenced *at scale*, but not accessible at the stage
this idea is actually being built for.

The college-pays B2B2C thesis is now correctly demoted to an explicit future upsell requiring a
pilot LOI — this is good discipline, but it means it contributes nothing to the current score
(no evidence has changed there; it remains unproven and adversarially-risked per iteration 0's UNC
finding, which still stands).

Score improves to 5 (moderate): a defined, reachable-in-principle payer now exists with real
revealed-payment evidence in the category, versus iteration 0's zero-evidence B2B2C thesis — but
it's thin because the value driver (audience scale) is orthogonal to the product's actual
differentiation, and is not accessible during the validated v1 scope.

```json
{
  "dimension": "willingness_to_pay",
  "score": 5,
  "confidence": "medium",
  "payer": "Advertisers buying Gen-Z/college audience reach (per Fizz's proven model) — not the student, and not the college; college-pays B2B2C demoted to an unvalidated future upsell",
  "revealed_payment_evidence": [
    "Fizz has named advertiser relationships (Perplexity, Quizlet, Sony Pictures, Amazon) already paying for access to its college-student audience — real revealed payment in this exact category"
  ],
  "value_to_price_multiple": "Standard digital-ad CPM economics apply once at scale; not computable for v1's single-campus stage since there is no advertiser-relevant reach yet",
  "pricing_signal": {
    "likely_model": "usage-based / CPM advertising at multi-campus scale (proven); B2B2C subscription remains a speculative, unvalidated future tier",
    "rough_price_band": "not determinable pre-scale; Fizz itself did not monetize meaningfully until hundreds of campuses and 1M+ users"
  },
  "pain_to_pay_gap": "Minimal gap for the advertiser payer once scale exists (advertisers routinely pay for hard-to-reach Gen-Z audiences) — but a real scale gap exists: this payer is not reachable at v1's single-campus stage, and doesn't reward the product's specific anti-toxicity/Q&A differentiation.",
  "terminal_fail": false,
  "payer_pivot": null,
  "verdict": "Proceed with the ad-model pivot as the primary long-run thesis, but treat it as scale-gated, not immediately available — v1 should not expect any revenue, and college-pays remains unvalidated speculation pending an LOI."
}
```

### 3. Distribution — Score 6/10 (confidence: medium) — improved from 5

Re-judged fresh: founder-channel fit is unchanged and remains genuinely strong (current student
at the launch campus, real batchmate/senior/WhatsApp access). What changed is the *message*: this
iteration replaces iteration 0's vague "extend into an occupied market" framing with an explicit
challenger narrative — positioning directly against Incog's alleged toxicity. This is a real
improvement in channel-market fit, independent of whether the toxicity claim is verified: there is
a strong, direct precedent in this exact category that a moderation-led challenger can take share
from a toxic incumbent (Fizz vs. Yik Yak) — this gives the challenger message real strategic logic,
not just hope.

That said, two things cap the score below "strong": (a) the core premise (Incog is toxic) is
still [USER REPORT, unverified] — verification attempts turned up no independent corroboration,
so the challenger message currently rests on a single, uncorroborated source; and (b) a real
cold-start/network-effect problem is unaddressed — students go where their classmates already
are, and a "safer but emptier" app has to overcome real coordination friction even if its safety
claim is true and known. Saturation remains high (Incog is live and multi-campus) and the blocking
verification task (confirm Incog's actual penetration at the specific launch campus) is unchanged
from iteration 0.

Score improves modestly to 6 (workable-to-strong): the strategic logic is sharper and has a real
precedent behind it, but execution risk (unverified premise + switching-cost friction) keeps it
short of "strong."

```json
{
  "dimension": "distribution",
  "score": 6,
  "confidence": "medium",
  "reachable": "yes — one bounded campus, gated naturally by college email",
  "primary_motion": "community — explicit challenger/anti-toxicity positioning against Incog",
  "incumbent_motion": "Fizz: paid student ambassadors/moderators, single-campus-first expansion, and historically displaced Yik Yak specifically by fixing moderation — direct precedent for this exact strategy. Incog: identical email/ID-gated model, already live across 8+ Indian colleges.",
  "repeatability": "semi-repeatable — proven at scale by Fizz, but each campus is close to a fresh cold-start",
  "founder_channel_fit": "Strong and unchanged — founder is a current student at the launch campus with real batchmate/senior/WhatsApp access",
  "saturation": "high",
  "terminal_fail": false,
  "recommended_fix": null,
  "verdict": "Proceed — the challenger narrative has real strategic logic and a direct precedent (Fizz vs. Yik Yak), but it rests on an unverified premise about Incog and an unaddressed switching-cost problem, so confirm the toxicity claim and campus penetration before committing distribution spend."
}
```

### 4. Why Now — Score 5/10 (confidence: low-medium) — improved from 4

Re-judged fresh: this is the most substantively repositioned dimension. Iteration 0 scored why-now
weak specifically because incumbent inertia was weak — there was no structural reason Incog
couldn't simply copy the verified-year/Q&A wedge. This iteration's reframing directly answers that
critique: it claims the incumbent's weakness (toxicity, no AI moderation) is *architectural*, not a
missing feature — Incog's confession/rant-first design and lack of reputation stakes are claimed to
structurally produce shaming, and fixing that requires a different product shape (Q&A-first,
persistent reputation, AI moderation), not a quick bolt-on. That is a genuinely stronger logical
structure for an incumbent-inertia argument, *and* it has real category precedent: Fizz's own rise
is substantially a story of winning by out-moderating Yik Yak, which is on-point, well-evidenced,
and directly analogous.

The enabling shift itself (Gen Z's mainstream acceptance of pseudonymous campus apps, rising) is
unchanged and still real.

The score is nonetheless capped, not maximized, because the entire timing thesis is now load-bearing
on a single claim — Incog's toxicity/lack of moderation — that is **[USER REPORT, unverified]**.
Independent search found no corroborating reviews, news, or forum discussion (see verification
note above); absence of evidence lowers confidence, it does not confirm or deny the claim. A why-now
built on an unverified single-source claim about a specific competitor is meaningfully weaker than
one built on a demonstrated, checkable industry-wide shift, even though the reasoning pattern
(precedent: Fizz beat Yik Yak this way) is sound.

Score improves to 5 (plausible): sharper, better-precedented logic than iteration 0, but capped by
reliance on an unverified premise.

```json
{
  "dimension": "why_now",
  "score": 5,
  "confidence": "low-medium",
  "enabling_shift": "Behavior: pseudonymous, campus-gated social apps crossed into mainstream Gen Z acceptance in the last ~2-3 years (Fizz: 80->700+ campuses, 1M+ users, $41.5M raised, 2023-2026) — unchanged and still real",
  "tailwind_direction": "rising",
  "timing_risk": "on_time, contingent on verification — the challenger-beats-toxic-incumbent window is open now per the Fizz/Yik Yak precedent, but only if Incog's toxicity is real; unverified as of this scoring",
  "incumbent_inertia": "Now argued as structurally strong (Incog's confession-first architecture and lack of reputation stakes are claimed to be a design-level, not feature-level, gap) — a real improvement over iteration 0's 'no reason they can't copy it,' but the underlying premise is [USER REPORT, unverified]",
  "terminal_fail": false,
  "recommended_fix": "Independently verify Incog's moderation quality and toxicity level (Play Store/App Store review mining, Reddit, or direct interviews with students at colleges where it's live) before treating 'incumbent is toxic' as the load-bearing timing thesis. The Fizz-vs-Yik-Yak precedent is real and strengthens the argument's logic, but its application to Incog specifically is currently unconfirmed.",
  "verdict": "Sharpen-timing — the reasoning is now well-precedented and structurally sound, a real improvement, but the central factual premise needs independent verification before this can be treated as a strong why-now rather than a plausible one."
}
```

### 5. Unit Economics — Score 4/10 (confidence: low) — improved from 3

Re-judged fresh: the rescoped v1 (explicit density/retention validation, named success metrics,
zero monetization build) is more disciplined than iteration 0's ambiguous scope, which is a real
positive — it reduces the risk of premature monetization spend and gives concrete, falsifiable
success criteria (campus penetration, WAU density, D30 retention) rather than an open-ended
"grow and figure it out later." That discipline is itself worth a modest score improvement,
independent of the underlying revenue math, which has not fundamentally changed: LTV is still
effectively $0 in the validated v1 window under any monetization path, because (a) v1 explicitly
builds no monetization, and (b) the ad-model pivot (per willingness-to-pay) only pays off at
multi-campus scale this app will not have during v1.

One new, honestly-surfaced cost item: the AI moderation layer is a real per-user serving cost
(inference cost for automated content review) that iteration 0's scope did not include. This is a
genuine, previously-unpriced margin risk — but it is a *known, boundable* cost (can be capped via
cheaper classifiers, rate limits, or human-escalation tiers) rather than an open-ended blowout, so
it doesn't push the score down relative to iteration 0; if anything, surfacing it now rather than
discovering it later is good practice.

LTV:CAC remains not meaningfully computable pre-revenue — any ratio would be fabricated. Score
improves modestly to 4 (still "underwater but fixable"): the plan is more honest and better-scoped,
a real evidence-based revenue path exists for later (Fizz's ad model), but the fundamental fact —
no revenue during the validated stage, plus a new unsized cost — is unchanged.

```json
{
  "dimension": "unit_economics",
  "score": 4,
  "confidence": "low",
  "ltv_estimate": "~$0 during the validated v1 window by explicit design (zero monetization build); the ad-model pivot only pays off at multi-campus scale not reached during v1",
  "cac_estimate": "Low cash CAC via community/challenger-narrative motion, but real uncosted founder time; rises per new campus (semi-repeatable, not viral)",
  "ltv_cac_ratio": "not meaningfully computable pre-revenue — would be a fabricated number, not an estimate",
  "cac_payback_months": null,
  "gross_margin": "Not yet computable; a new real per-user serving cost (AI moderation inference) is now acknowledged and must be sized before scale — a genuine but boundable margin risk not present in iteration 0's scope",
  "binding_constraint": "Still no validated revenue during the scoped v1 window, now compounded by an explicitly-acknowledged but not-yet-sized AI moderation cost",
  "terminal_fail": false,
  "recommended_fix": "Roughly size the AI-moderation inference cost per active user now (e.g., cheap classifier + human escalation vs. full LLM-per-post) so margin isn't a surprise when ad monetization is attempted at scale; keep v1 spend strictly capped to the named density/retention metrics and do not build ad-sales or B2B tooling until multi-campus reach or a signed LOI exists.",
  "verdict": "Improved discipline (explicit validation scope, named metrics, acknowledged moderation cost) earns a modest score bump, but the idea remains pre-revenue by design during v1 — proceed only as a funded validation exercise, not a revenue bet."
}
```

### Composite Score — Iteration 1

```
composite = (3·7 + 3·5 + 2·6 + 2·4 + 1·5) / 11
          = (21 + 15 + 12 + 8 + 5) / 11
          = 61 / 11
          = 5.5
```

Target to pass: **6.5**. No dimension terminal-failed. **Composite 5.5 < 6.5 → REFINE (again)** —
improved from iteration 0's 4.5, but still short of the pass threshold. The strongest remaining
weaknesses are why_now (5, load-bearing on an unverified claim) and unit_economics (4, still
pre-revenue during the validated scope); willingness_to_pay improved the most (3→5) via a real,
evidenced payer-pivot.

---

## Handoff — Iteration 1 (superseded — see Iteration 2 below for the current handoff)

```json
{
  "artifact": "research",
  "idea": "Reputation-first anonymous college Q&A network (college-email verified, persistent pseudonyms + verified-year badges, junior-senior placement/course Q&A wedge), positioned explicitly as the anti-toxic, AI-moderated challenger to Incog",
  "iteration": 1,
  "dimension_scores": {
    "problem_severity": 7,
    "willingness_to_pay": 5,
    "distribution": 6,
    "unit_economics": 4,
    "why_now": 5
  },
  "composite_score": 5.5,
  "target": 6.5,
  "terminal_fail": false,
  "verdict": "refine",
  "weakest_fixable_dimensions": ["unit_economics", "why_now", "willingness_to_pay", "distribution"],
  "fixes_available": [
    "Independently verify Incog's moderation quality/toxicity level (review mining, Reddit, direct student interviews) before continuing to treat 'incumbent is toxic' as the load-bearing why-now thesis — currently a single-source, unverified founder claim.",
    "Roughly size the AI-moderation inference cost per active user before scale, and keep v1 spend strictly capped to the named density/retention metrics; do not build ad-sales or B2B tooling until multi-campus reach or a signed college LOI exists.",
    "Treat the advertiser-payer thesis as scale-gated: it is evidenced (Fizz's named advertiser deals) but inaccessible during v1's single-campus stage — plan financing/runway accordingly rather than assuming near-term ad revenue.",
    "Still confirm Incog's actual penetration at the specific launch campus before committing distribution spend, and be ready to pick an uncontested campus if it's already saturated there."
  ],
  "key_evidence": [
    "Fizz has named, revealed advertiser relationships (Perplexity, Quizlet, Sony Pictures, Amazon) — real payment evidence for the new B2C ad-model payer thesis, unavailable in iteration 0",
    "Fizz's own history is substantially a story of displacing Yik Yak by fixing moderation — direct, on-point precedent for this iteration's challenger strategy",
    "[USER REPORT, unverified] Incog is toxic / lacks AI moderation — independent verification attempted (review/news/forum search) and found no corroboration; carried forward as an unresolved blocking question, not as fact",
    "Institutions (UNC system) still show a documented instinct to ban anonymous apps rather than buy them — the college-pays B2B2C upsell remains unvalidated and unchanged from iteration 0",
    "AI moderation layer introduces a new, previously unpriced per-user serving cost that must be sized before scale"
  ],
  "open_questions": [
    {
      "question": "Run the founder's own cheap validation test: ask 10 juniors 'did you ever ask your assigned senior something you'd be embarrassed to ask publicly?' before further build spend.",
      "owner": "human",
      "blocking": true
    },
    {
      "question": "Does 'Incog' (flitting.app) already have meaningful active penetration at the founder's specific launch campus? Install it and check post volume/activity before committing to that campus.",
      "owner": "human",
      "blocking": true
    },
    {
      "question": "Independently verify the new toxicity/no-moderation claim about Incog (review mining, direct student interviews, or trial usage) — currently a single-source founder report with no corroboration found; the entire iteration-1 why-now thesis depends on it.",
      "owner": "human",
      "blocking": true
    },
    {
      "question": "What is the moderation and legal-liability plan for v1, now that an AI moderation layer is part of the architecture (not just a founder-as-sole-moderator model)? Define what the AI layer catches vs. what still requires human escalation, and confirm India's IT Act intermediary-liability exposure under this design.",
      "owner": "human",
      "blocking": true
    },
    {
      "question": "Is there any credible evidence (even informal) that a college administrator would pay for a 'verified official channel + anonymized sentiment insight' product, given institutions' documented preference to ban rather than buy anonymous apps? (Unchanged from iteration 0 — the B2B2C upsell remains unvalidated.)",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "What safety/escalation protocol (trained volunteers or counseling-cell tie-up) will exist before the deferred mentor/support feature is ever built? Not scored as part of v1, but flagged per house rules as a blocking future requirement.",
      "owner": "human",
      "blocking": true
    },
    {
      "question": "Under DPDP Act 2023 phased obligations, what specific consent/data-minimization design is needed for storing college-email-derived enrollment year data, even though it's never displayed as raw email?",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "Roughly size the AI-moderation inference cost per active user (classifier vs. full LLM-per-post vs. human-escalation tiers) before any scale-up decision.",
      "owner": "human",
      "blocking": false
    }
  ],
  "docs_written": "docs/01-research.md"
}
```

---

# Iteration 2 — Independent Re-Score (Evidence Update)

**Idea: UNCHANGED from iteration 1.** Only the evidence base changed, via four founder-supplied
updates, each carried with the exact provenance grade given:

1. **Campus check RESOLVED [FOUNDER-VERIFIED — founder checked the app directly]:** Incog is
   **not** active at the founder's launch campus. Greenfield for campus 1 is confirmed. This
   resolves the previously blocking campus-penetration open question.
2. **10-junior test RUN [FOUNDER-REPORTED, informal survey, n=10]:** 9/10 juniors report needing
   an anonymous way to ask what they won't ask their assigned senior publicly. Directional primary
   evidence, not rigorous research — small sample, founder-administered, no third-party audit —
   but it is exactly the cheap test iteration 0 demanded, and it resolves that blocking question.
3. **Incog toxicity / founder-suspension claim [FOUNDER TESTIMONY via a named insider source —
   founder's parent is faculty at IIT Delhi; NO public corroboration found in 2 targeted web
   searches; no screenshots]:** carried forward as uncorroborated testimony with an insider
   source — a step above pure hearsay, but still unverified. Per the evidence update, this claim
   is **no longer load-bearing** for distribution (campus 1 is greenfield regardless of whether
   Incog is toxic) or for the primary why-now framing (reweighted below to a less contingent
   argument) — it is retained only as a secondary, low-confidence data point.
4. **Moderation/liability plan [PARTIAL FOUNDER ANSWER]:** AI moderation live from day 1 (treated
   as a legal/safety shield, not just a differentiator); the suspension precedent (item 3) is
   explicitly cited by the founder as motivating personal-risk seriousness; IT Act intermediary
   compliance (grievance mechanism, takedown process) accepted as a hard TRD requirement;
   Q&A-first format noted as structurally lower-risk than confession/rant formats.

Each dimension is re-judged independently below, reusing iteration 0/1's underlying evidence
where still applicable (Fizz, UNC bans, DPDP Act, placement-committee complaints) and weighting
the four new items on their own merits.

### 1. Problem Severity — Score 8/10 (confidence: medium) — up from 7

The single biggest severity update is item 2: a direct, on-point, primary data point (9/10) on
the exact mechanism claimed from the start — not a hypothetical "would you use this app" stated
preference, but a retrospective behavioral question ("did you avoid asking your senior something
you needed to ask"). That makes it stronger than ordinary stated-preference evidence, though it
still falls short of true revealed behavior (no money or observed switching involved) and carries
real limitations: n=10, single campus, founder-administered (real risk of social-desirability
bias or a leading question), no independent replication. Graded as directional primary evidence,
per the coordinator's instruction — enough to move the needle, not enough to claim "acute."

Combined with the pre-existing evidence base (institutional mentor-program failures documented,
grassroots confession-page demand, Incog's own multi-campus existence, Fizz's global scale), this
now clears the "strong" band with real behavioral corroboration of the specific mechanism, not
just adjacent proxies. It does not reach "acute" (9-10), which requires people already spending
real time/money specifically to escape this exact pain — the 9/10 result is self-reported
avoidance, not demonstrated escape-seeking spend.

Item 3 (Incog toxicity/suspension) is noted but **not** used to raise this score — it remains
uncorroborated testimony and, per house rules, is not treated as evidence of anything beyond
itself.

```json
{
  "dimension": "problem_severity",
  "score": 8,
  "confidence": "medium",
  "severity": "painkiller, approaching acute on the specific mechanism",
  "frequency": "occasional-to-weekly",
  "status_quo": "assigned senior mentors + public WhatsApp groups; now directly evidenced as inadequate by a targeted primary survey, not just inferred",
  "evidence": [
    "[FOUNDER-REPORTED, informal survey, n=10] 9/10 juniors report avoiding asking their assigned senior something they needed to ask — direct, on-point, primary evidence of the exact mechanism claimed, though small-sample and non-independent",
    "LinkedIn thread on Indian MBA placement-committee power abuse — institutional recognition the senior/junior hierarchy is already broken (carried from iteration 0)",
    "Live direct competitor 'Incog' (flitting.app) already verified-anonymous at 8+ named Indian colleges, including placement salary-sharing — revealed-behavior proof of category demand (carried from iteration 0)",
    "Fizz (US comp): 80->700+ campuses, 1M+ users, $41.5M raised 2023-2026 — category has durable scaling demand (carried from iteration 0)",
    "[FOUNDER TESTIMONY, insider source, uncorroborated] Incog toxicity/suspension claim — noted only, not used to raise this score"
  ],
  "terminal_fail": false,
  "verdict": "Proceed — the core mechanism claim now has direct, if informal, primary evidence behind it, closing the single biggest gap iteration 0 and 1 flagged; a larger/independent replication would still strengthen confidence further."
}
```

### 2. Willingness To Pay — Score 5/10 (confidence: medium) — unchanged

No new evidence in this update bears directly on the payer/monetization question. The evidence
items are about campus penetration, problem validation, a competitor's alleged toxicity, and
moderation/liability — none change who pays, what they'd pay, or whether revealed payment
evidence exists. Score and reasoning carry forward unchanged from iteration 1: the ad-model pivot
(Fizz's named advertiser relationships) remains the only evidenced payer, still scale-gated and
still orthogonal to this product's specific differentiation; the college-pays B2B2C upsell
remains unvalidated, and institutions' documented ban-not-buy instinct (UNC system) is unchanged.

```json
{
  "dimension": "willingness_to_pay",
  "score": 5,
  "confidence": "medium",
  "payer": "Advertisers buying Gen-Z/college audience reach (per Fizz's proven model) — unchanged; college-pays B2B2C remains a demoted, unvalidated future upsell",
  "revealed_payment_evidence": [
    "Fizz's named advertiser relationships (Perplexity, Quizlet, Sony Pictures, Amazon) — carried forward unchanged from iteration 1; no new payment evidence surfaced in this update"
  ],
  "value_to_price_multiple": "Unchanged — standard ad CPM economics apply only once at multi-campus scale; not computable for a single validated campus",
  "pricing_signal": {
    "likely_model": "usage-based/CPM advertising at scale (proven); B2B2C subscription remains speculative",
    "rough_price_band": "not determinable pre-scale"
  },
  "pain_to_pay_gap": "Unchanged — minimal gap for the advertiser payer once scale exists, but a real scale gap at the single-campus validation stage.",
  "terminal_fail": false,
  "payer_pivot": null,
  "verdict": "Unchanged — no new evidence this update bears on willingness to pay; the ad-model pivot remains the only evidenced but scale-gated payer."
}
```

### 3. Distribution — Score 7/10 (confidence: medium-high) — up from 6

The campus check (item 1) directly resolves distribution's biggest flagged risk from both prior
iterations: whether the launch campus is actually occupied by Incog. It is now **founder-verified**
that it is not — a real, meaningfully de-risking update, though still single-source (the founder's
own check) rather than independently audited. This converts the launch from "uncontested in
theory, pending verification" to "confirmed uncontested," which is a genuine improvement to
reachability and to the near-term saturation picture specifically at campus 1.

Per the evidence update's own instruction, the toxicity claim (item 3) is no longer load-bearing
here — the founder isn't relying on Incog being bad to win users away from it; there simply isn't
an incumbent at this campus to win users away from. That actually simplifies and strengthens the
distribution case: it needs no contingent premise at all for campus 1.

What keeps this at 7 rather than higher: (a) the broader Indian market remains highly saturated
(Incog is live at 8+ other top colleges and has a proven, working campus-by-campus expansion
motion), so the greenfield advantage at campus 1 is real but plausibly temporary — Incog could
expand there later, and there is no evidence of how much runway that greenfield window has; (b)
the campus-1-only verification doesn't change repeatability for campus 2+, which will very likely
re-encounter Incog's existing footprint. Founder-channel fit is unchanged and remains a genuine,
rare strength.

```json
{
  "dimension": "distribution",
  "score": 7,
  "confidence": "medium-high",
  "reachable": "yes — confirmed uncontested at the launch campus [FOUNDER-VERIFIED]",
  "primary_motion": "community — founder-seeded, no longer requiring a comparative/challenger message to win users away from an incumbent at campus 1",
  "incumbent_motion": "Fizz and Incog both validate the single-campus-first, ambassador-led, campus-by-campus expansion motion; Incog demonstrably runs this playbook and could reach this campus later, which is the main residual risk",
  "repeatability": "semi-repeatable — proven at scale by Fizz/Incog, but campus 2+ will likely re-encounter Incog's existing footprint",
  "founder_channel_fit": "Strong and unchanged — founder is a current student at the launch campus with real batchmate/senior/WhatsApp access",
  "saturation": "low at the specific launch campus (confirmed); high in the broader Indian market",
  "terminal_fail": false,
  "recommended_fix": null,
  "verdict": "Proceed — the founder-verified greenfield confirmation removes the single biggest distribution risk flagged across two prior iterations; the residual risk is that this advantage is local and plausibly temporary, not a durable moat, so speed to build density matters."
}
```

### 4. Why Now — Score 6/10 (confidence: medium) — up from 5

Re-weighted per the evidence update's explicit instruction: away from the toxicity-contingent
framing (item 3, still uncorroborated after further scrutiny — now with an insider source, but
also now explicitly flagged as not load-bearing) and toward a simpler, more robust land-grab
thesis: **category demand is proven in India** (Incog's own multi-campus success), **this specific
campus is confirmed open** (item 1, founder-verified), and there is real **urgency to land the
wedge before Incog's already-demonstrated expansion machine reaches this campus**. This thesis
rests on two directly-verified facts (category proof via Incog's existence; campus openness via
the founder's direct check) plus one reasonable, evidenced inference (Incog will plausibly expand
here eventually, given its own demonstrated multi-campus growth pattern) — a meaningfully more
robust foundation than iteration 1's single-source toxicity claim.

This is a genuine improvement, but the score is not pushed higher than 6 because the "incumbent
inertia" argument is now essentially **"they haven't gotten to it yet,"** not a structural reason
they can't or won't — Incog has a proven, working expansion playbook, so this window could close
at any time on no notice. That is meaningfully weaker than a structural-inertia argument (e.g., a
comp that's conflicted or organizationally slow) and caps this from the 7-8 "strong" band. The
underlying category-level enabling shift (Gen Z behavior, rising) is unchanged and still real.

```json
{
  "dimension": "why_now",
  "score": 6,
  "confidence": "medium",
  "enabling_shift": "Behavior: pseudonymous, campus-gated social apps crossed into mainstream Gen Z acceptance in the last ~2-3 years (Fizz: 80->700+ campuses, 1M+ users, $41.5M raised, 2023-2026) — unchanged and still real",
  "tailwind_direction": "rising",
  "timing_risk": "on_time, but explicitly time-limited — the launch campus is confirmed open now, but Incog has a proven, working expansion playbook and could reach it at any time",
  "incumbent_inertia": "Weak-but-not-zero: Incog hasn't reached this specific campus yet, but there is no structural reason it can't or won't — this is a live land-grab window, not a durable structural moat",
  "terminal_fail": false,
  "recommended_fix": "Monitor for early signals of Incog's expansion toward this campus (ambassador recruiting posts, social mentions) and prioritize speed to build density/retention before that window can close; do not treat the greenfield status as permanent.",
  "verdict": "Sharpen-timing, improved — the reframed land-grab thesis rests on two directly-verified facts rather than one uncorroborated claim, a real improvement, but the window is explicitly urgent and not structurally protected, so speed is the operative constraint, not a comfortable head start."
}
```

### 5. Unit Economics — Score 4/10 (confidence: low) — unchanged

Re-judged fresh: none of the four new evidence items change the fundamental revenue-side fact —
v1 still builds zero monetization by explicit design, and the only evidenced pivot (Fizz's ad
model) still only pays off at multi-campus scale this validation-stage app won't have. Two items
have secondary, partially-offsetting effects on the cost side: the confirmed greenfield campus
(item 1) plausibly lowers near-term CAC (no need for expensive comparative/challenger marketing
to peel users off an incumbent that isn't there), which is a modest positive; the moderation
commitment (item 4) converts AI-moderation from an optional, unsized future risk into a **committed
day-1 cost** — scope is now clearer, but this is still unsized in dollar terms and is a mandatory
cost from launch, not a deferred one, which is a modest negative for near-term burn even as it
reduces legal/safety risk. The 9/10 validation result (item 2) raises confidence that the
validation-stage success metrics (density, WAU, D30 retention) are achievable, but that is a
probability-of-success input, not a change to the LTV/CAC math itself.

These effects are real but roughly offsetting and secondary to the dominant fact that this
remains, by design, a pre-revenue validation exercise. The score is held at 4 rather than moved,
reflecting that the core economics picture is unchanged even though execution confidence and cost
clarity have both modestly improved.

```json
{
  "dimension": "unit_economics",
  "score": 4,
  "confidence": "low",
  "ltv_estimate": "~$0 during the validated v1 window by explicit design — unchanged from iteration 1; ad-model pivot still requires multi-campus scale not reached during v1",
  "cac_estimate": "Likely modestly lower than iteration 1's estimate — confirmed greenfield campus removes the need for comparative/challenger marketing spend — but still not precisely computable",
  "ltv_cac_ratio": "not meaningfully computable pre-revenue — would be a fabricated number, not an estimate",
  "cac_payback_months": null,
  "gross_margin": "Not yet computable; AI moderation is now a committed day-1 cost (clearer scope, still unsized in dollar terms) rather than a deferred/optional one",
  "binding_constraint": "Still no validated revenue during the scoped v1 window; this is the dominant fact and is unchanged by this evidence update",
  "terminal_fail": false,
  "recommended_fix": "Now that AI moderation is a committed day-1 cost, get even a rough per-active-user inference-cost estimate before launch; use the 9/10 validation signal to set a concrete, falsifiable D30 retention target for the campus-1 exercise rather than a placeholder metric.",
  "verdict": "Unchanged at a modest bump in confidence only — the core fact (pre-revenue by design during v1) is untouched by this evidence update; two secondary, roughly offsetting cost effects (lower CAC via greenfield, but a now-committed moderation cost) don't move the score."
}
```

### Composite Score — Iteration 2

```
composite = (3·8 + 3·5 + 2·7 + 2·4 + 1·6) / 11
          = (24 + 15 + 14 + 8 + 6) / 11
          = 67 / 11
          = 6.09
```

Target to pass: **6.5**. No dimension terminal-failed. **Composite 6.1 < 6.5 → REFINE (again, but
close)** — up from iteration 1's 5.5. The two resolved blocking questions (campus check, 10-junior
test) drove real, independently-justified improvements in problem_severity (7→8), distribution
(6→7), and — via the reweighted, less-contingent land-grab framing — why_now (5→6).
Willingness_to_pay and unit_economics are unchanged: neither received evidence in this update that
bears on payer/monetization economics. The gap to target is now small (0.4) and concentrated in
unit_economics (still pre-revenue by design) and willingness_to_pay (still scale-gated).

---

## Handoff — Iteration 2 (superseded — see Iteration 3 below for the current handoff)

```json
{
  "artifact": "research",
  "idea": "Reputation-first anonymous college Q&A network (college-email verified, persistent pseudonyms + verified-year badges, junior-senior placement/course Q&A wedge), positioned as the challenger to Incog in a confirmed-open launch campus",
  "iteration": 2,
  "dimension_scores": {
    "problem_severity": 8,
    "willingness_to_pay": 5,
    "distribution": 7,
    "unit_economics": 4,
    "why_now": 6
  },
  "composite_score": 6.1,
  "target": 6.5,
  "terminal_fail": false,
  "verdict": "refine",
  "weakest_fixable_dimensions": ["unit_economics", "willingness_to_pay", "why_now", "distribution"],
  "fixes_available": [
    "Get a rough per-active-user AI-moderation inference cost estimate now that it's a committed day-1 cost, and use the 9/10 validation signal to set a concrete, falsifiable D30 retention target for the campus-1 validation exercise.",
    "Treat the advertiser-payer thesis as scale-gated and plan runway accordingly; do not assume near-term ad revenue during the single-campus validation stage.",
    "Monitor for early signals of Incog's expansion toward the launch campus and prioritize speed to build density/retention before the confirmed-open window can close — it is not a durable structural moat.",
    "If resourcing allows, replicate the 10-junior test at slightly larger scale or with independent (non-founder) administration to firm up confidence in the core mechanism claim beyond an informal n=10."
  ],
  "key_evidence": [
    "[FOUNDER-VERIFIED] Incog is not active at the founder's launch campus — resolves the previously blocking campus-penetration question and confirms greenfield for campus 1",
    "[FOUNDER-REPORTED, informal survey, n=10] 9/10 juniors report avoiding asking their assigned senior something they needed to ask — direct, on-point (if small-sample, non-independent) primary evidence for the core problem mechanism",
    "[FOUNDER TESTIMONY, insider source, uncorroborated after 2 targeted searches] Incog's creator was reportedly suspended and Incog is alleged to be toxic/unmoderated — retained as a secondary data point only, no longer load-bearing for distribution or the primary why-now framing",
    "Founder commits to AI moderation live from day 1 as a legal/safety shield and accepts IT Act intermediary compliance (grievance mechanism, takedown process) as a hard TRD requirement — converts the moderation/liability question from unanswered to answered-in-principle",
    "Fizz's named advertiser relationships (Perplexity, Quizlet, Sony Pictures, Amazon) remain the only evidenced payer for this category, still scale-gated and unchanged from iteration 1"
  ],
  "open_questions": [
    {
      "question": "10-junior validation test — RESOLVED [FOUNDER-REPORTED, n=10, informal]: 9/10 report the core avoidance behavior. Recommend, but do not require, an independent/larger replication to firm up confidence beyond an informal single-founder-administered survey.",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "Campus Incog-penetration check — RESOLVED [FOUNDER-VERIFIED]: Incog is not active at the launch campus; greenfield confirmed for campus 1.",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "Independently verify the Incog toxicity/founder-suspension claim (review mining, direct student interviews, or trial usage) — currently founder testimony via a named insider source with no public corroboration found after 2 targeted searches. No longer load-bearing for distribution or the primary why-now thesis, but still worth confirming for the founder's own risk awareness and as a secondary claim.",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "Moderation and legal-liability plan — ANSWERED IN PRINCIPLE, specification deferred to PRD/TRD: founder commits to AI moderation from day 1, accepts IT Act intermediary compliance (grievance mechanism, takedown process) as a hard requirement, and notes Q&A-first as structurally lower-risk than confession formats. What remains is normal downstream specification (response-time SLAs, who staffs grievance handling, escalation contacts, what the AI layer catches vs. routes to a human) — this is TRD-level detail work, not a research-stage gap, so it is marked non-blocking.",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "Is there any credible evidence (even informal) that a college administrator would pay for a 'verified official channel + anonymized sentiment insight' product, given institutions' documented preference to ban rather than buy anonymous apps? (Unchanged — the B2B2C upsell remains unvalidated.)",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "What safety/escalation protocol (trained volunteers or counseling-cell tie-up) will exist before the deferred mentor/support feature is ever built? Not scored as part of v1, but flagged per house rules as a blocking future requirement.",
      "owner": "human",
      "blocking": true
    },
    {
      "question": "Under DPDP Act 2023 phased obligations, what specific consent/data-minimization design is needed for storing college-email-derived enrollment year data, even though it's never displayed as raw email?",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "Roughly size the AI-moderation inference cost per active user (classifier vs. full LLM-per-post vs. human-escalation tiers) now that it is a committed day-1 cost, not a deferred one.",
      "owner": "human",
      "blocking": false
    }
  ],
  "docs_written": "docs/01-research.md"
}
```

---

# Iteration 3 — Independent Re-Score (Monetization Ladder Change Only)

**Idea, positioning, evidence base, and open questions: UNCHANGED from iteration 2.** The single
change is the monetization ladder gaining a near-term rung. Old ladder: zero revenue during v1 →
Fizz-style multi-campus ads/marketplace at scale → college B2B2C as a distant LOI-gated upsell.
New ladder: same three rungs, **plus a rung 1 attainable at campus-1 scale** — hyperlocal campus
sponsorship (coaching institutes for CAT/GATE/placement-prep, local businesses, PG/hostel
operators) as sponsors/advertisers to a verified, dense single-campus audience. Explicitly
sequenced *after* the retention experiment succeeds: sign 1-2 campus sponsors at a modest monthly
rate as "revenue experiment #2," to prove the mechanism and make LTV/CAC computable at small
scale. Sponsored posts are a standard ad unit — no new product surface.

**Independent verification of the underlying market claim** (orchestrator-supplied as
ASSUMPTION-grade: "Indian businesses, especially coaching institutes and local merchants, already
spend on single-campus student marketing"): targeted searches were run across four angles —
coaching-institute campus ambassador programs, college fest sponsorship budgets, PG/hostel
advertising, and college-centric out-of-home (OOH) advertising agencies. Findings:

- **Coaching-institute campus ambassador programs are real, large, and revealed, not stated.**
  Major ed-tech/coaching brands (Physics Wallah, Unacademy, and others) run active,
  commission/stipend-based campus ambassador programs recruiting students at individual campuses
  to market to their peers — thousands of listed positions, an established category with its own
  guides and job boards. This is real marketing spend targeted at single-campus student audiences,
  not multi-campus/national reach.
- **A dedicated "college-centric advertising" agency category exists in India** (e.g., Ginger
  Media Group), explicitly selling placements at campus gates, hostels/PGs, and college events to
  brands wanting Gen-Z reach — with cited performance metrics (e.g., campus-gate exposure to
  5,000+ students daily, claimed ~60% recall lift) and confirmation that "regional marketing teams
  often have dedicated budgets for college activations." This is a real, named, monetized category
  — independent evidence the underlying market exists, not an assumption.
- **Concrete revealed prices exist and are non-trivial:** hoardings near coaching hubs (e.g.,
  Mukherjee Nagar, Delhi) run up to ~INR 100,000/month; college fest sponsorship/stall fees run
  ~INR 5,000-8,000 per event, with total fest budgets of ~INR 4-5 lakh; paper/flyer distribution
  inside colleges is a named, common coaching-institute tactic. These are real prices already being
  paid for reaching the same audience through other (physical) channels — a strong price anchor
  for a "modest monthly rate" digital sponsorship.
- **Match-quality check:** coaching institutes selling CAT/GATE/placement-prep services are indeed
  well-matched to an audience partly defined by placement anxiety — this is a targeting advantage
  over generic Gen-Z reach (the kind Fizz's national advertisers buy), not a stretch.
- **What is NOT yet evidenced:** no one has been found selling *digital in-app sponsored posts on
  a single-campus anonymous social app specifically* to local advertisers in India. The closest
  analogs — Instagram college confession/meme pages — are a plausible parallel (general Instagram
  sponsored-post market rates exist), but no specific rate card or transaction for an Indian
  college confession page was located. Fizz's own advertiser base, notably, is national brands
  (dating apps, food delivery, fintech), not local single-campus SMBs — so Fizz is *not* direct
  proof of the hyperlocal-SMB-sponsor model; it's a different, adjacent monetization pattern.

**Verdict on the claim:** substantially supported for the underlying premise (Indian coaching
institutes and campus-proximate businesses already spend real, revealed money on reaching
single-campus student audiences, via physical channels, at prices anchoring reasonably to a
"modest monthly" digital sponsorship). **Not yet supported** for the specific claim that this
spend will transfer to a brand-new digital in-app product — that remains an unproven
channel-translation, appropriately gated behind the founder's own "sign 1-2 sponsors" experiment,
not assumed. Scores below reflect this: credit given for the verified market-existence claim,
withheld for the unproven product-specific translation.

### Willingness To Pay — Score 7/10 (confidence: medium) — up from 5

Re-judged fresh: the payer is now hyperlocal campus sponsors — a real, defined, already-spending
payer, independently verified above via a named agency category, concrete revealed prices, and
large ed-tech campus-ambassador budgets. This is a materially stronger evidentiary footing than
either iteration 0's zero-precedent B2B2C thesis or iteration 1/2's Fizz-ad-model thesis (real,
but proven only at national-brand, multi-campus scale this app won't have for a long time). Here,
the payer already spends at exactly the scale this product operates at (single campus), which
directly resolves the "scale gap" that capped the previous score.

Value-to-price: strong match quality for the archetypal sponsor (placement-prep coaching
institutes buying access to a placement-anxious audience), and the price anchor is reasonable — a
"modest monthly rate" sponsorship is plausible against known local ad-buy norms (fest stall fees,
sub-hoarding-tier pricing) without requiring the advertiser to accept an unfamiliar price
paradigm.

Score is held at 7, not pushed to 8-9, because the specific channel-translation (physical ad
budgets moving to a new, unproven digital in-app product) is real execution risk that hasn't been
tested — zero sponsors have signed. This is a strong, evidence-backed payer thesis with an
obvious model, not yet a proven one for this exact product.

```json
{
  "dimension": "willingness_to_pay",
  "score": 7,
  "confidence": "medium",
  "payer": "Hyperlocal campus sponsors (coaching institutes for CAT/GATE/placement-prep, local businesses, PG/hostel operators) at campus-1 scale — new primary near-term thesis; Fizz-style multi-campus ads and college B2B2C remain further up the ladder, unchanged and still speculative at their own stages",
  "revealed_payment_evidence": [
    "Major coaching/ed-tech brands (Physics Wallah, Unacademy) run active, paid/commission campus ambassador programs targeting individual campuses — real, revealed single-campus marketing spend",
    "A dedicated 'college-centric OOH advertising' agency category exists in India (e.g., Ginger Media Group) selling campus-gate/hostel/PG/event placements to brands, with regional teams holding dedicated college-activation budgets",
    "Concrete revealed prices: hoardings near coaching hubs up to ~INR 100,000/month; fest sponsorship/stall fees ~INR 5,000-8,000/event; paper/flyer distribution in colleges as a standard coaching-institute tactic"
  ],
  "value_to_price_multiple": "Favorable for the archetypal sponsor: placement-prep coaching institutes reaching a placement-anxious audience is a strong targeting match versus generic reach; a 'modest monthly' digital sponsorship anchors well below known physical channel costs (e.g., hoarding rates), suggesting room for the advertiser to see clear value at a price this product can plausibly charge",
  "pricing_signal": {
    "likely_model": "flat monthly sponsorship / sponsored post (standard ad unit, no new product surface)",
    "rough_price_band": "Anchored to local comps: plausibly in the low-thousands-of-rupees-to-low-tens-of-thousands per month per sponsor at campus-1 scale — a rough anchor, not yet an observed transaction"
  },
  "pain_to_pay_gap": "Small and mostly a channel-trust gap, not a fundamental willingness gap: this payer already spends on reaching this exact audience via other (physical) channels; what's unproven is whether they'll trust budget to a new, unproven digital surface before it has a track record.",
  "terminal_fail": false,
  "payer_pivot": null,
  "verdict": "Proceed — independent verification substantially supports the underlying market claim (real, revealed local ad spend by coaching institutes and campus-proximate businesses exists at exactly this scale); the remaining risk is channel-translation execution, not payer existence, which is why this is scored strong but not yet proven."
}
```

### Unit Economics — Score 5/10 (confidence: low) — up from 4

Re-judged fresh: for the first time, a rough LTV:CAC estimate is computable using conservative,
comp-anchored assumptions, rather than being genuinely N/A. Shown explicitly, with assumptions
named (no `calc.py` script was available in this environment; computed by hand):

- **Assumed price:** ~INR 8,000/month per sponsor [ASSUMPTION, anchored to the low end of the
  verified comps above — roughly one recurring fest-stall-fee equivalent, chosen conservatively
  since this is an unproven digital surface and should be priced to close the first 1-2 deals, not
  to maximize revenue].
- **Assumed sponsor retention:** ~6 months average [ASSUMPTION — conservative for an unproven,
  early-stage product with no retention track record yet].
- **Gross margin on this revenue line:** ~90%+ — a sponsored post is "no new product surface, no
  feature added" per the founder's own framing, so incremental cost to serve is minimal (light
  account-management time only).
- **LTV per sponsor:** ~INR 8,000 x 6 x 0.9 ≈ **INR 43,200** (~$500).
- **CAC per sponsor:** founder-led, single-founder outreach to local businesses — low cash cost,
  real uncosted time; no sales team. [ASSUMPTION: treated as low, non-zero — a handful of founder
  sales-hours per closed sponsor, not a formal figure].
- **Illustrative LTV:CAC:** comfortably above 3:1 under these conservative assumptions — a
  plausible, healthy-looking ratio.

This is a genuine methodological improvement over iterations 0-2, where the ratio was explicitly
**not computable** because no monetization mechanism existed at reachable (campus-1) scale at all.
Here, one does, anchored to real comps, not fantasy numbers.

However, the score is deliberately **not** pushed into the "healthy" (7-8) band, because every
number above is a **projection, not an observed result** — zero sponsors have been signed, the
whole rung is explicitly sequenced behind the retention experiment succeeding first, and the
core translation risk flagged in the WTP write-up (will local advertisers actually trust budget to
this specific new product) is unresolved. The honest characterization is: *the math now works on
paper, under conservative and reasonably-anchored assumptions, but nothing here has happened yet.*
That combination — computable and plausible, but wholly unrealized and gated behind a prior
unproven experiment — lands at 5 (moderate), not higher.

```json
{
  "dimension": "unit_economics",
  "score": 5,
  "confidence": "low",
  "ltv_estimate": "~INR 43,200 (~$500) per sponsor — assumes ~INR 8,000/month price, ~6-month average retention, ~90% gross margin (sponsored post = no new product surface). All three inputs are conservative assumptions anchored to verified local ad-rate comps, not observed data — zero sponsors signed yet.",
  "cac_estimate": "Low cash cost via founder-led direct outreach to local coaching institutes/businesses; real uncosted founder time, no sales team; not precisely computable but plausibly low relative to the assumed LTV",
  "ltv_cac_ratio": "Illustratively >3:1 under the stated conservative assumptions — the first computable (rather than N/A) ratio in this idea's research history, but entirely a projection pending the actual sponsor-acquisition experiment",
  "cac_payback_months": 2,
  "gross_margin": "~90%+ on the sponsorship revenue line specifically (no new product surface); still unresolved on the core product's AI-moderation serving cost, which remains a separate, unsized cost as noted in iteration 2",
  "binding_constraint": "The ratio is now computable and plausible on paper, but is wholly unrealized — no sponsor has been signed, and this revenue rung is explicitly gated behind the retention experiment succeeding first, so it remains two unproven experiments deep, not a validated result",
  "terminal_fail": false,
  "recommended_fix": "Run revenue experiment #2 as planned, after the retention experiment: approach 3-5 local coaching institutes/businesses with a concrete sponsored-post rate card anchored to the local ad-rate comps found here (~fest-stall-fee to sub-hoarding-rate range) and see if even one converts. A single closed deal would convert this from a projected ratio to an observed one and is the single highest-leverage next step for this dimension.",
  "verdict": "Improved from not-computable to computable-and-plausible under conservative, comp-anchored assumptions — a real methodological gain — but scored at 'moderate,' not 'healthy,' because it remains entirely a projection with zero sponsors signed and is gated behind a prior unproven experiment."
}
```

### Other dimensions — considered, not re-scored

- **Problem severity (8/10):** unaffected — the monetization ladder change has no bearing on the
  core student-side problem evidence (mentor-program failures, confession-page demand, Incog's
  existence, the 9/10 informal survey). Unchanged from iteration 2.
- **Distribution (7/10):** unaffected — the new revenue rung adds a business-development/sales
  motion aimed at local advertisers, which is a distinct channel from the student-side
  community/ambassador user-acquisition motion this dimension scores. The confirmed-greenfield
  campus finding from iteration 2 is unchanged. Unchanged from iteration 2.
- **Why now (6/10):** unaffected — the land-grab timing thesis (category proven via Incog,
  campus confirmed open, urgency before Incog's expansion) is unrelated to monetization sequencing.
  Unchanged from iteration 2.

### Composite Score — Iteration 3

```
composite = (3·8 + 3·7 + 2·7 + 2·5 + 1·6) / 11
          = (24 + 21 + 14 + 10 + 6) / 11
          = 75 / 11
          = 6.82
```

Target to pass: **6.5**. No dimension terminal-failed. **Composite 6.8 ≥ 6.5 → PASS.** This is the
first passing composite across three iterations, driven entirely by an independently-verified
willingness-to-pay upgrade (5→7) and a modest, honestly-projected unit-economics improvement
(4→5) — both traced to real, checkable evidence (a named Indian college-centric OOH advertising
agency category, concrete revealed local ad prices, and large campus-ambassador programs from
major ed-tech brands), not to accepting the founder's assumption at face value. The pass is
real but not risk-free: unit economics remains a paper projection with zero sponsors signed, the
why-now window (6/10) is explicitly time-limited, and the mentor-feature safety-protocol open
question remains blocking for that specific future feature (though it does not gate this v1
wedge's pass, per house rules — the mentor feature is explicitly out of v1 scope).

---

## Handoff — Iteration 3

```json
{
  "artifact": "research",
  "idea": "Reputation-first anonymous college Q&A network (college-email verified, persistent pseudonyms + verified-year badges, junior-senior placement/course Q&A wedge), launching at a confirmed-open campus, with a monetization ladder now including a near-term hyperlocal campus-sponsorship rung",
  "iteration": 3,
  "dimension_scores": {
    "problem_severity": 8,
    "willingness_to_pay": 7,
    "distribution": 7,
    "unit_economics": 5,
    "why_now": 6
  },
  "composite_score": 6.8,
  "target": 6.5,
  "terminal_fail": false,
  "verdict": "pass",
  "weakest_fixable_dimensions": ["unit_economics", "why_now", "distribution", "willingness_to_pay"],
  "fixes_available": [
    "Run revenue experiment #2 (sponsor acquisition) only after the retention experiment succeeds, as planned: approach 3-5 local coaching institutes/businesses with a rate card anchored to verified local ad-rate comps; one closed deal converts unit economics from a projection to an observed result.",
    "Monitor for early signals of Incog's expansion toward the launch campus and prioritize speed to build density before the confirmed-open window closes — it is not a durable structural moat.",
    "If resourcing allows, replicate the 10-junior test at larger scale or with independent administration to firm up confidence beyond an informal n=10.",
    "Size the AI-moderation inference cost per active user before scale, independent of the new sponsorship revenue line."
  ],
  "key_evidence": [
    "Independently verified: a named 'college-centric OOH advertising' agency category exists in India (e.g., Ginger Media Group) selling campus-gate/hostel/PG/event placements, with regional brand teams holding dedicated college-activation budgets",
    "Independently verified: concrete revealed local ad prices exist (hoardings near coaching hubs up to ~INR 100,000/month; fest sponsorship/stall fees ~INR 5,000-8,000/event) — real price anchors for a 'modest monthly' digital sponsorship",
    "Independently verified: major ed-tech/coaching brands (Physics Wallah, Unacademy) run active, paid campus ambassador programs targeting individual campuses — real single-campus marketing spend, not multi-campus/national",
    "NOT found: any existing case of a local Indian business paying for a sponsored post specifically on a single-campus anonymous social app — this remains the unproven channel-translation, appropriately gated behind an actual sponsor-acquisition experiment",
    "Fizz's own advertiser base is national brands (dating apps, food delivery, fintech) seeking broad Gen-Z reach, not local single-campus SMBs — Fizz is an adjacent but distinct monetization pattern, not direct proof of the hyperlocal-sponsor model"
  ],
  "open_questions": [
    {
      "question": "10-junior validation test — RESOLVED [FOUNDER-REPORTED, n=10, informal]: 9/10 report the core avoidance behavior. Recommend, but do not require, independent/larger replication.",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "Campus Incog-penetration check — RESOLVED [FOUNDER-VERIFIED]: Incog is not active at the launch campus; greenfield confirmed for campus 1.",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "Independently verify the Incog toxicity/founder-suspension claim — still uncorroborated testimony via a named insider source; not load-bearing for any scored dimension, but worth confirming for the founder's own risk awareness.",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "Moderation and legal-liability plan — answered in principle (AI moderation from day 1, IT Act intermediary compliance accepted as a hard requirement); detailed specification (SLAs, staffing, escalation) deferred to PRD/TRD as normal downstream work.",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "Run revenue experiment #2 (sign 1-2 hyperlocal campus sponsors) only after the retention experiment succeeds, to convert the unit-economics projection into an observed result — the single highest-leverage remaining validation step.",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "Is there any credible evidence that a college administrator would pay for a 'verified official channel + anonymized sentiment insight' product? The B2B2C upsell remains unvalidated and is now the third, most-distant rung on the monetization ladder.",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "What safety/escalation protocol (trained volunteers or counseling-cell tie-up) will exist before the deferred mentor/support feature is ever built? Not scored as part of v1, but flagged per house rules as a blocking future requirement — this does not gate the v1 wedge's pass verdict, since the mentor feature is explicitly out of v1 scope.",
      "owner": "human",
      "blocking": true
    },
    {
      "question": "Under DPDP Act 2023 phased obligations, what specific consent/data-minimization design is needed for storing college-email-derived enrollment year data?",
      "owner": "human",
      "blocking": false
    },
    {
      "question": "Roughly size the AI-moderation inference cost per active user, now that it is a committed day-1 cost.",
      "owner": "human",
      "blocking": false
    }
  ],
  "docs_written": "docs/01-research.md"
}
```
