# Stage 7 — Plan: Murmur (Verified Anonymous Campus Q&A)

**Date:** 2026-07-18
**Inherits:** `docs/02-prd.md` (R1–R8 P0s), `docs/03-trd.md` (modular monolith, PWA client,
PostgreSQL, `offline_write_queue`, A1–A12), `docs/04-ux.md` (F1–F10, S1–S17),
`docs/05-schema.md` (14 tables, postgresql), `docs/06-ui.md` (17 component briefs,
`status: complete_as_briefs`, `built: false`).
**Scope:** sequencing only. WHAT (PRD) and HOW (TRD/schema/UI) are frozen; no P0 is rescoped
here. Estimates are S/M/L and every one of them is `[ASSUMPTION]` — no hour figures exist
anywhere in this document, deliberately.

---

## Phase 0 gate — record of disposition

**Primary blocks:** `02` (`artifact: "prd"`, 8 non-empty `p0_requirements`), `03`
(`artifact: "trd"`), `06` (`artifact: "ui"`, 17 non-empty `components`) — all present,
parseable, correct artifact values. `04` (`artifact: "ux"`) and `05` (`artifact: "schema"`)
read for escalations and open questions. Gate structural checks pass.

**Blocking-flag incident (named, not buried).** The strict gate rule refuses on any
`blocking: true` in any of the five handoffs. Two survive, both the same P2-B question, in the
two oldest frozen documents:

- `docs/02-prd.md` handoff, verbatim: *"What safety/escalation protocol (trained volunteers or
  counseling-cell tie-up) will exist before the deferred mentor/support feature is ever built?
  Not scored as part of v1, but flagged per house rules as a blocking future requirement — this
  does not gate the v1 wedge's pass verdict, since the mentor feature is explicitly out of v1
  scope."* — `"owner": "human", "blocking": true`
- `docs/03-trd.md` handoff, verbatim: *"What safety/escalation protocol will exist before the
  deferred mentor/support feature (P2-B) is ever built? Scoped to P2-B only per the PRD's own
  text; does not gate this TRD's architecture."* — `"owner": "human", "blocking": true`

**Disposition:** this exact question was re-marked `blocking: false` by human decision
(**gurkanwaldeep, 2026-07-18**), recorded with attribution inside the question text of the
`docs/04-ux.md` and `docs/05-schema.md` handoffs and in `docs/06-ui.md` (§Status and
`escalations`: *"Prior gate failure (P2-B blocking flag in upstream handoffs) resolved
2026-07-18 by human decision"*). The `02`/`03` flags are the stale pre-decision state of the
same question: those documents are frozen and no downstream stage (including this one) may
edit them, so the flags could never be updated in place. That an upstream decision was not
re-issued into the documents that originated the flag **is a pipeline incident** — recorded
here and in this document's `escalations` — but it is a record-keeping incident, not a bypassed
gate: the resolving decision is human, named, dated, and in-artifact. This plan proceeds on
that decision. The question itself enters the risk register (RR-1) with status
`accepted:gurkanwaldeep` and a **hard precondition**: P2-B is never built until a human-designed
safety/escalation protocol exists. No task in this plan builds toward P2-B.

All other open questions across the five handoffs are non-blocking; each is either resolved by
a task below or carried forward in §7.

---

## 1. Delivery summary

The tracer is **R1 (college-email verification with derived year badge)**: the thinnest slice
that stands up the entire spine — repo scaffold, PWA client shell, Postgres migrations, the
first two API contracts (A1/A2), the one external integration every later milestone reuses
(email/OTP delivery), and the first four Claude Design components integrated end-to-end.
Six milestones follow the dependency order schema → API → integration per flow: tracer (M1),
Q&A core + moderation spine (M2), search/reputation/bans (M3), offline write queue (M4),
grievance + operator console (M5), instrumentation + hardening + launch gate (M6). **76 tasks**,
every one traced; UI work is sequenced as *human pastes prompts → Claude Design output lands in
repo → Claude Code integrates* per the stage-6 human decision — no task here authors visual
component code. The risk most likely to reorder everything: the external AI moderation
integration (T14) — its fail-closed posture sits in the publish path of every UGC write, so a
provider choice or outage behavior that fails testing stalls M2 and everything after it; **T54**
now front-loads a vendor-shortlist/quote spike into M1 so provider selection isn't made cold at
T14. No open question in this plan is blocking; the plan is not provisional.

**Revision note (post-stage-7 plan review, 2026-07-19):** this revision applies six structural
fixes on top of the original 48-task plan, each closing a gap identified when this document was
checked against its own §5 test-strategy table, the schema's HMAC-dependency ordering, and the
demo criterion's real-environment requirement: (1) a minimal M1 staging deployment (T49) so T11's
"real phone, real email" demo is actually executable; (2) the shared email-normalization +
keyed-HMAC utility (T50) moved from M3 into M1, since M1's own `identity_account.email_hash`
UNIQUE constraint (T4/T7) depends on the exact same procedure M3 previously invented in isolation;
(3) analytics migration + ingest (T44) moved from M6 into M1, with instrumentation (formerly one
M6 task, T45) split into per-milestone increments (T45/T51/T52/T53) so metrics accumulate real
history instead of starting a 30-day D30 clock at launch; (4) the NFR test suite (formerly one M6
task, T47) split into per-milestone authoring tasks (T55–T59) that match what §5's table already
claimed ("runs from M2/M3/M4/M5 on"), with T47 now the M6 aggregation/regression pass; (5) a
vendor-shortlist spike (T54) added to M1 so T14's provider choice isn't made without real quotes;
(6) an explicit note that Claude Design rounds T18/T25/T30/T39 may run back-to-back immediately
after T9, since all four depend only on T9 and nothing else gates them. No task's *scope* changed
— only sequencing, splitting, and two new tasks (T49, T54) that didn't exist before.

**Second revision note (quality-kit integration, 2026-07-20):** the quality-kit's 8 verification
stages (08–15) plus the `quality-kit-additions/` drop's stage 16 (privacy) and runbooks were
originally designed to run once, post-build, in three enablement waves
(`.claude/QUALITY-KIT-README.md`). `quality-kit-additions/cadence.md` (DECISION QK-4) supersedes
that wave model with a three-layer cadence tailored to this plan's own milestones: **Layer 1**
(continuous, in T3's CI — secrets/SAST/SCA scanning, the test-writer→test-verifier loop), **Layer 2**
(one agent run per milestone, promoted from warn-only to blocking on its second run — see the new
tasks T60–T71, T76), and **Layer 3** (event-triggered scoped re-checks tied to specific task types,
e.g. any `shared/` change or new migration — a standing rule in `architecture.md` §8, not discrete
tasks). This revision adds 17 tasks (T60–T76: 6 security-agent runs, 3 resilience-agent runs incl.
the M4 restore drill, 2 perf-agent runs, 1 observability-agent run, 3 privacy-agent runs, 1
ai-security-agent run, 4 human-authored runbooks) and rescopes T47/T48 to reflect DECISION QK-2
(production-test runs exactly once, at M6) and QK-6 (test-writer authors, test-verifier scores —
T55–T59 are not a second test-authoring effort). Total: **76 tasks.** See `architecture.md` §8 for
how this cadence maps onto the module/route architecture, and `quality-kit-additions/cadence.md`
itself as the authoritative source — this plan only places its tasks, it does not restate its
doctrine.

---

## 2. Milestone 1 — Tracer bullet

**P0:** `PRD:p0[R1]` — college-email verification with derived verified-year badge.
**Slice:** `S1 Email Entry (EmailEntryForm) → A1 POST /verification/initiate → S2/S3
(VerificationPendingCard, TokenConfirmForm) → A2 POST /verification/confirm →
identity_account + pseudonymous_profile tables → S4 (RegistrationOutcomePanel)`, through the
real Email/OTP Delivery Provider integration.

**Demo criterion:** a real student, on a real phone browser, against the **T49 minimal staging
deployment** (not localhost), enters their launch-campus college email on S1, receives a real
verification email, confirms the token on S3, and sees their pseudonym + VERIFIED year badge on
S4 — while an inspection of every API response in the session shows the raw email appears nowhere
(`TRD:nfrs[identity non-disclosure]`, verified in-milestone by **T55**). The unparseable-year
**blocked** state and non-campus/already-used **refused** branches render as distinct S4 states
(R1 AC2/AC3) — never a guessed year.

**Explicitly out of M1:** everything else. No Q&A, no moderation gateway, no search,
no reputation, no ban-record *guard wiring on A3/A4/A6* (that's M3/T23) — though the ban-record
*lookup mechanism itself*, and the shared email-hash/HMAC procedure it depends on (T50), are built
in M1 because A2/A11 need them from day one — no offline queue, no grievance surfaces, no
operator console. Analytics ingest (T44) and registration-funnel instrumentation (T45) **are**
in M1 (moved up from M6, see revision note in §1) so metric history starts accumulating at
tracer time. The manual-fallback *queue tooling* for unparseable years is M5 operator scope; M1
ships the blocked terminal state itself.

**Parallel/early-start tracks inside M1 (do not block the tracer's critical path):**
- **T54** — vendor-shortlist and real quotes for the External AI Moderation API (needed by M2's
  T14) can run any time from day one; it has no dependency on anything else in M1.
- **T50** — the shared email-normalization + keyed-HMAC utility is on the critical path
  (T7/T8 depend on it), not a parallel track — listed here because it is new to M1 in this
  revision (see §1).

**UI sequencing inside M1 (per the stage-6 human decision):** (a) human pastes the §2 design
contract from `docs/06-ui.md` into Claude Design once, then the §3.1–§3.4 component prompts;
(b) Claude Design output lands in the repo; (c) integration tasks wire those components to
A1/A2 and the S1–S4 state machines. `src/ui/app.css` (superseded) is deleted;
`src/ui/mock-data.js` is retained as fixture data. **Note:** Claude Design rounds 2–5
(T18/T25/T30/T39) each depend only on T9, not on each other's milestone integration work — the
human may run all five rounds back-to-back immediately once T9 lands, taking the human-mediated
round-trip latency (RR-18) off every later milestone's critical path.

---

## 3. Milestones 2–6

| ID | Theme | P0s | Exit criterion (sourced from PRD acceptance criteria) |
|---|---|---|---|
| **M2** | Q&A core + moderation spine + session | `PRD:p0[R3]`, `PRD:p0[R6]` (auto tiers), `PRD:p0[R2]` (attribution) | A verified user posts a question in a supported topic; it passes the AI moderation gate (auto-pass/auto-block/escalate-held; fail-closed on provider outage — no UGC bypasses it) and publishes under their pseudonym + year badge; another user's answer threads under it with pseudonym attribution (R3 AC1–2, R6 AC1–2, R2 AC1). Session persists across app restarts (resolves OQ-14). |
| **M3** | Archive, reputation, bans | `PRD:p0[R4]`, `PRD:p0[R5]`, `PRD:p0[R2]` (carry-forward) | Keyword/topic/cohort search returns relevant Q&A across batches, with the explicit empty state inviting a new post (R4 AC1–2); upvote/accept visibly adjusts reputation via the append-only ledger (R5 AC1); a banned email is refused re-registration even after account deletion (R5 AC2); the same pseudonym + accrued reputation carry across sessions on S11 (R2 AC2). |
| **M4** | Offline write queue + sync | `TRD:write_model[offline_write_queue]`, `PRD:p0[R6]` (sync re-entry) | 100% of writes queued offline reach a terminal state (synced/conflict/rejected) with none silently lost; every synced item re-enters the moderation gate before publish — the S12 chain queued → syncing → pending → published/blocked renders truthfully, never jumping queued → published (TRD:nfrs[offline sync reliability], TRD §3). |
| **M5** | Grievance, takedown, operator console | `PRD:p0[R7]`, `PRD:p0[R6]` (human escalation side) | A report enters a tracked, SLA-bound queue with acknowledged timestamp (R7 AC1); a valid takedown removes content within SLA with an audit-log entry (R7 AC2); grievance-officer contact is published and reachable on S15 with final legal copy (R7 AC3); AI-escalated content reaches a human decision on S16 via the new operator-decide contract (R6 AC3, closes OQ-11). |
| **M6** | Instrumentation, NFR hardening, launch gate | `PRD:p0[R8]` + all `TRD:nfrs` | Every PRD metric (registration penetration, WAU density, D30 cohorts, activation, answer liquidity, auto-vs-escalated ratio) is computable from captured events with no metric un-instrumented (R8 AC1–2); the full NFR test suite (§5) is green; launch checklist complete including DPDP consent copy and legal-reviewed SLA figures. |

---

## 4. Task list

All sizes are S/M/L and **every size is `[ASSUMPTION]`** — nothing upstream grounds an
estimate. Tasks marked **(human)** are executed by the human owner, not Claude Code; they are
sequenced here because downstream tasks depend on them. A task with no trace does not ship —
every row traces.

| ID | Task | Milestone | Depends on | Size | Trace |
|---|---|---|---|---|---|
| T1 | Repo hygiene: delete superseded `src/ui/app.css`; keep `src/ui/mock-data.js` as fixture/sample data for integration tests | M1 | — | S | `UI:deviations[0]` (repo state per stage-6 decision) |
| T2 | Project scaffold: Node.js/TypeScript modular monolith API + background worker skeleton + installable PWA client shell (routing, module layout per TRD §4), local dev environment | M1 | T1 | M | `TRD:stack.server`, `TRD:stack.client`, `TRD:architecture_pattern` |
| T3 | CI pipeline: lint, typecheck, unit + integration test runners, migration apply/rollback check on every push; **Layer-1 quality-kit checks wired in from day one** (gitleaks secrets scan — blocking, no warn-only period; semgrep SAST; osv-scanner SCA per lockfile; test-writer→test-verifier loop) per `quality-kit-additions/cadence.md` §1 | M1 | T2 | S | `TRD:nfrs[*]` (measurement harness); write-plan skill external-signal rule; `cadence.md §1` |
| T4 | Managed Postgres provisioning + migration framework; migration 001: `identity_account`, `pseudonymous_profile` (+ `verification_status_enum`, `profile_status_enum`) | M1 | T2 | M | `schema:tables[identity_account]`, `schema:tables[pseudonymous_profile]`, `TRD:stack.store` |
| T5 | Email/OTP Delivery Provider integration: send verification token, retry with backoff, resend support with cooldown; registration blocked (never defaulted) if delivery unconfirmed | M1 | T2 | M | `TRD:integrations[Email/OTP Delivery Provider]`, `PRD:p0[R1]` |
| T6 | **(human)** Founder-documented campus email/roll-number year-parsing ruleset + fixture set of real-format examples (incl. edge cases) | M1 | — | S | `TRD:risks[derived-year-badge parsing]`, `PRD:assumptions[email scheme encodes year]` |
| T7 | A1 initiate-verification endpoint: campus-domain allowlist (app config per schema assumption), duplicate-email refusal (via T50's hash utility), malformed rejection, rate limiting + attempt counters | M1 | T4, T5, T50 | M | `TRD:apis[A1]`, `PRD:p0[R1]` |
| T8 | A2 confirm-verification endpoint: token validation/expiry, year-badge derivation from T6 ruleset, pseudonym generation, blocked-on-unparseable-year (never guessed), profile creation; returns a short-lived session-bootstrap token so T12 does not retrofit the response shape | M1 | T6, T7, T50 | M | `TRD:apis[A2]`, `PRD:p0[R1]`, `UX:open_questions[OQ-14]` |
| T9 | **(human)** Claude Design round 1: paste `docs/06-ui.md` §2 design contract, then §3.1–§3.4 prompts; land EmailEntryForm, VerificationPendingCard, TokenConfirmForm, RegistrationOutcomePanel in repo | M1 | T2 | M | `UI:components[EmailEntryForm..RegistrationOutcomePanel]`, `UI:deferred[0]`, `UI:deviations[0]` |
| T10 | Integrate S1–S4: wire the four landed components to A1/A2, all states (empty/loading/error/success/blocked/refused), resend cooldown; visual QA via ui-critique-rubric against §3 briefs | M1 | T8, T9 | M | `UX:flows[F1]`, `UI:components[*S1–S4]`, `UI:deviations[0]` |
| T11 | Tracer demo (against T49's staging deployment) + identity non-disclosure spot audit: real phone, real email, response inspection shows no raw email anywhere | M1 | T10, T49 | S | `TRD:nfrs[identity non-disclosure]`, `PRD:p0[R1]` |
| T49 | *(new)* Minimal M1 staging deployment: managed app-platform hosting pointed at T4's managed Postgres, so T11's real-phone/real-email demo runs against a real environment, not localhost | M1 | T4 | S | `TRD:stack.infra`, `PRD:p0[R1]` (demo criterion) |
| T50 | *(new)* Shared email-normalization + keyed-HMAC utility (lowercase, alias-stripping, server-held pepper with documented management/rotation strategy) — the one procedure A1's duplicate check, A2's `identity_account` write, and A11's ban lookup all call identically | M1 | T4 | S | `TRD:risks[email-hash ban matching]`, `schema:escalations[HMAC pepper]` |
| T54 | *(new, parallel track — does not block M1 exit)* **(human/engineering)** AI-moderation provider shortlist: real vendor quotes + sandbox classify-call spike, sizing RR-9 before T14 provider selection | M1 | — | S | `TRD:risks[moderation cost]`; prd `open_questions[OQ-3]` |
| T44 | Migration 006: `analytics_event`; A12 ingest endpoint — fire-and-forget, malformed events logged, never blocks/fails the primary user action *(moved up from M6 — see revision note, §1)* | M1 | T4 | S | `schema:tables[analytics_event]`, `TRD:apis[A12]`, `PRD:p0[R8]` |
| T45 | Instrument M1 event hooks: registration + activation-funnel events across S1/S3/S4 *(rescoped from an all-milestone M6 task to M1-only; M2/M3/M5 hooks now T51/T52/T53)* | M1 | T10, T44 | S | `PRD:p0[R8]`, `UX:flows[F8]` |
| T55 | *(new, split from former T47)* Identity-non-disclosure NFR test: automated API response-schema audit across A1/A2 asserting no raw email/identity field is ever returned. Authored by **test-writer-agent** using criterion-ID naming (`test_R1_identity_nondisclosure`) per QK-6; scored by test-verifier-agent | M1 | T10 | S | `TRD:nfrs[identity non-disclosure]`; `cadence.md §5.2 (QK-6)` |
| T60 | *(new, quality-kit)* **security-agent** stage-08 full run (first run, **warn-only**): A1/A2 rate limits + attempt counters (T7), OTP flow (T5), HMAC pepper handling (T50, RR-7/RR-13), session-bootstrap token (T8), independent re-check of the T55 claim | M1 | T7, T8, T10, T50, T55 | M | `cadence.md §2 (M1 row)`; `TRD:risks[email-hash matching]` |
| T61 | *(new, quality-kit)* **privacy-agent** stage-16 first run (**warn-only**, DECISION QK-7): PII inventory over migration 001 (`identity_account`, `pseudonymous_profile`) + leakage baseline across responses/logs/analytics | M1 | T4, T10 | M | `cadence.md §2 (M1 row)`; `schema:tables[identity_account]`; RR-10 |
| T12 | Session mechanism: design + implement token lifetime/persistence for the authenticated shell (S5–S15) — resolves the repeat-session gap (UX OQ-14, carried by UI) | M2 | T8 | M | `UX:open_questions[OQ-14]`, `UI:open_questions[repeat-session]` |
| T13 | Migration 002: `topic_tag` (seeded: placements/internships/professors/courses/advice), `question`, `answer`, `moderation_case` (+ enums, `search_vector` generated columns, indexes) | M2 | T4 | M | `schema:tables[topic_tag]`, `schema:tables[question]`, `schema:tables[answer]`, `schema:tables[moderation_case]` |
| T14 | Moderation Gateway + A7 external AI Moderation API integration: tiered cheap-classifier-first, auto-pass/auto-block/escalate, **fail-closed** hold + retry/backoff + auto-escalate past threshold (worker job); provider chosen from T54's shortlist | M2 | T2, T13, T54 | L | `TRD:apis[A7]`, `TRD:integrations[External AI Moderation API]`, `PRD:p0[R6]` |
| T15 | A3 create-question endpoint: idempotency-key replay, topic validation, ban/suspend guard, moderation gate before publish | M2 | T12, T13, T14 | M | `TRD:apis[A3]`, `PRD:p0[R3]`, `PRD:p0[R6]` |
| T16 | A4 create-answer endpoint: threading, parent-not-found handling, same idempotency/moderation shape as A3 | M2 | T15 | S | `TRD:apis[A4]`, `PRD:p0[R3]` |
| T17 | A5 browse mode: recent-published feed query (no keyword) powering S5, published-only filtering | M2 | T13 | S | `TRD:apis[A5]`, `UX:screens[S5]` |
| T18 | **(human)** Claude Design round 2: paste §3.5–§3.8 prompts; land QuestionFeedCard, AskComposer, QuestionThread, AnswerComposer in repo | M2 | T9 | M | `UI:components[QuestionFeedCard..AnswerComposer]`, `UI:deferred[0]` |
| T19 | Integrate S5–S8: wire components to A3/A4/A5-browse, moderation-status states (pending/published/blocked), pseudonym + year-badge attribution everywhere (R2 AC1); ui-critique-rubric QA | M2 | T15, T16, T17, T18 | L | `UX:flows[F3]`, `UX:flows[F6]`, `PRD:p0[R2]`, `UI:components[*S5–S8]` |
| T51 | *(new, split from former T47)* Instrument M2 event hooks: WAU session-ping/session-start, answer-liquidity timestamps across S6/S7/S8, moderation auto-vs-escalated outcomes from the Q&A core | M2 | T19, T12, T44 | S | `PRD:p0[R8]`, `UX:flows[F8]` |
| T56 | *(new, split from former T47)* Moderation-coverage + moderation-failure-posture NFR tests: reconciliation query (published-content count == cleared-moderation-case count) and outage-drill test (mocked provider timeout → 0 auto-publishes). Authored by **test-writer-agent** (criterion-ID naming); scored by test-verifier-agent | M2 | T19 | M | `TRD:nfrs[moderation coverage]`, `TRD:nfrs[moderation failure posture]`; `cadence.md §5.2 (QK-6)` |
| T62 | *(new, quality-kit)* **security-agent** authz-focused run (**blocking** — 2nd run, promotion mechanic): A3/A4/A5 write/read guards, session (T12) | M2 | T15, T16, T17, T12 | M | `cadence.md §2 (M2 row)` |
| T63 | *(new, quality-kit)* **resilience-agent** first run (**warn-only**): toxiproxy fault-injection against T14's fail-closed posture under provider timeout/outage — this execution **is** the T56 outage drill, run independently by a separate agent | M2 | T14, T56 | M | `cadence.md §2 (M2 row)`; RR-4 |
| T64 | *(new, quality-kit)* **ai-security-agent** first run (**warn-only**, DECISION QK-5 — re-gated from conditional/Wave-3 to mandatory M2, since A7/T14 is an LLM classifier over attacker-controlled UGC): adversarial classify-call suite (promptfoo/garak) against T14's chosen provider + tiered routing; an injection that downgrades tier is a finding even if final verdict holds | M2 | T14, T54 | M | `cadence.md §4 (QK-5)`; `PRD:p0[R6]` |
| T20 | A5 full search: tsvector keyword + topic + cohort filters, explicit no-matches empty-state payload, degrade-to-topic-browse fallback when index unavailable | M3 | T17 | M | `TRD:apis[A5]`, `PRD:p0[R4]`, `TRD:nfrs[search availability]` |
| T21 | Migration 003: `reputation_event`, `ban_record` (+ self-vote trigger, duplicate-vote partial unique index, cached-aggregate maintenance for `reputation_score`/`vote_count`/`answer_count` — resolves schema's cached-aggregate and double-enforcement open questions) | M3 | T13 | M | `schema:tables[reputation_event]`, `schema:tables[ban_record]`, `schema:open_questions[cached aggregates; self-vote enforcement]` |
| T22 | A6 vote/accept endpoint: server-authoritative append-only reputation events, aggregate updates, self-vote/duplicate/banned/not-found errors | M3 | T21 | M | `TRD:apis[A6]`, `PRD:p0[R5]` |
| T23 | A11 ban-enforcement check wired into A2 (already using T50's shared hash utility since M1); ban guards added on A3/A4/A6 *(rescoped — the hash/HMAC contract itself was built earlier at T50, M1, not here; this task is guard-wiring only)* | M3 | T8, T21, T50 | S | `TRD:apis[A11]`, `PRD:p0[R5]`, `TRD:risks[email-hash ban matching]` |
| T24 | Ban issuance path (backend): severe moderation/grievance outcome writes `ban_record` + profile status change, surviving account deletion; operator UI trigger arrives with M5 console | M3 | T14, T21 | M | `PRD:p0[R5]`, `TRD:components[Reputation Engine]`, `TRD:nfrs[ban durability]` |
| T25 | **(human)** Claude Design round 3: paste §3.9–§3.11 prompts; land SearchPanel, TopicBrowseList, ProfileCard in repo | M3 | T9 | S | `UI:components[SearchPanel, TopicBrowseList, ProfileCard]`, `UI:deferred[0]` |
| T26 | Integrate S9–S11: search + no_matches → S6 deep-link, topic browse + index-unavailable fallback, profile (pseudonym/badge/reputation/status persistence across sessions, R2 AC2); ui-critique-rubric QA | M3 | T20, T22, T25 | M | `UX:flows[F4]`, `UX:flows[F2]`, `UX:flows[F5]`, `UI:components[*S9–S11]` |
| T52 | *(new, split from former T47)* Instrument M3 event hooks: search-usage events across S9 | M3 | T26, T44 | S | `PRD:p0[R8]`, `UX:flows[F8]` |
| T57 | *(new, split from former T47)* Ban-durability + search-availability NFR tests: delete-account → re-register-same-email → refused test; results-or-empty-state + index-unavailable → topic-browse-fallback test. Authored by **test-writer-agent** (criterion-ID naming); scored by test-verifier-agent | M3 | T26 | S | `TRD:nfrs[ban durability]`, `TRD:nfrs[search availability]`; `cadence.md §5.2 (QK-6)` |
| T65 | *(new, quality-kit)* **security-agent** ban-path run (**blocking** — 3rd run): T21–T24 adversarially re-verified, RR-7 normalization variants (case/aliasing/plus-addressing) replayed against the ban lookup | M3 | T23, T24 | M | `cadence.md §2 (M3 row)`; RR-7 |
| T66 | *(new, quality-kit)* **perf-agent** first run (**warn-only**): EXPLAIN on tsvector search (T20), reputation aggregate/trigger cost (T21) | M3 | T20, T21, T57 | M | `cadence.md §2 (M3 row)` |
| T27 | Migration 004: `sync_queue_item`, `content_draft` (+ enums, indexes) | M4 | T4 | S | `schema:tables[sync_queue_item]`, `schema:tables[content_draft]` |
| T28 | Client offline queue: service-worker/local persistence, client-generated local IDs + idempotency keys, `queued_offline` states in AskComposer/AnswerComposer, draft autosave to `content_draft` | M4 | T19, T27 | L | `TRD:write_model[offline_write_queue]`, `UX:flows[F9]`, `schema:tables[content_draft]` |
| T29 | A10 batch-sync endpoint: per-item terminal results (synced/conflict/rejected), idempotent replay, last-write-wins scoped to free-text only (reputation/ban state never LWW-resolved), every synced UGC item re-enters A7 moderation before publish | M4 | T14, T15, T27 | L | `TRD:apis[A10]`, `TRD:write_model`, `PRD:p0[R6]`, `TRD:risks[LWW]` |
| T30 | **(human)** Claude Design round 4: paste §3.12 prompt; land SyncStatusList in repo | M4 | T9 | S | `UI:components[SyncStatusList]`, `UI:deferred[0]` |
| T31 | Integrate S12: full truthful state chain (queued/syncing/pending/published/blocked/conflict/rejected) with rejection reasons; ui-critique-rubric QA | M4 | T28, T29, T30 | M | `UX:flows[F9]`, `UI:components[SyncStatusList]`, `TRD:risks[offline queue confusion]` |
| T32 | Sync reconciliation audit job (worker): no `sync_queue_item` in a non-terminal state past a bounded window; alerting on violation | M4 | T29 | S | `TRD:nfrs[offline sync reliability]` |
| T58 | *(new, split from former T47)* Offline-sync-reliability NFR test: property-style batch test asserting every queued write reaches a terminal state; reconciliation audit assertion. Authored by **test-writer-agent** (criterion-ID naming); scored by test-verifier-agent | M4 | T31, T32 | S | `TRD:nfrs[offline sync reliability]`; `cadence.md §5.2 (QK-6)` |
| T67 | *(new, quality-kit)* **resilience-agent** blocking run (2nd run, promotion mechanic): kill mid-batch, inject latency/partition on sync, assert every `sync_queue_item` reaches terminal state and every synced item re-enters A7; **plus restore drill** (resilience-audit Method step 6, DECISION QK-8) against the **T49 staging DB** — never production — recording RPO/RTO | M4 | T29, T32, T58, T49 | L | `cadence.md §2 (M4 row)`; `cadence.md patches/resilience-audit-restore-drill.md`; RR-5, RR-6, RR-19 |
| T68 | *(new, quality-kit)* **perf-agent** blocking run (2nd run): batch-sync load shape (A10 bursts) against k6 SLO thresholds | M4 | T29 | M | `cadence.md §2 (M4 row)` |
| T33 | Migration 005: `grievance_report` (incl. generated `sla_breached`), `grievance_audit_log`, `grievance_officer_contact` (+ enums, indexes) | M5 | T4 | S | `schema:tables[grievance_report]`, `schema:tables[grievance_audit_log]`, `schema:tables[grievance_officer_contact]` |
| T34 | A8 report-intake endpoint: ticket + SLA-deadline computation, acknowledgement timestamp, duplicate-report merge, anonymous flag, rate limiting | M5 | T33 | M | `TRD:apis[A8]`, `PRD:p0[R7]` |
| T35 | A9 resolve endpoint: operator-only authorization, takedown → content `moderation_status = blocked`, dismiss/escalate-further, audit-log entries, SLA-breach flagging (logged, not blocked) | M5 | T34 | M | `TRD:apis[A9]`, `PRD:p0[R7]` |
| T36 | Define + implement the operator-decide API contract for AI-escalated moderation cases not originating from a report (writes `moderation_case.decision/decided_by/decided_at`) — closes the OQ-11 contract gap; document the new contract as a TRD addendum in this repo's build notes (docs/03 stays frozen) | M5 | T14 | M | `UX:open_questions[OQ-11]`, `schema:escalations[operator-decide gap]`, `UI:open_questions[OQ-11]`, `PRD:p0[R6]` |
| T37 | Operator role/authz: role-gated routes for S16/S17 outside the student tab structure; non-operator → forbidden | M5 | T12 | S | `TRD:apis[A9].errors[unauthorized caller]`, `UX:navigation[operator persona]` |
| T38 | SLA timers + operator alerts (worker): acknowledgement SLA, resolution SLA segmented by category, new-escalation notifications via Notification Dispatcher | M5 | T5, T33 | M | `TRD:nfrs[grievance acknowledgement SLA]`, `TRD:nfrs[grievance resolution SLA]`, `TRD:components[Notification Dispatcher]` |
| T39 | **(human)** Claude Design round 5: paste §3.13–§3.17 prompts; land ReportContentModal, MyReportsList, GrievanceContactPanel, EscalationQueueTable, GrievanceResolutionPanel in repo | M5 | T9 | M | `UI:components[ReportContentModal..GrievanceResolutionPanel]`, `UI:deferred[0]` |
| T40 | Integrate S13–S15: report modal from S7 (incl. merged state), My Reports list (sla_breached **not** surfaced to reporters per the OQ-13 default), grievance contact panel reachable from Profile/Settings and S4-refused | M5 | T34, T35, T39 | M | `UX:flows[F7]`, `UI:components[*S13–S15]`, `UX:open_questions[OQ-13]` |
| T41 | Integrate S16–S17 operator console: escalation queue decide via T36 contract, grievance resolution via A9, sla_breached operator-visible state, manual-fallback review of unparseable-year registrations | M5 | T35, T36, T37, T39 | M | `UX:flows[F10]`, `UI:components[EscalationQueueTable, GrievanceResolutionPanel]`, `PRD:p0[R6]`, `PRD:p0[R7]` |
| T42 | **(human)** S15 legal/process copy + real grievance-officer details: IT-Rules-compliant process summary written and loaded into `grievance_officer_contact` (placeholder until then; launch-blocking for R7 AC3) | M5 | T33 | S | `UI:open_questions[S15 copy]`, `UI:deferred[1]`, `PRD:p0[R7]` |
| T43 | **(human/legal)** Legal review: IT Rules 2021 SLA figures (24h ack / 15-day general / 24–36h expedited) confirmed or corrected in `sla_deadline` computation; DPDP consent-flow copy + retention duration decided and wired into S1/S4 onboarding | M5 | T34 | M | `TRD:escalations[SLA figures assumption]`, `TRD:risks[DPDP]`, `UX:open_questions[OQ-5]` |
| T53 | *(new, split from former T47)* Instrument M5 event hooks: grievance-report events across S13, operator-decide moderation outcomes across S16 | M5 | T40, T41, T44 | S | `PRD:p0[R8]`, `UX:flows[F8]` |
| T59 | *(new, split from former T47)* Grievance SLA NFR tests: acknowledgement-SLA timestamp-diff test (24h window); category-segmented resolution-deadline test (15-day general, 24–36h expedited) using T43-reviewed figures. Authored by **test-writer-agent** (criterion-ID naming); scored by test-verifier-agent | M5 | T40, T43 | S | `TRD:nfrs[grievance acknowledgement SLA]`, `TRD:nfrs[grievance resolution SLA]`; `cadence.md §5.2 (QK-6)` |
| T69 | *(new, quality-kit)* **security-agent** heaviest run (**blocking** — 4th run): operator authz on A9 + the T36 decide route (RR-11's classic missed-authz surface), grievance PII handling (T33–T35), anonymous-report flag, SLA-timer worker (T38) log/metric presence | M5 | T35, T36, T37, T38, T40, T41 | L | `cadence.md §2 (M5 row)`; RR-11 |
| T70 | *(new, quality-kit)* **privacy-agent** blocking run (2nd run — full audit, DECISION QK-7): retention enforcement executed (not just read), consent presence (T43 copy), erasure-vs-ban legal-basis note, third-party data flows, grievance PII (`grievance_report`, `is_anonymous`) | M5 | T43, T33, T34, T35, T61 | L | `cadence.md §2 (M5 row)`; RR-10 |
| T71 | *(new, quality-kit)* **observability-agent** first run (**warn-only**): smoke-run log/trace/metric presence check, incl. SLA-timer worker (T38) instrumentation | M5 | T38, T41 | M | `cadence.md §2 (M5 row)` |
| T72 | *(new, quality-kit, human)* **(human)** Author `runbooks/pepper-rotation.md`: fill every `[HUMAN:` marker (owner, last-reviewed date, secrets-manager key path, dual-hash rollout thresholds) — sequenced like T42/T43 | M5 | T50 | S | `cadence.md §5.3 (QK-8)`; RR-13 |
| T73 | *(new, quality-kit, human)* **(human)** Author `runbooks/moderation-provider-outage.md`: fill every `[HUMAN:` marker | M5 | T14 | S | `cadence.md §5.3 (QK-8)`; RR-4 |
| T74 | *(new, quality-kit, human)* **(human)** Author `runbooks/takedown-sla-breach.md`: fill every `[HUMAN:` marker | M5 | T35 | S | `cadence.md §5.3 (QK-8)`; RR-2 |
| T75 | *(new, quality-kit, human/legal)* **(human/legal)** Author `runbooks/dpdp-breach-notification.md`: fill every `[HUMAN:` marker — the breach-notification clock section requires counsel and joins **T43's** legal-review scope, not a separate legal engagement | M5 | T43 | S | `cadence.md §5.3 (QK-8)`; RR-10 |
| T46 | Metric derivation queries + traceability audit: registration penetration, WAU density, D30 cohorts, activation, answer liquidity, auto-vs-escalated ratio — each metric proven computable from captured events (T45, T51, T52, T53); no metric un-instrumented *(T44/T45 moved to M1, instrumentation now incremental via T51–T53 — see revision note, §1)* | M6 | T45, T51, T52, T53 | M | `PRD:p0[R8]`, `TRD:nfrs[event instrumentation completeness]` |
| T76 | *(new, quality-kit)* **privacy-agent** finalizes `docs/16-privacy.md` (3rd/final run, DECISION QK-7): validates the complete JSON handoff against `handoff-privacy.schema.json`; consumed by T48's production-test run as handoff 16 | M6 | T70 | S | `cadence.md §2 (M6 row)`, `cadence.md §5.1` |
| T47 | **test-verifier-agent's final full execution** (DECISION QK-6) of the merged suite: re-runs T55–T59's criterion-ID tests + any per-task Layer-1 tests + `SECREG-<finding-id>` regression-seed tests for every fixed critical/high finding since M1, as the launch-gate signal; this run is what production-test's suite-reverify (T48) consumes *(rescoped from a single M6-authored L-task — NFR tests are now authored incrementally per milestone by test-writer-agent, matching §5's own "when it runs" column; this task is the verifier's aggregation, not fresh authorship)* | M6 | T55, T56, T57, T58, T59, T46 | M | `TRD:nfrs[*]` (each `measurement` becomes a test); `cadence.md §5.2 (QK-6)` |
| T48 | **production-test-agent** GO/NO-GO run (DECISION QK-2, runs **exactly once** — cadence.md invariant §6.1), merged with the launch checklist: re-executes ALL prior signals from scratch — security (T60/T62/T65/T69), suite + coverage (T47), load (T66/T68), resilience spot-check incl. restore-drill recency ≤30d (T67), ai-security (T64), observability (T71), privacy (T76) — scores the PRR checklist incl. **PRR-26..29** (privacy pass, all 4 runbooks complete with no `[HUMAN:` markers, restore RPO/RTO recorded, retention enforcement verified), and issues GO/NO-GO. Managed hosting, backups, TLS, rate limits, PWA installability + dark-mode check also verified here | M6 | T42, T43, T46, T47, T60, T61, T62, T63, T64, T65, T66, T67, T68, T69, T70, T71, T72, T73, T74, T75, T76 | L | `TRD:stack.infra`, `PRD:goals[5]`, `PRD:constraints[IT Act]`; `cadence.md §2 (M6 row)`, `§6.1`; `production-test-prr-additions.md` |

**Coverage check:** R1→T4–T11, T49 (staging deploy), T50 (shared hash utility), T55 (non-disclosure
test); R2→T19, T26; R3→T13–T19; R4→T20, T26, T57 (search-availability test); R5→T21–T24, T26, T50,
T57 (ban-durability test); R6→T14–T16, T29, T36, T41, T47, T54 (vendor spike), T56 (coverage +
outage-drill tests), T63 (resilience outage-drill re-run), T64 (ai-security); R7→T33–T43, T59 (SLA
tests); R8→T44, T45, T46, T51, T52, T53; write_model→T27–T32, T58 (sync-reliability test),
T67 (resilience + restore drill). All 14 schema tables land across migrations 001–006. All 17
UI components land across Claude Design rounds T9/T18/T25/T30/T39 (batchable back-to-back once T9
lands, per §2) and are integrated in T10/T19/T26/T31/T40/T41. NFR test authorship (T55–T59) is now
incremental per milestone, authored by test-writer-agent (QK-6) and aggregated into a single
regression pass at T47 — resolving the mismatch between the original single-M6 T47 and §5's own
"when it runs" claims.

**Quality-kit coverage (new, 2026-07-20 integration):** every quality-kit gate from
`quality-kit-additions/cadence.md` now has a task home: Layer 1 (continuous) → T3; Layer 2
(milestone gates) → T60/T61 (M1), T62/T63/T64 (M2), T65/T66 (M3), T67/T68 (M4), T69/T70/T71 (M5),
T76 + T48 (M6); Layer 3 (event triggers) is a standing rule, not discrete tasks — see
`architecture.md` §8 and `cadence.md` §3. Runbooks (QK-8) → T72–T75. No quality-kit stage lacks a
task; no plan task invents a quality-kit behavior `cadence.md` doesn't specify.

No orphan tasks; **76 tasks total** (59 after the first revision + T60–T76, 17 new quality-kit
tasks: T60, T61, T62, T63, T64, T65, T66, T67, T68, T69, T70, T71, T72, T73, T74, T75, T76).

---

## 5. Test strategy

Each TRD NFR's `measurement` becomes a test; failing states what it blocks.

| NFR | Test | When it runs | Failing blocks |
|---|---|---|---|
| Moderation coverage | Reconciliation query: published-content count == cleared-moderation-case count (authored **T56**, M2; re-run in **T47** regression) | Authored M2, every CI run from M2 on + nightly job in prod | Any release; this is the R6 legal shield |
| Moderation failure posture | Outage drill: mocked provider timeout → assert 0 auto-publishes, items held pending, auto-escalation past threshold (authored **T56**, M2; re-run in **T47**) | Authored M2 exit; CI integration suite + one manual pre-launch drill | M2 exit and launch |
| Grievance acknowledgement SLA | Timestamp-diff test on `created_at → acknowledged_at` against the 24h window (authored **T59**, M5; re-run in **T47**) | Authored + CI from M5 on | M5 exit |
| Grievance resolution SLA | Category-segmented deadline computation tests (15-day general, 24–36h expedited), using T43-reviewed figures (authored **T59**, M5; re-run in **T47**) | Authored + CI from M5 on | M5 exit and launch |
| Offline sync reliability | Property-style batch test: every queued write reaches a terminal state; reconciliation audit job asserts no stuck items (authored **T58**, M4; re-run in **T47**) | Authored + CI from M4 on + continuous prod audit | M4 exit |
| Ban durability | Delete account → re-register same email → refused (authored **T57**, M3; re-run in **T47**) | Authored + CI from M3 on | M3 exit |
| Identity non-disclosure | Response-schema audit across every implemented API asserting no raw email/identity fields (authored **T55**, M1, spot-checked at T11; full audit re-run in **T47**) | Authored M1; every CI run from M1 on | Everything — anonymity is the product |
| Event instrumentation completeness | Metric-to-event traceability audit: each of the six PRD metrics computed from fixture events (**T46**) | CI from M6 on | M6 exit and launch |
| Search availability | Results-or-valid-empty-state test + index-unavailable → topic-browse fallback (authored **T57**, M3; re-run in **T47**) | Authored + CI from M3 on | M3 exit |

**Revision note:** the NFR test rows above are now authored incrementally at the milestone named
in their own "When it runs" column (T55 at M1, T56 at M2, T57 at M3, T58 at M4, T59 at M5), instead
of all being written for the first time at a single M6 task. **T47** at M6 re-runs this whole suite
together as the launch-gate regression pass. This closes the mismatch the original single-M6 T47
had with this very table's "when it runs" claims.

**Quality-kit integration note (DECISION QK-6, `quality-kit-additions/cadence.md` §5.2):** T55–T59
are not a second, competing test-authoring effort — **test-writer-agent** (quality-kit stage 10)
is their author, using its stricter criterion-ID naming convention
(`test_R1AC2_unparseable_year_blocked_never_guessed`) instead of ad hoc names; **test-verifier-agent**
(stage 11) is the independent scorer (execution, coverage %, mutation-sample survival), never the
author. T47 at M6 is the verifier's final full execution, which feeds directly into
production-test-agent's suite-reverify at T48 — one suite, one traceability scheme, not two. Every
fixed critical/high finding from any quality-kit gate (T60–T71) also gets a pinning regression test
(`SECREG-<finding-id>`) added to this same suite from the moment it's fixed, per the write-tests
skill's security-regression rule.

**External-signal rule — every automated loop, its signal, its cap:**

- **CI loop** (lint/typecheck/tests/migrations, T3): signal = pipeline exit status; cap = 3
  consecutive automated fix attempts per failure, then escalate to human.
- **Visual-QA loop** (ui-critique-rubric applied to landed Claude Design components at
  T10/T19/T26/T31/T40/T41): signal = rubric pass against the `docs/06-ui.md` §3 briefs; cap =
  3 critique iterations per component, then escalate to the human taste owner — Claude Code
  never redesigns a component, it re-prompts or escalates, per the stage-6 division.
- **Moderation-retry loop** (T14 worker): signal = provider response; cap = bounded backoff
  threshold, then auto-route to Human Escalation Queue (never publish, never drop).

---

## 6. Risk register

Union of every upstream escalation and risk. Explicit diff first — every upstream item listed
and checked off; nothing dropped:

**TRD `escalations`:** [x] OQ-1/P2-B protocol → RR-1 · [x] SLA-figure legal review → RR-2 ·
[x] escalation volume vs founder capacity → RR-3.
**TRD `risks`:** [x] moderation outage → RR-4 · [x] offline-queue/moderation confusion → RR-5 ·
[x] LWW overwrite → RR-6 · [x] email-hash normalization miss → RR-7 · [x] single-founder
bottleneck → RR-3 · [x] year-parsing edge cases → RR-8 · [x] moderation cost unsized → RR-9 ·
[x] DPDP consent/retention → RR-10.
**UX `escalations`:** [x] OQ-1 (re-marked non-blocking, recorded) → RR-1 · [x] OQ-11
operator-decide gap → RR-11 · [x] OQ-12 ban dispute path → RR-12.
**Schema `escalations`:** [x] OQ-1 → RR-1 · [x] HMAC pepper rotation → RR-13 · [x] OQ-11 →
RR-11.
**UI `escalations`:** [x] prior gate failure resolved by human decision → RR-14 (record of
closure).
**UI `open_questions` (carried per handoff):** [x] S15 legal copy → RR-15 · [x] OQ-11 → RR-11 ·
[x] repeat-session mechanism → RR-16 · [x] OQ-13 sla_breached visibility → RR-17.

| ID | Risk | Source | Status |
|---|---|---|---|
| RR-1 | **P2-B mentor/support safety-protocol precondition.** No safety/escalation protocol (trained volunteers or counseling-cell tie-up) exists. Re-marked non-blocking for v1 by human decision (2026-07-18) — but it is a **hard precondition: P2-B is never built, scheduled, or scaffolded until a human-designed protocol exists.** No task in this plan touches P2-B. | prd:open_questions[OQ-1]; trd:escalations[0]; ux:escalations[0]; schema:escalations[0] | accepted:gurkanwaldeep (v1 scope only; precondition stands for P2-B) |
| RR-2 | Grievance SLA figures (24h/15-day/24–36h) are `[ASSUMPTION]` modeled on IT Rules 2021 norms, not legally verified | trd:escalations[1] | mitigated:T43 |
| RR-3 | Single-founder operator becomes the human-escalation and grievance-SLA bottleneck as density grows (OQ-10); architecture bounds volume but does not solve staffing | trd:escalations[2]; trd:risks[single-founder bottleneck] | open (owner: human; revisit at M5 exit with real escalation-volume data from T46) |
| RR-4 | External AI moderation API outage stalls all UGC publication (fail-closed is mandatory) | trd:risks[moderation outage] | mitigated:T14 (retry/backoff/auto-escalate) + T56 outage drill (authored M2) + T47 regression; dual-provider fallback deliberately deferred `[ASSUMPTION]` |
| RR-5 | Offline queue + moderation gate confuses users ("sent" items invisible post-sync) | trd:risks[offline queue confusion] | mitigated:T31 (truthful S12 state chain) |
| RR-6 | Last-write-wins could silently overwrite concurrent edits or reputation/ban state if misapplied | trd:risks[LWW] | mitigated:T29 (LWW text-only; ledger for reputation) + T21 (append-only enforcement) |
| RR-7 | Email-hash ban matching misses due to normalization differences (case/aliasing/plus-addressing) | trd:risks[email-hash matching] | mitigated:T50 (shared normalization+HMAC utility, built M1 — moved up from the original M3 placement so M1's own `identity_account.email_hash` uses the real contract from day one) + T23 (M3 guard-wiring onto A3/A4/A6) + T57 ban-durability test |
| RR-8 | Year-badge parsing fails on edge-case campus email/roll formats, blocking legitimate students | trd:risks[year parsing] | mitigated:T6 (founder ruleset + fixtures) + T8 (block-or-fallback, never guess) + T41 (manual-review path) |
| RR-9 | AI-moderation cost per active user unsized in rupees (OQ-3); could exceed single-founder budget at density | trd:risks[moderation cost] | mitigated (partially):T54 (M1 vendor-shortlist + real-quote spike, run before T14 provider selection instead of cold at T14) — real production cost still confirmed only once T14's chosen provider is live at scale |
| RR-10 | DPDP consent copy and retention duration undefined; penalties to INR 50 crore | trd:risks[DPDP] | mitigated:T43 (copy + retention decision); residual retention-clock enforcement open until T43 lands |
| RR-11 | **OQ-11 API contract gap:** no TRD endpoint for operator-deciding an AI-escalated moderation case outside report-scoped A9; S16's primary action undertraced until resolved | ux:escalations[1]; schema:escalations[2]; ui:open_questions[1] | mitigated:T36 |
| RR-12 | No dispute/appeal path for a student refused registration on a ban-record match; only the S15 contact (not designed for pre-account disputes) is surfaced | ux:escalations[2] | open (owner: engineering/human; interim: S15 contact per UX F1; revisit after launch with real refusal volume) |
| RR-13 | HMAC pepper management/rotation unspecified; rotation would silently break existing ban/identity hash matches without a dual-hash migration strategy | schema:escalations[1] | mitigated:T50 (documented pepper management + rotation strategy required in-task, built M1 alongside the hash utility itself) + **T72** (`runbooks/pepper-rotation.md`, M5) closes the residual "operational runbook item" |
| RR-14 | Prior stage-6 gate failure (P2-B blocking flags) — resolved by human decision re-marking non-blocking in 04/05; stale `blocking:true` flags remain in frozen 02/03 handoffs (pipeline record-keeping incident, named in this plan's Phase 0 gate) | ui:escalations[0]; this doc §Phase 0 | accepted:gurkanwaldeep (closure recorded; incident logged in escalations) |
| RR-15 | S15 grievance process legal copy does not exist anywhere upstream; placeholder renders until it lands — R7 AC3 is launch-blocking | ui:open_questions[0]; ui:deferred[1] | open → mitigated:T42 once the human delivers copy; T48 launch checklist enforces it |
| RR-16 | Repeat-session/login mechanism unspecified by any TRD API; authenticated shell for S5–S15 depends on it | ux:open_questions[OQ-14]; ui:open_questions[2] | mitigated:T12 |
| RR-17 | Whether `sla_breached` is visible to the reporting student on S14 or operator-only is undecided; briefs and this plan implement the operator-only default | ux:open_questions[OQ-13]; ui:open_questions[3] | open (owner: human; default implemented in T40 — flipping later is additive, not structural) |
| RR-18 | Claude Design round-trip latency (external, human-mediated) sits on the critical path of every milestone's integration tasks; a stalled round stalls its milestone | UI:deviations[0]; this plan §2, §4 (new, plan-surfaced) | open (owner: human) → largely defused: T18/T25/T30/T39 each depend only on T9, so all four rounds can be run back-to-back immediately once T9 lands (explicit note added to §2), taking the latency off every later milestone's own critical path; residual risk is only if the human chooses to pace rounds one per milestone anyway |
| RR-19 | *(new, quality-kit)* Backup restoration was never verified prior to this integration — "backups are hypotheses until restored" (one of three gaps named in `quality-kit-additions/README-additions.md`) | quality-kit-additions DECISION QK-8 | mitigated:T67 (M4 restore drill against the T49 staging DB, RPO/RTO recorded) + recency re-checked ≤30 days at T48/PRR-28 |
| RR-20 | *(new, quality-kit)* No operational runbooks existed for the four highest-blast-radius incident types (pepper rotation, moderation-provider outage, takedown SLA breach, DPDP breach notification) | quality-kit-additions DECISION QK-8 | mitigated:T72–T75 (authored M5; existence + owner + last-reviewed + zero-`[HUMAN:`-marker gated at T48/PRR-27) |

---

## 7. Open Questions

No blocking questions — the plan is not provisional. Items answered by tasks (OQ-11→T36,
OQ-14→T12, cached aggregates + vote double-enforcement→T21, HMAC contract→T50) are recorded in
§6 and not repeated. Everything still unanswerable is carried forward:

| Question | Owner | Blocking |
|---|---|---|
| P2-B safety/escalation protocol — non-blocking for v1 per human decision (gurkanwaldeep, 2026-07-18); hard precondition before P2-B is ever built (RR-1) | human | false |
| AI-moderation cost per active user in rupees — sized against real vendor quotes at T54 (M1 spike, ahead of T14 provider selection); confirmed against real production usage only once T14's chosen provider is live at scale (RR-9) | engineering | false |
| Independently verify the Incog toxicity/founder-suspension claim (founder risk awareness; not load-bearing) | human | false |
| DPDP retention-period enforcement clock beyond T43's copy/duration decision (RR-10 residual) | engineering / legal | false |
| Run revenue experiment #2 (1–2 hyperlocal sponsors) only after the retention experiment succeeds | user | false |
| Credible evidence a college administrator would pay for B2B2C (most distant rung) | user | false |
| Replicate the 10-junior validation test at larger scale if resourcing allows | user | false |
| Concrete numeric targets for penetration %, WAU %, D30 %, answer-liquidity window — all current targets remain `[ASSUMPTION]`; T46 must not hard-code pass/fail thresholds until set | user | false |
| Operational staffing plan if escalation volume outpaces the single founder (RR-3) | human | false |
| Ban-refusal dispute/appeal path design (RR-12) | engineering / human | false |
| `sla_breached` visibility to reporters vs operator-only (RR-17; operator-only default shipped) | human | false |
| Anonymous-reporter acknowledgement/status visibility — no retrieval key exists for a reporter-less ticket; v1 default: anonymous reports get the S13 acknowledgement only, no ongoing status view `[ASSUMPTION]` | engineering | false |
| HMAC pepper rotation runbook (RR-13 residual) | engineering | false |

---

## 8. JSON Handoff

```json
{
  "artifact": "plan",
  "tracer": {
    "p0": "p0_requirements[R1]",
    "slice": "S1 EmailEntryForm → apis[A1] → S2/S3 (VerificationPendingCard, TokenConfirmForm) → apis[A2] → identity_account + pseudonymous_profile → S4 RegistrationOutcomePanel, through the real Email/OTP Delivery Provider integration",
    "demo_criterion": "A real student on a real phone browser enters their launch-campus email, receives a real verification email, confirms the token, and sees their pseudonym + VERIFIED year badge on S4 — with an API-response inspection showing the raw email nowhere, and the blocked (unparseable year, never guessed) and refused branches rendering as distinct S4 states."
  },
  "milestones": [
    { "id": "M1", "theme": "Tracer bullet: verification spine + scaffold + first Claude Design round integrated, demoed on a real staging deployment", "p0s": ["p0_requirements[R1]"], "exit_criterion": "Valid campus email → derived year badge + pseudonym, raw email never shown; unparseable year → blocked, never guessed; non-campus/already-used → refused (R1 AC1–3), demoed end-to-end on a real phone against the T49 staging deployment, with the T55 identity-non-disclosure audit passing." },
    { "id": "M2", "theme": "Q&A core + AI moderation spine + session", "p0s": ["p0_requirements[R3]", "p0_requirements[R6]", "p0_requirements[R2]"], "exit_criterion": "A question posts through the fail-closed AI moderation gate and publishes under pseudonym + year badge; an answer threads under it with attribution; no UGC bypasses moderation, including during a simulated provider outage (R3 AC1–2, R6 AC1–2, R2 AC1). Quality gate: T62 security-agent authz run is BLOCKING for this milestone's exit (cadence.md M2 row); T63 resilience and T64 ai-security runs are warn-only (first runs)." },
    { "id": "M3", "theme": "Search across batches, reputation ledger, durable bans", "p0s": ["p0_requirements[R4]", "p0_requirements[R5]", "p0_requirements[R2]"], "exit_criterion": "Keyword/topic/cohort search returns cross-batch results or the explicit empty state; upvote/accept visibly adjusts reputation; a banned email is refused re-registration after account deletion; pseudonym + reputation persist across sessions (R4 AC1–2, R5 AC1–2, R2 AC2). Quality gate: T65 security-agent ban-path run is BLOCKING; T66 perf-agent run is warn-only (first run)." },
    { "id": "M4", "theme": "Offline write queue + sync reconciliation", "p0s": ["write_model[offline_write_queue]", "p0_requirements[R6]"], "exit_criterion": "100% of offline-queued writes reach a terminal state with none silently lost; every synced item re-enters moderation before publish; S12 renders the truthful queued→syncing→pending→published/blocked chain. Quality gate: T67 resilience-agent (incl. restore drill against T49 staging DB) and T68 perf-agent are both BLOCKING (second runs, promotion mechanic)." },
    { "id": "M5", "theme": "Grievance mechanism, takedown, operator console, legal copy", "p0s": ["p0_requirements[R7]", "p0_requirements[R6]"], "exit_criterion": "Reports enter a tracked SLA-bound queue with acknowledgement; takedowns are logged and applied within SLA; grievance-officer contact is published with final legal copy; AI-escalated content reaches a human decision via the new operator-decide contract (R7 AC1–3, R6 AC3). Quality gate: T69 security-agent (heaviest run) and T70 privacy-agent are both BLOCKING; T71 observability-agent is warn-only (first run); T72-T75 runbooks authored." },
    { "id": "M6", "theme": "Instrumentation, NFR hardening, privacy finalization, launch gate", "p0s": ["p0_requirements[R8]"], "exit_criterion": "Every PRD metric is computable from captured events with no metric un-instrumented (R8 AC1–2); the full NFR test suite is green (T47); T76 finalizes docs/16-privacy.md; T48 production-test-agent runs exactly once, re-executing every prior quality-kit signal from scratch and scoring the PRR checklist incl. PRR-26..29, issuing GO/NO-GO; launch checklist complete including DPDP consent copy and legal-reviewed SLA figures." }
  ],
  "tasks": [
    { "id": "T1", "task": "Repo hygiene: delete superseded src/ui/app.css; keep src/ui/mock-data.js as fixture data", "milestone": "M1", "depends_on": [], "size": "S", "trace": "UI:deviations[0]" },
    { "id": "T2", "task": "Scaffold: Node/TS modular monolith API + worker skeleton + installable PWA client shell + local dev env", "milestone": "M1", "depends_on": ["T1"], "size": "M", "trace": "TRD:stack; TRD:architecture_pattern" },
    { "id": "T3", "task": "CI pipeline: lint, typecheck, unit+integration runners, migration apply/rollback checks", "milestone": "M1", "depends_on": ["T2"], "size": "S", "trace": "TRD:nfrs[*] measurement harness" },
    { "id": "T4", "task": "Managed Postgres + migration framework; migration 001: identity_account, pseudonymous_profile + enums", "milestone": "M1", "depends_on": ["T2"], "size": "M", "trace": "schema:tables[identity_account]; schema:tables[pseudonymous_profile]" },
    { "id": "T5", "task": "Email/OTP Delivery Provider integration: send, retry/backoff, resend with cooldown, blocked-if-unconfirmed", "milestone": "M1", "depends_on": ["T2"], "size": "M", "trace": "TRD:integrations[Email/OTP Delivery Provider]; PRD:p0[R1]" },
    { "id": "T6", "task": "(human) Founder-documented campus email/roll-number year-parsing ruleset + fixture examples", "milestone": "M1", "depends_on": [], "size": "S", "trace": "TRD:risks[year parsing]; PRD:assumptions[email scheme]" },
    { "id": "T7", "task": "A1 initiate-verification: domain allowlist, duplicate refusal (via T50's hash utility), malformed rejection, rate limiting", "milestone": "M1", "depends_on": ["T4", "T5", "T50"], "size": "M", "trace": "TRD:apis[A1]; PRD:p0[R1]" },
    { "id": "T8", "task": "A2 confirm-verification: token validation, year derivation (block-or-fallback, never guess), pseudonym + profile creation; returns short-lived session-bootstrap token for T12", "milestone": "M1", "depends_on": ["T6", "T7", "T50"], "size": "M", "trace": "TRD:apis[A2]; PRD:p0[R1]; UX:open_questions[OQ-14]" },
    { "id": "T9", "task": "(human) Claude Design round 1: paste 06-ui §2 design contract + §3.1–3.4 prompts; land S1–S4 components in repo", "milestone": "M1", "depends_on": ["T2"], "size": "M", "trace": "UI:components[EmailEntryForm..RegistrationOutcomePanel]; UI:deferred[0]" },
    { "id": "T10", "task": "Integrate S1–S4 components with A1/A2: all states incl. blocked/refused; ui-critique-rubric QA", "milestone": "M1", "depends_on": ["T8", "T9"], "size": "M", "trace": "UX:flows[F1]; UI:components[*S1-S4]" },
    { "id": "T11", "task": "Tracer demo on real phone against the T49 staging deployment + identity non-disclosure response audit", "milestone": "M1", "depends_on": ["T10", "T49"], "size": "S", "trace": "TRD:nfrs[identity non-disclosure]; PRD:p0[R1]" },
    { "id": "T49", "task": "(new) Minimal M1 staging deployment: managed app-platform hosting pointed at T4's managed Postgres so T11's demo runs against a real environment", "milestone": "M1", "depends_on": ["T4"], "size": "S", "trace": "TRD:stack.infra; PRD:p0[R1]" },
    { "id": "T50", "task": "(new) Shared email-normalization + keyed-HMAC utility (lowercase, alias-stripping, server-held pepper, documented rotation strategy) used identically by A1, A2, and A11", "milestone": "M1", "depends_on": ["T4"], "size": "S", "trace": "TRD:risks[email-hash matching]; schema:escalations[HMAC pepper]" },
    { "id": "T54", "task": "(new, parallel) (human/engineering) AI-moderation provider shortlist: real vendor quotes + sandbox classify-call spike ahead of T14 provider selection", "milestone": "M1", "depends_on": [], "size": "S", "trace": "TRD:risks[moderation cost]; prd.open_questions[OQ-3]" },
    { "id": "T44", "task": "Migration 006: analytics_event; A12 fire-and-forget ingest that never blocks the primary action (moved up from M6)", "milestone": "M1", "depends_on": ["T4"], "size": "S", "trace": "schema:tables[analytics_event]; TRD:apis[A12]; PRD:p0[R8]" },
    { "id": "T45", "task": "Instrument M1 event hooks: registration + activation-funnel events across S1/S3/S4 (rescoped from all-milestone M6 task; M2/M3/M5 hooks now T51/T52/T53)", "milestone": "M1", "depends_on": ["T10", "T44"], "size": "S", "trace": "PRD:p0[R8]; UX:flows[F8]" },
    { "id": "T55", "task": "(new, split from former T47) Identity-non-disclosure NFR test: API response-schema audit across A1/A2 asserting no raw email/identity field is ever returned. Authored by test-writer-agent (criterion-ID naming, QK-6); scored by test-verifier-agent", "milestone": "M1", "depends_on": ["T10"], "size": "S", "trace": "TRD:nfrs[identity non-disclosure]; cadence.md 5.2 QK-6" },
    { "id": "T60", "task": "(new, quality-kit) security-agent stage-08 full run (first run, warn-only): A1/A2 rate limits, OTP flow, HMAC pepper handling, session-bootstrap token, independent re-check of T55", "milestone": "M1", "depends_on": ["T7", "T8", "T10", "T50", "T55"], "size": "M", "trace": "cadence.md 2 M1 row" },
    { "id": "T61", "task": "(new, quality-kit) privacy-agent stage-16 first run (warn-only, QK-7): PII inventory over migration 001 + leakage baseline", "milestone": "M1", "depends_on": ["T4", "T10"], "size": "M", "trace": "cadence.md 2 M1 row; RR-10" },
    { "id": "T12", "task": "Session mechanism design + implementation for the authenticated shell (resolves UX OQ-14)", "milestone": "M2", "depends_on": ["T8"], "size": "M", "trace": "UX:open_questions[OQ-14]; UI:open_questions[repeat-session]" },
    { "id": "T13", "task": "Migration 002: topic_tag (seeded), question, answer, moderation_case + enums, search_vector, indexes", "milestone": "M2", "depends_on": ["T4"], "size": "M", "trace": "schema:tables[topic_tag]; schema:tables[question]; schema:tables[answer]; schema:tables[moderation_case]" },
    { "id": "T14", "task": "Moderation Gateway + A7 external AI moderation integration: tiered classify, fail-closed hold/retry/backoff, auto-escalate past threshold (worker); provider chosen from T54's shortlist", "milestone": "M2", "depends_on": ["T2", "T13", "T54"], "size": "L", "trace": "TRD:apis[A7]; TRD:integrations[External AI Moderation API]; PRD:p0[R6]" },
    { "id": "T15", "task": "A3 create-question: idempotency replay, topic validation, ban guard, moderation gate", "milestone": "M2", "depends_on": ["T12", "T13", "T14"], "size": "M", "trace": "TRD:apis[A3]; PRD:p0[R3]" },
    { "id": "T16", "task": "A4 create-answer: threading, parent-not-found, same idempotency/moderation shape", "milestone": "M2", "depends_on": ["T15"], "size": "S", "trace": "TRD:apis[A4]; PRD:p0[R3]" },
    { "id": "T17", "task": "A5 browse mode: recent-published feed query for S5", "milestone": "M2", "depends_on": ["T13"], "size": "S", "trace": "TRD:apis[A5]; UX:screens[S5]" },
    { "id": "T18", "task": "(human) Claude Design round 2: §3.5–3.8 prompts; land S5–S8 components", "milestone": "M2", "depends_on": ["T9"], "size": "M", "trace": "UI:components[QuestionFeedCard..AnswerComposer]; UI:deferred[0]" },
    { "id": "T19", "task": "Integrate S5–S8: compose/thread wiring, moderation-status states, pseudonym+badge attribution (R2 AC1); rubric QA", "milestone": "M2", "depends_on": ["T15", "T16", "T17", "T18"], "size": "L", "trace": "UX:flows[F3]; UX:flows[F6]; PRD:p0[R2]" },
    { "id": "T62", "task": "(new, quality-kit) security-agent authz-focused run (blocking, 2nd run): A3/A4/A5 guards, session T12", "milestone": "M2", "depends_on": ["T15", "T16", "T17", "T12"], "size": "M", "trace": "cadence.md 2 M2 row" },
    { "id": "T63", "task": "(new, quality-kit) resilience-agent first run (warn-only): toxiproxy fault injection against T14 fail-closed posture -- this execution is the T56 outage drill run independently", "milestone": "M2", "depends_on": ["T14", "T56"], "size": "M", "trace": "cadence.md 2 M2 row; RR-4" },
    { "id": "T64", "task": "(new, quality-kit) ai-security-agent first run (warn-only, QK-5 -- re-gated from conditional to mandatory M2): adversarial classify-call suite against T14's provider + tiered routing", "milestone": "M2", "depends_on": ["T14", "T54"], "size": "M", "trace": "cadence.md 4 QK-5; PRD:p0[R6]" },
    { "id": "T51", "task": "(new, split from former T47) Instrument M2 event hooks: WAU session-ping/session-start, answer-liquidity timestamps across S6/S7/S8, moderation auto-vs-escalated outcomes", "milestone": "M2", "depends_on": ["T19", "T12", "T44"], "size": "S", "trace": "PRD:p0[R8]; UX:flows[F8]" },
    { "id": "T56", "task": "(new, split from former T47) Moderation-coverage + moderation-failure-posture NFR tests: reconciliation query + outage drill", "milestone": "M2", "depends_on": ["T19"], "size": "M", "trace": "TRD:nfrs[moderation coverage]; TRD:nfrs[moderation failure posture]" },
    { "id": "T20", "task": "A5 full search: tsvector keyword + topic + cohort filters, empty-state payload, degrade-to-topic-browse fallback", "milestone": "M3", "depends_on": ["T17"], "size": "M", "trace": "TRD:apis[A5]; PRD:p0[R4]; TRD:nfrs[search availability]" },
    { "id": "T21", "task": "Migration 003: reputation_event, ban_record + self-vote trigger, duplicate-vote index, cached-aggregate maintenance", "milestone": "M3", "depends_on": ["T13"], "size": "M", "trace": "schema:tables[reputation_event]; schema:tables[ban_record]; schema:open_questions[cached aggregates]" },
    { "id": "T22", "task": "A6 vote/accept: server-authoritative append-only reputation events, aggregate updates, all error cases", "milestone": "M3", "depends_on": ["T21"], "size": "M", "trace": "TRD:apis[A6]; PRD:p0[R5]" },
    { "id": "T23", "task": "A11 ban check wired into A2 (using T50's shared hash utility, built M1); ban guards added on A3/A4/A6 (rescoped — guard-wiring only, hash/HMAC contract itself moved to T50/M1)", "milestone": "M3", "depends_on": ["T8", "T21", "T50"], "size": "S", "trace": "TRD:apis[A11]; PRD:p0[R5]; TRD:risks[email-hash ban matching]" },
    { "id": "T24", "task": "Ban issuance path (backend): severe outcome writes ban_record + profile status, surviving account deletion", "milestone": "M3", "depends_on": ["T14", "T21"], "size": "M", "trace": "PRD:p0[R5]; TRD:nfrs[ban durability]" },
    { "id": "T25", "task": "(human) Claude Design round 3: §3.9–3.11 prompts; land S9–S11 components", "milestone": "M3", "depends_on": ["T9"], "size": "S", "trace": "UI:components[SearchPanel, TopicBrowseList, ProfileCard]; UI:deferred[0]" },
    { "id": "T26", "task": "Integrate S9–S11: search + no_matches deep-link, topic-browse fallback, profile persistence (R2 AC2); rubric QA", "milestone": "M3", "depends_on": ["T20", "T22", "T25"], "size": "M", "trace": "UX:flows[F4]; UX:flows[F2]; UX:flows[F5]" },
    { "id": "T65", "task": "(new, quality-kit) security-agent ban-path run (blocking, 3rd run): T21-T24 adversarially re-verified, RR-7 normalization variants replayed", "milestone": "M3", "depends_on": ["T23", "T24"], "size": "M", "trace": "cadence.md 2 M3 row; RR-7" },
    { "id": "T66", "task": "(new, quality-kit) perf-agent first run (warn-only): EXPLAIN on tsvector search (T20), reputation aggregate/trigger cost (T21)", "milestone": "M3", "depends_on": ["T20", "T21", "T57"], "size": "M", "trace": "cadence.md 2 M3 row" },
    { "id": "T52", "task": "(new, split from former T47) Instrument M3 event hooks: search-usage events across S9", "milestone": "M3", "depends_on": ["T26", "T44"], "size": "S", "trace": "PRD:p0[R8]; UX:flows[F8]" },
    { "id": "T57", "task": "(new, split from former T47) Ban-durability + search-availability NFR tests: re-registration-refused test; empty-state + index-unavailable fallback test", "milestone": "M3", "depends_on": ["T26"], "size": "S", "trace": "TRD:nfrs[ban durability]; TRD:nfrs[search availability]" },
    { "id": "T27", "task": "Migration 004: sync_queue_item, content_draft", "milestone": "M4", "depends_on": ["T4"], "size": "S", "trace": "schema:tables[sync_queue_item]; schema:tables[content_draft]" },
    { "id": "T28", "task": "Client offline queue: local persistence, client IDs + idempotency keys, queued_offline composer states, draft autosave", "milestone": "M4", "depends_on": ["T19", "T27"], "size": "L", "trace": "TRD:write_model[offline_write_queue]; UX:flows[F9]" },
    { "id": "T29", "task": "A10 batch sync: per-item terminal results, idempotent replay, LWW text-only, moderation re-entry via A7 before publish", "milestone": "M4", "depends_on": ["T14", "T15", "T27"], "size": "L", "trace": "TRD:apis[A10]; PRD:p0[R6]; TRD:risks[LWW]" },
    { "id": "T30", "task": "(human) Claude Design round 4: §3.12 prompt; land SyncStatusList", "milestone": "M4", "depends_on": ["T9"], "size": "S", "trace": "UI:components[SyncStatusList]; UI:deferred[0]" },
    { "id": "T31", "task": "Integrate S12: full truthful state chain with rejection reasons; rubric QA", "milestone": "M4", "depends_on": ["T28", "T29", "T30"], "size": "M", "trace": "UX:flows[F9]; TRD:risks[offline queue confusion]" },
    { "id": "T32", "task": "Sync reconciliation audit job: no non-terminal sync_queue_item past bounded window, with alerting", "milestone": "M4", "depends_on": ["T29"], "size": "S", "trace": "TRD:nfrs[offline sync reliability]" },
    { "id": "T67", "task": "(new, quality-kit) resilience-agent blocking run (2nd run): kill mid-batch, inject latency/partition, assert terminal state + A7 re-entry; plus restore drill (QK-8) against T49 staging DB recording RPO/RTO", "milestone": "M4", "depends_on": ["T29", "T32", "T58", "T49"], "size": "L", "trace": "cadence.md 2 M4 row; resilience-audit-restore-drill.md; RR-5, RR-6, RR-19" },
    { "id": "T68", "task": "(new, quality-kit) perf-agent blocking run (2nd run): batch-sync load shape (A10 bursts) against k6 SLO thresholds", "milestone": "M4", "depends_on": ["T29"], "size": "M", "trace": "cadence.md 2 M4 row" },
    { "id": "T58", "task": "(new, split from former T47) Offline-sync-reliability NFR test: property-style batch test asserting every queued write reaches a terminal state", "milestone": "M4", "depends_on": ["T31", "T32"], "size": "S", "trace": "TRD:nfrs[offline sync reliability]" },
    { "id": "T33", "task": "Migration 005: grievance_report (generated sla_breached), grievance_audit_log, grievance_officer_contact", "milestone": "M5", "depends_on": ["T4"], "size": "S", "trace": "schema:tables[grievance_report]; schema:tables[grievance_audit_log]; schema:tables[grievance_officer_contact]" },
    { "id": "T34", "task": "A8 report intake: SLA-deadline computation, acknowledgement, duplicate merge, anonymous flag, rate limiting", "milestone": "M5", "depends_on": ["T33"], "size": "M", "trace": "TRD:apis[A8]; PRD:p0[R7]" },
    { "id": "T35", "task": "A9 resolve: operator-only authz, takedown -> blocked content, audit log, SLA-breach flagging", "milestone": "M5", "depends_on": ["T34"], "size": "M", "trace": "TRD:apis[A9]; PRD:p0[R7]" },
    { "id": "T36", "task": "Define + implement operator-decide contract for AI-escalated moderation cases (closes OQ-11 gap; documented as TRD addendum in build notes)", "milestone": "M5", "depends_on": ["T14"], "size": "M", "trace": "UX:open_questions[OQ-11]; schema:escalations[operator-decide gap]; PRD:p0[R6]" },
    { "id": "T37", "task": "Operator role/authz: role-gated S16/S17 routes; non-operator forbidden", "milestone": "M5", "depends_on": ["T12"], "size": "S", "trace": "TRD:apis[A9].errors[unauthorized caller]; UX:navigation[operator persona]" },
    { "id": "T38", "task": "SLA timers + operator alerts in worker (ack SLA, category-segmented resolution SLA, escalation notifications)", "milestone": "M5", "depends_on": ["T5", "T33"], "size": "M", "trace": "TRD:nfrs[grievance acknowledgement SLA]; TRD:nfrs[grievance resolution SLA]" },
    { "id": "T39", "task": "(human) Claude Design round 5: §3.13–3.17 prompts; land S13–S17 components", "milestone": "M5", "depends_on": ["T9"], "size": "M", "trace": "UI:components[ReportContentModal..GrievanceResolutionPanel]; UI:deferred[0]" },
    { "id": "T40", "task": "Integrate S13–S15: report modal + merged state, My Reports (sla_breached not shown to reporters per OQ-13 default), grievance contact panel", "milestone": "M5", "depends_on": ["T34", "T35", "T39"], "size": "M", "trace": "UX:flows[F7]; UX:open_questions[OQ-13]" },
    { "id": "T41", "task": "Integrate S16–S17 operator console: escalation decide via T36, A9 resolution, sla_breached operator view, unparseable-year manual-review path", "milestone": "M5", "depends_on": ["T35", "T36", "T37", "T39"], "size": "M", "trace": "UX:flows[F10]; PRD:p0[R6]; PRD:p0[R7]" },
    { "id": "T42", "task": "(human) S15 IT-Rules-compliant legal/process copy + real grievance-officer details loaded into grievance_officer_contact", "milestone": "M5", "depends_on": ["T33"], "size": "S", "trace": "UI:open_questions[S15 copy]; UI:deferred[1]; PRD:p0[R7]" },
    { "id": "T43", "task": "(human/legal) Legal review of SLA figures + DPDP consent copy and retention duration, wired into sla_deadline computation and S1/S4 onboarding", "milestone": "M5", "depends_on": ["T34"], "size": "M", "trace": "TRD:escalations[SLA figures]; TRD:risks[DPDP]" },
    { "id": "T69", "task": "(new, quality-kit) security-agent heaviest run (blocking, 4th run): operator authz on A9 + T36 decide route, grievance PII, anonymous-report flag, SLA-timer worker log/metric presence", "milestone": "M5", "depends_on": ["T35", "T36", "T37", "T38", "T40", "T41"], "size": "L", "trace": "cadence.md 2 M5 row; RR-11" },
    { "id": "T70", "task": "(new, quality-kit) privacy-agent blocking run (2nd run, full audit, QK-7): retention enforcement executed, consent presence, erasure-vs-ban legal-basis note, third-party flows, grievance PII", "milestone": "M5", "depends_on": ["T43", "T33", "T34", "T35", "T61"], "size": "L", "trace": "cadence.md 2 M5 row; RR-10" },
    { "id": "T71", "task": "(new, quality-kit) observability-agent first run (warn-only): smoke-run log/trace/metric presence, incl. SLA-timer worker instrumentation", "milestone": "M5", "depends_on": ["T38", "T41"], "size": "M", "trace": "cadence.md 2 M5 row" },
    { "id": "T72", "task": "(new, quality-kit, human) Author runbooks/pepper-rotation.md: fill every [HUMAN:] marker -- sequenced like T42/T43", "milestone": "M5", "depends_on": ["T50"], "size": "S", "trace": "cadence.md 5.3 QK-8; RR-13" },
    { "id": "T73", "task": "(new, quality-kit, human) Author runbooks/moderation-provider-outage.md: fill every [HUMAN:] marker", "milestone": "M5", "depends_on": ["T14"], "size": "S", "trace": "cadence.md 5.3 QK-8; RR-4" },
    { "id": "T74", "task": "(new, quality-kit, human) Author runbooks/takedown-sla-breach.md: fill every [HUMAN:] marker", "milestone": "M5", "depends_on": ["T35"], "size": "S", "trace": "cadence.md 5.3 QK-8; RR-2" },
    { "id": "T75", "task": "(new, quality-kit, human/legal) Author runbooks/dpdp-breach-notification.md: fill every [HUMAN:] marker -- breach-notification clock section joins T43's legal-review scope", "milestone": "M5", "depends_on": ["T43"], "size": "S", "trace": "cadence.md 5.3 QK-8; RR-10" },
    { "id": "T53", "task": "(new, split from former T47) Instrument M5 event hooks: grievance-report events across S13, operator-decide moderation outcomes across S16", "milestone": "M5", "depends_on": ["T40", "T41", "T44"], "size": "S", "trace": "PRD:p0[R8]; UX:flows[F8]" },
    { "id": "T59", "task": "(new, split from former T47) Grievance SLA NFR tests: acknowledgement-SLA test (24h); category-segmented resolution-deadline test using T43-reviewed figures", "milestone": "M5", "depends_on": ["T40", "T43"], "size": "S", "trace": "TRD:nfrs[grievance acknowledgement SLA]; TRD:nfrs[grievance resolution SLA]" },
    { "id": "T46", "task": "Metric derivation queries + metric-to-event traceability audit: all six PRD metrics computable, none un-instrumented (reads T45/T51/T52/T53)", "milestone": "M6", "depends_on": ["T45", "T51", "T52", "T53"], "size": "M", "trace": "PRD:p0[R8]; TRD:nfrs[event instrumentation completeness]" },
    { "id": "T76", "task": "(new, quality-kit) privacy-agent finalizes docs/16-privacy.md (3rd/final run, QK-7): validates complete JSON handoff against handoff-privacy.schema.json; consumed by T48 as handoff 16", "milestone": "M6", "depends_on": ["T70"], "size": "S", "trace": "cadence.md 2 M6 row; cadence.md 5.1" },
    { "id": "T47", "task": "test-verifier-agent's final full execution (QK-6) of the merged suite: re-runs T55-T59's criterion-ID tests + SECREG-<finding-id> regression-seed tests for every fixed critical/high finding since M1, as the launch-gate signal consumed by production-test's suite-reverify (T48) (rescoped from a single M6-authored task — NFR tests now authored incrementally per milestone by test-writer-agent)", "milestone": "M6", "depends_on": ["T55", "T56", "T57", "T58", "T59", "T46"], "size": "M", "trace": "TRD:nfrs[*]; cadence.md 5.2 QK-6" },
    { "id": "T48", "task": "production-test-agent GO/NO-GO run (QK-2, runs exactly once), merged with the launch checklist: re-executes ALL prior signals from scratch (security T60/T62/T65/T69, suite T47, load T66/T68, resilience+restore-drill-recency T67, ai-security T64, observability T71, privacy T76), scores PRR checklist incl. PRR-26..29, issues GO/NO-GO. Managed hosting, backups, TLS, rate limits, PWA installability also verified here", "milestone": "M6", "depends_on": ["T42", "T43", "T46", "T47", "T60", "T61", "T62", "T63", "T64", "T65", "T66", "T67", "T68", "T69", "T70", "T71", "T72", "T73", "T74", "T75", "T76"], "size": "L", "trace": "TRD:stack.infra; PRD:goals[5]; PRD:constraints[IT Act]; cadence.md 2 M6 row; cadence.md 6.1; production-test-prr-additions.md" }
  ],
  "risk_register": [
    { "risk": "P2-B mentor/support safety-protocol precondition: no protocol exists; re-marked non-blocking for v1 by human decision 2026-07-18; hard precondition — P2-B is never built until a human-designed safety/escalation protocol exists; no task in this plan touches P2-B", "source": "prd:open_questions[OQ-1]; trd:escalations[0]; ux:escalations[0]; schema:escalations[0]", "status": "accepted:gurkanwaldeep" },
    { "risk": "Grievance SLA figures (24h ack / 15-day / 24-36h) are ASSUMPTION-tagged IT Rules 2021 modeling, not legally verified", "source": "trd:escalations[1]", "status": "mitigated:T43" },
    { "risk": "Single-founder operator becomes the human-escalation and grievance-SLA bottleneck as density grows; staffing unresolved (OQ-10)", "source": "trd:escalations[2]; trd:risks[4]", "status": "open" },
    { "risk": "External AI moderation API outage stalls all UGC publication (fail-closed mandatory)", "source": "trd:risks[0]", "status": "mitigated:T14 + T56 outage drill (authored M2) + T63 resilience-agent independent toxiproxy re-run + T47 regression" },
    { "risk": "Offline queue + moderation gate interaction confuses users about unpublished 'sent' items", "source": "trd:risks[1]", "status": "mitigated:T31" },
    { "risk": "Last-write-wins could silently overwrite concurrent edits or reputation/ban state if misapplied", "source": "trd:risks[2]", "status": "mitigated:T29" },
    { "risk": "Email-hash ban matching misses due to normalization differences (case/aliasing/plus-addressing)", "source": "trd:risks[3]", "status": "mitigated:T50 (shared hash utility, moved to M1) + T23 (M3 guard-wiring) + T57 ban-durability test + T65 security-agent adversarial re-verification" },
    { "risk": "Derived-year-badge parsing fails on edge-case campus email/roll formats, blocking legitimate students", "source": "trd:risks[5]", "status": "mitigated:T6" },
    { "risk": "AI-moderation cost per active user unsized in rupee terms; could exceed single-founder budget at density", "source": "trd:risks[6]", "status": "mitigated (partially):T54 (M1 vendor-shortlist + real-quote spike before T14 provider selection)" },
    { "risk": "DPDP consent-flow copy and retention duration undefined beyond architecture-level minimization (penalties to INR 50 crore)", "source": "trd:risks[7]", "status": "mitigated:T43" },
    { "risk": "OQ-11 API gap: no TRD contract for operator-deciding an AI-escalated moderation case outside report-scoped A9; S16 decide action undertraced until closed", "source": "ux:escalations[1]; schema:escalations[2]; ui:open_questions[1]", "status": "mitigated:T36" },
    { "risk": "No dispute/appeal path for a student refused registration on a ban-record match; only S15 contact surfaced", "source": "ux:escalations[2]", "status": "open" },
    { "risk": "HMAC pepper management/rotation unspecified; rotation without a dual-hash migration silently breaks ban/identity matching", "source": "schema:escalations[1]", "status": "mitigated:T50 (documented pepper management + rotation strategy, built M1) + T72 (runbooks/pepper-rotation.md, M5)" },
    { "risk": "Stage-6 prior gate failure (P2-B blocking flags) resolved by human decision; stale blocking:true flags persist in frozen 02/03 handoffs — pipeline record-keeping incident, named in Phase 0 gate", "source": "ui:escalations[0]; plan:phase0", "status": "accepted:gurkanwaldeep" },
    { "risk": "S15 grievance process legal copy does not exist anywhere upstream; placeholder renders until human copy lands; R7 AC3 is launch-blocking", "source": "ui:open_questions[0]; ui:deferred[1]", "status": "mitigated:T42" },
    { "risk": "Repeat-session/login mechanism unspecified by any TRD API; authenticated shell for S5–S15 depends on it", "source": "ux:open_questions[OQ-14]; ui:open_questions[2]", "status": "mitigated:T12" },
    { "risk": "sla_breached visibility to reporters vs operator-only undecided; operator-only default implemented", "source": "ux:open_questions[OQ-13]; ui:open_questions[3]", "status": "open" },
    { "risk": "Claude Design round-trip latency (external, human-mediated) sits on the critical path of every milestone's integration tasks", "source": "ui:deviations[0]; plan-surfaced", "status": "largely defused: T18/T25/T30/T39 each depend only on T9 and can run back-to-back immediately once T9 lands (explicit note added to plan §2); residual only if the human paces rounds one per milestone" },
    { "risk": "Backup restoration was never verified prior to this integration -- backups are hypotheses until restored (one of three gaps named in quality-kit-additions/README-additions.md)", "source": "quality-kit-additions DECISION QK-8", "status": "mitigated:T67 (M4 restore drill against the T49 staging DB, RPO/RTO recorded) + recency re-checked <=30 days at T48/PRR-28" },
    { "risk": "No operational runbooks existed for the four highest-blast-radius incident types (pepper rotation, moderation-provider outage, takedown SLA breach, DPDP breach notification)", "source": "quality-kit-additions DECISION QK-8", "status": "mitigated:T72-T75 (authored M5; existence + owner + last-reviewed + zero-[HUMAN:]-marker gated at T48/PRR-27)" }
  ],
  "assumptions": [
    "Every task size (S/M/L) is an [ASSUMPTION]; no upstream source grounds an estimate and no hour figures exist in this plan",
    "All numeric experiment targets (penetration >=25%, WAU >=40%, D30 >=30%, 24h answer window) remain inherited [ASSUMPTION] placeholders; T46 metric queries must not hard-code pass/fail thresholds until the human sets targets (PRD OQ-9)",
    "Claude Design rounds are batched per milestone (5 rounds covering all 17 components) and each round's output lands in-repo before its integration task starts; prompts are self-contained per docs/06-ui.md",
    "Anonymous reporters receive the S13 acknowledgement only, with no ongoing status view, as the v1 default pending the anonymous-reporter visibility decision (UX OQ-15)",
    "The operator-only default for sla_breached visibility (UX OQ-13) is shipped as designed in the 06-ui briefs; flipping it later is additive",
    "src/ui/mock-data.js is reusable as test fixture data; src/ui/app.css is superseded and deleted (T1)",
    "Dual-provider moderation fallback is deferred hardening, not required for v1 (inherited TRD assumption)",
    "This is a revised plan (2026-07-19) applying 6 post-review fixes on top of the original 48-task version: T49/T50/T54 are new M1 tasks; T44/T45 moved from M6 to M1; T47 split into per-milestone NFR-authoring tasks T55-T59 plus an M6 regression pass; no task's underlying scope changed, only sequencing and splitting",
    "Second revision (2026-07-20) integrates quality-kit-additions/cadence.md's DECISION QK-4 (cadence supersedes the kit's original post-build wave model): 17 new tasks T60-T76 place every quality-kit gate (security, resilience, performance, observability, ai-security, privacy, production-test) at the milestone that creates its risk surface, per cadence.md's Layer-2 table; Layer-1 (continuous CI scanning) folds into T3; Layer-3 (event-triggered scoped checks) is a standing rule documented in architecture.md 9, not discrete tasks. T47/T48 rescoped per QK-2/QK-6. Total 76 tasks"
  ],
  "escalations": [
    "Pipeline incident (record-keeping): the P2-B question retains blocking:true in the frozen docs/02-prd.md and docs/03-trd.md handoffs even though the human decision of 2026-07-18 (gurkanwaldeep) re-marked it non-blocking in docs/04-ux.md, docs/05-schema.md, and docs/06-ui.md. Frozen upstream docs were never re-issued after the decision. This plan proceeded on the attributed human decision; both stale flags are quoted verbatim in §Phase 0 and carried as risk-register entries RR-1/RR-14 rather than silently dropped.",
    "Hard precondition carried forward: the deferred P2-B mentor/support feature must never be built until a human-designed safety/escalation protocol (trained volunteers or counseling-cell tie-up) exists. No task in this plan builds toward P2-B.",
    "Launch-blocking human dependencies inside M5: S15 grievance legal/process copy (T42) and legal review of SLA figures + DPDP consent copy (T43) are human-owned and gate T48; engineering cannot substitute for either.",
    "The tracer and every subsequent milestone depend on external Claude Design rounds (human-mediated, per the stage-6 workflow decision); a stalled round stalls its milestone — sequenced as explicit tasks (T9, T18, T25, T30, T39) so the dependency is visible, not implicit. T18/T25/T30/T39 each depend only on T9, so all four rounds may be run back-to-back immediately once T9 lands, largely defusing this as a critical-path risk (RR-18)."
  ],
  "open_questions": [
    { "question": "P2-B safety/escalation protocol — non-blocking for v1 per human decision (gurkanwaldeep, 2026-07-18); hard precondition before P2-B is ever built", "owner": "human", "blocking": false },
    { "question": "AI-moderation cost per active user in absolute rupee terms — sized against real vendor quotes at T54 (M1 spike, ahead of T14 provider selection); confirmed against real production usage only once T14's chosen provider is live at scale", "owner": "engineering", "blocking": false },
    { "question": "Independently verify the Incog toxicity/founder-suspension claim", "owner": "human", "blocking": false },
    { "question": "DPDP retention-period enforcement clock beyond T43's copy/duration decision", "owner": "engineering / legal", "blocking": false },
    { "question": "Run revenue experiment #2 (1-2 hyperlocal sponsors) only after the retention experiment succeeds", "owner": "user", "blocking": false },
    { "question": "Credible evidence a college administrator would pay for B2B2C", "owner": "user", "blocking": false },
    { "question": "Replicate the 10-junior validation test at larger scale if resourcing allows", "owner": "user", "blocking": false },
    { "question": "Set concrete numeric targets for penetration %, WAU %, D30 %, and answer-liquidity window before T46 encodes pass/fail thresholds", "owner": "user", "blocking": false },
    { "question": "Operational staffing plan if AI-escalation volume outpaces the single founder's review capacity", "owner": "human", "blocking": false },
    { "question": "Ban-refusal dispute/appeal path design (currently only the S15 contact is surfaced)", "owner": "engineering / human", "blocking": false },
    { "question": "Is sla_breached visible to the reporting student on S14, or operator-only? Operator-only default shipped", "owner": "human", "blocking": false },
    { "question": "Anonymous-reporter acknowledgement/status visibility — no retrieval key exists for a reporter-less ticket; v1 default is acknowledgement-only", "owner": "engineering", "blocking": false },
    { "question": "HMAC pepper rotation runbook (dual-hash migration strategy) before any rotation is ever executed", "owner": "engineering", "blocking": false }
  ],
  "deviations": [
    {
      "from": "Write-plan source map: UI tasks normally sequence in-repo component authoring",
      "change": "All 17 components are sequenced as external Claude Design production (human pastes docs/06-ui.md §2–§3 prompts; output lands in repo) followed by Claude Code integration tasks wiring them to A1–A10, the offline queue, and state machines; no task authors visual component code",
      "reason": "Standing human workflow decision (gurkanwaldeep, 2026-07-18) recorded in docs/06-ui.md deviations[0]: Claude Design owns visual component code; Claude Code owns backend/API/integration only"
    }
  ],
  "handoff": "build"
}
```
