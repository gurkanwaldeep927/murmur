# Stage 3 — TRD: Murmur (Verified Anonymous Campus Q&A)

**Date:** 2026-07-17
**Inherits:** `docs/02-prd.md` — 8 P0 requirements (R1–R8), 2 P1 items, 5 non-goals, 7 constraints,
9 open questions (1 blocking, scoped as below).
**Scope of this document:** the system-level HOW — architecture pattern, stack, write model,
components, entities, API contracts, NFRs, integrations, risks. No field types, no DDL (schema
stage), no screens or flows (ux stage), no visual design (ui stage), no sequencing (plan stage).

> **Provenance discipline.** Every component and API traces to a P0 requirement or an NFR.
> Anything not sourced from the PRD or `docs/01-research.md` is tagged **`[ASSUMPTION]`**.
> Nothing is silently invented.

---

## Phase 0 gate — record of disposition

The PRD's `open_questions` array contains one entry with `"blocking": true` (OQ-1: *"What safety/
escalation protocol ... will exist before the deferred mentor/support feature is ever built? ...
this does not gate the v1 wedge's pass verdict, since the mentor feature is explicitly out of v1
scope."*). The PRD's own text scopes this block to **P2-B** (mentor/support feature), which is
explicitly out of v1 scope (PRD §8 P2-B, §9 non-goal #5). No P0 or P1 requirement in this TRD
depends on the mentor/support feature, so no architecture decision below is gated by it. It is
carried forward verbatim in §11 Open Questions and §12 `escalations`, owned by a human, still
flagged `blocking: true` for its own scope (the mentor feature must never ship without it) — but it
does not halt this document. This disposition is itself an escalation-worthy judgment call and is
recorded as such, not silently applied.

All other PRD open questions (OQ-2 through OQ-9) are non-blocking; each is either answered below
(OQ-2, OQ-5 partially) or carried forward (§11).

---

## 1. Architecture Overview

**Pattern: modular monolith** — a single deployable API service organized into the modules listed
in §4, a mobile-first web client, one relational store, and a background worker process for
async/retry work (moderation retries and escalation timers, grievance SLA timers, offline-sync
reconciliation).

**Why the smallest pattern, not microservices:** no P0 or NFR forces service decomposition — the
PRD explicitly scopes v1 to a single greenfield campus with zero monetization build (PRD §6
constraint 6, §9 non-goal #1), and constraint 5 ("single-founder operator at launch") directly
favors *minimizing* operational surface area, not multiplying deployable units. The one component
with a real external dependency and failure mode of its own — AI moderation (R6) — is handled as an
**integration with a documented failure posture** (§8), not a reason to split the service. Per the
write-trd skill's discipline rule, boring tech wins ties; nothing here contests the tie.

*Provenance: PRD §6 constraint 5 (single-founder operator); PRD §6 constraint 6 (zero monetization
build); PRD §9 non-goal #2 (single campus only); write-trd skill discipline rule ("boring default:
monolith + relational store unless a P0/NFR forces otherwise").*

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| **Client** | Mobile-first responsive web app, installable as a **Progressive Web App (PWA)** — not native iOS/Android | `[ASSUMPTION]`. No P0 mandates native. The PRD names a single-founder operator (§6 constraint 5, low build/ops overhead favored), zero monetization build in v1 (§6 constraint 6, no budget line for two native codebases), and a **time-limited land-grab where speed to density is the operative constraint** (PRD §6; `docs/01-research.md` why_now — "a time-limited land-grab, not a moat... speed to density is the operative constraint"). App-store review cycles add friction a single founder building fast cannot easily absorb. The incumbent Incog is implied native (research §3/§7 mentions App Store/Play Store), but no P0 requires Murmur to match that shape — a PWA reaches the same email-gated campus audience without the review-cycle tax. |
| **Server** | Single deployable modular monolith, JSON/REST API, boring managed-language runtime (e.g. Node.js/TypeScript or equivalent) + one background worker process | `[ASSUMPTION]` on the exact runtime — the PRD gives no language signal. The monolith-vs-microservices call is provenance-backed (§1); the specific runtime is a boring default (wide hiring pool, strong async I/O for external moderation-API calls and queued jobs), not load-bearing to any P0. |
| **Store** | Relational — **PostgreSQL** (dialect: `postgresql`) | Every P0 in this system is fundamentally transactional and relational: email-keyed ban matching that must survive re-registration (R5), threaded Q&A with reputation aggregation (R3, R5), a grievance queue with SLA timers and an audit trail (R7), and a moderation-case ledger (R6) all need relational integrity and joins, not document/key-value semantics. Postgres's JSONB covers the one genuinely variable-shape payload (raw moderation-provider responses, §5 Moderation Case) without justifying a second datastore. Full-text/trigram search in Postgres covers R4 (search/browse) at v1's single-campus scale without a separate search service. `[ASSUMPTION: Postgres specifically, vs. another relational engine — boring default, no PRD signal favors one relational dialect over another]`. |
| **Infra** | Single-region managed cloud hosting: managed container/app platform + managed Postgres + managed cron/queue for the background worker | `[ASSUMPTION]`. Boring, low-ops default consistent with the single-founder-operator constraint (PRD §6 constraint 5) — no infrastructure a single founder must hand-operate. |

---

## 3. Write Model

**Declared: `offline_write_queue`.**

**Provenance:** `decisions/oq-3-write-model.md` — decided by the human owner, 2026-07-15: *"The
[app] supports offline writes: users can create/modify data while offline; changes are queued
locally and synced when connectivity returns."* Per that decision file's own guidance, the TRD
stage declares this value citing the decision as provenance and does **not** raise a new blocking
Open Question for it (the OQ-3 rule is satisfied by the existence of a human-owned decision record,
not a guess).

**Consequence summary (binds the rest of this document):**

- The client queues user-authored writes (new questions, answers, votes/accepts, reports) locally
  when offline and syncs them via a batch sync endpoint (§6 API A10) when connectivity returns.
  Every queued write carries a **client-generated local ID** and an **idempotency key** so the
  server can reconcile without creating duplicates on retry.
- **This interacts directly with R6** ("no UGC bypasses [moderation]"): a write that was authored
  offline and queued is **not published** merely because it successfully syncs. It still passes
  through the same moderation gate (§6 API A7) at sync time, before publish. The client-visible
  state for such content is "queued → syncing → pending moderation → published/blocked," never a
  silent jump from "queued" straight to "published." This is carried into UX as a legitimate screen
  state, per `decisions/oq-3-write-model.md`'s own downstream note.
- **Conflict-resolution strategy: last-write-wins**, `[ASSUMPTION]` — the PRD gives no signal
  favoring merge or manual resolution, and the decision file names last-write-wins as the "boring
  default" to apply absent PRD signal. **Scoping note (carried into Risks, §9):** last-write-wins
  applies to free-text edits (e.g., editing a question/answer body) only. Reputation-bearing state
  (votes, accepted-answer flags, ban status) is never resolved by last-write-wins overwrite — it is
  applied as **server-authoritative incremental events** (§5 Reputation Event), because a raw
  last-write-wins overwrite on a counter or a ban flag could silently erase state that must never be
  silently lost. This distinction is schema's to encode in fields (SG-5), not this document's to
  specify further.
- Sync semantics (idempotent replay, per-item partial-batch results, conflict reporting) are a first-class
  part of the API contract (§6 API A10), not an afterthought bolted onto the primary write APIs.

---

## 4. Components

| Name | Responsibility | Talks to | Provenance |
|---|---|---|---|
| **Identity & Verification Service** | College-email verification, derives the verified-year badge from email/roll-number at registration, refuses non-campus or already-used emails, never surfaces raw email onward | Pseudonymous Profile Manager, Notification Dispatcher, Ban Enforcement (via Identity store) | R1, R5 |
| **Pseudonymous Profile Manager** | Creates and owns the persistent pseudonym + year-badge display identity; is the *only* identity other users ever see; holds the internal (never-exposed) link back to Identity & Verification Service | Identity & Verification Service, Content Service, Reputation Engine | R2 |
| **Content Service (Q&A Core)** | Question/answer CRUD, threading, topic tagging, attribution to pseudonym; gates every publish through the Moderation Gateway | Moderation Gateway, Search & Browse Index, Pseudonymous Profile Manager, Offline Sync Manager, Analytics Instrumentation Service | R3 |
| **Search & Browse Index** | Indexes published Q&A content for keyword/topic search across batches; serves the read-heavy archive | Content Service (consumes publish events) | R4 |
| **Reputation Engine** | Applies contribution-based reputation deltas (upvotes, accepted answers) as server-authoritative events; makes reputation "something to lose"; triggers ban propagation on severe violations | Content Service, Identity & Verification Service, Moderation Gateway | R5 |
| **Moderation Gateway** | Synchronous pre-publish gate for every UGC submission; calls the external AI Moderation API; classifies auto-pass / auto-block / escalate; enforces fail-closed failure posture (no publish without a pass) | Content Service, External AI Moderation API (integration, §8), Human Escalation Queue | R6 |
| **Human Escalation Queue** | Operator-facing queue for AI-ambiguous or high-risk content and for grievance reports needing human judgment; the single-founder operator's console | Moderation Gateway, Grievance & Takedown Service | R6, R7 (PRD §6 constraint 5 — AI-first with human escalation, not sole-manual-moderator) |
| **Grievance & Takedown Service** | In-app report intake, tracked grievance queue with SLA timers, takedown action + audit log, publishes grievance-officer contact | Content Service (takedown action), Human Escalation Queue, Notification Dispatcher | R7 |
| **Offline Sync Manager** | Reconciles queued client writes: idempotent replay, client-generated-ID mapping, last-write-wins conflict resolution for text edits, routes every synced UGC item back through the Moderation Gateway before publish | Content Service, Moderation Gateway | write_model (`offline_write_queue`), R6 |
| **Analytics Instrumentation Service** | Captures registration, activation, WAU, D30-cohort, answer-liquidity, and moderation auto-vs-escalated events sufficient to compute every PRD §1/§5 metric | All user-facing components (emits events into it) | R8 |
| **Notification Dispatcher** | Sends verification emails/OTPs and grievance acknowledgement notices; alerts the operator on new escalations | Identity & Verification Service, Grievance & Takedown Service, external Email/OTP Delivery Provider (integration, §8) | R1 (verification delivery), R7 (grievance acknowledgement SLA) |

---

## 5. Entities

*Business-level nouns only — no field types, no keys, no DDL (schema stage owns those).*

| Entity | Key attributes (plain words) | Relationships |
|---|---|---|
| **Identity Account** | verified college email (minimized/hashed at rest — never displayed), verification status, derived enrollment year, ban status, created-at | 1–1 with Pseudonymous Profile (internal link, never exposed to any user-facing API); referenced by Ban Record lookups at registration |
| **Ban Record** | email identifier (one-way hashed for matching, not the raw email), ban reason, issued-at, originating moderation case reference | Persists independently of whether the originating Identity Account/Pseudonymous Profile still exists, so a ban survives account deletion and blocks re-registration (R5) |
| **Pseudonymous Profile** | persistent pseudonym/handle, verified-year badge, reputation score, status (active/suspended/banned) | 1–1 Identity Account (hidden link); 1–n Question; 1–n Answer; 1–n Reputation Event (as subject) |
| **Question** | title/body text, topic tag, moderation status, published-at | n–1 Pseudonymous Profile (author); 1–n Answer; 1–1 (per submission) Moderation Case |
| **Answer** | body text, moderation status, accepted flag | n–1 Question (threaded under); n–1 Pseudonymous Profile (author); 1–1 (per submission) Moderation Case |
| **Reputation Event** | event type (upvote / accepted-answer / violation-penalty), delta, actor reference, created-at | n–1 Pseudonymous Profile (whose reputation changes); n–1 content item (Question/Answer) it's attached to — applied as an append-only ledger, never a raw overwrite (§3) |
| **Moderation Case** | content reference, AI classification result, risk tier (auto-pass/auto-block/escalate), decision, decided-by (AI/human), decided-at, external-provider case reference | 1–1 with the UGC item (Question/Answer/Comment) it gates; 0–1 with an Escalation record if routed to a human |
| **Grievance Report** | reported content reference, reason, reporter reference (pseudonym or anonymous), status, SLA deadline, resolution action, resolved-at, audit trail | n–1 content item; 0–1 Moderation Case (if the report originated from or feeds a moderation decision) |
| **Sync Queue Item** | client-generated local ID, entity type, payload, client-created-at, sync status (pending/synced/conflict/rejected), server-assigned ID once synced | n–1 Pseudonymous Profile (owner); resolves into a Question/Answer/Reputation Event once synced (write_model, §3) |
| **Analytics Event** | event type (registration, activation, post, answer, WAU-ping, moderation auto/escalate outcome), actor/cohort reference, timestamp | n–1 Pseudonymous Profile / Identity Account (registration date drives cohort derivation for D30/WAU, R8) |

---

## 6. API Contracts

*One contract per read/mutation the P0s demand. Every contract lists error cases — the ux stage
sources screen error states from these.*

**A1 — Initiate Email Verification**
`POST /verification/initiate`
Inputs: college email address.
Outputs: verification-pending confirmation (check-your-email acknowledgement).
Errors: non-campus email domain → refused; already-used/already-registered email → refused;
malformed email → rejected; rate-limited (abuse protection).
Serves: R1.

**A2 — Confirm Verification & Derive Year Badge**
`POST /verification/confirm`
Inputs: verification token/OTP.
Outputs: activated Identity Account + derived year badge + newly linked/created Pseudonymous
Profile.
Errors: token expired/invalid; **enrollment year cannot be reliably parsed from the email/roll
number** → registration blocked or routed to a manual-fallback queue, *never* defaulted to a
guessed year (R1 acceptance criterion, verbatim); email matches an existing Ban Record → 
registration refused (R5).
Serves: R1, R5.

**A3 — Create Question**
`POST /questions`
Inputs: topic tag, title/body, author (pseudonym auth context), client-generated local ID +
idempotency key (offline-originated writes).
Outputs: question resource with moderation status (`pending` | `published` | `blocked`).
Errors: Moderation Gateway unavailable/timeout → content held in `pending moderation`, never
auto-published (R6 failure posture, §8); banned/suspended profile → forbidden; empty/invalid
topic → rejected; duplicate idempotency key → idempotent replay (no duplicate created).
Serves: R3, R6, write_model.

**A4 — Create Answer**
`POST /questions/{id}/answers`
Inputs: body text, author (pseudonym auth context), client-generated local ID + idempotency key.
Outputs: answer resource with moderation status.
Errors: same moderation/ban/idempotency errors as A3; parent question not found or removed →
rejected.
Serves: R3, R6, write_model.

**A5 — Search / Browse Questions**
`GET /questions/search?q=&topic=&cohort=`
Inputs: query parameters (keyword, topic, batch/cohort filter).
Outputs: matching published questions and answers, across batches.
Errors: invalid query parameters → rejected; **no matches** → not an error; returns an explicit
empty-state payload inviting a new post (R4 acceptance criterion).
Serves: R4.

**A6 — Submit Vote / Accept Answer**
`POST /answers/{id}/vote` or `POST /answers/{id}/accept`
Inputs: actor (pseudonym auth context), vote type.
Outputs: applied Reputation Event (server-authoritative delta), updated visible reputation score.
Errors: self-vote → forbidden; duplicate vote by the same actor on the same target → forbidden;
banned/suspended actor → forbidden; target content not found.
Serves: R5.

**A7 — Moderation Classify** *(internal, invoked by the Moderation Gateway on every UGC write,
including sync-time re-entry from A10)*
Contract: internal call to the External AI Moderation API.
Inputs: content payload, content type, submission context.
Outputs: classification (`auto-pass` | `auto-block` | `escalate`) + risk score + provider case
reference.
Errors: **external moderation API timeout or outage** → fail-closed: content held in `pending
moderation`, retried with backoff; if unresolved past a defined threshold, auto-routed to the
Human Escalation Queue rather than published or silently dropped (R6's "no UGC bypasses it,"
enforced structurally here, §8).
Serves: R6.

**A8 — Report Content (grievance intake)**
`POST /reports`
Inputs: reported content reference, reason, reporter (pseudonym or anonymous flag).
Outputs: grievance ticket ID + SLA-bound acknowledgement timestamp.
Errors: content not found → rejected; duplicate report from the same actor on the same content →
merged into the existing ticket, not rejected; rate-limited report abuse → throttled.
Serves: R7.

**A9 — Resolve Grievance / Takedown Action**
`POST /reports/{id}/resolve`
Inputs: operator/human decision, action (takedown | dismiss | escalate-further), notes.
Outputs: updated grievance status, audit-log entry, and — if takedown — updated content moderation
status.
Errors: report not found; unauthorized caller (non-operator) → forbidden; **resolution past the
SLA deadline** → not blocked, but flagged/logged as an SLA breach for compliance tracking (R7).
Serves: R7.

**A10 — Sync Offline Write Queue**
`POST /sync/batch`
Inputs: array of queued client writes, each with client-generated local ID, entity type, payload,
client-created-at.
Outputs: per-item result — `synced` (with server-assigned ID), `conflict` (resolved per
last-write-wins for text fields, per §3), or `rejected` (e.g., failed moderation, banned actor).
Errors: **partial-batch failure is expected, not exceptional** — each item reports its own
terminal status independently, never an all-or-nothing batch failure; every synced content item
is still routed through A7 before being marked `published` — sync never bypasses moderation
(R6 + write_model interaction, §3).
Serves: write_model (`offline_write_queue`), R6.

**A11 — Ban Enforcement Check** *(internal, invoked by A2 at registration)*
Contract: internal lookup against Ban Record by hashed email identifier.
Inputs: verified email identifier.
Outputs: ban-match boolean + reason if matched.
Errors: none user-facing beyond A2's "registration refused" outcome.
Serves: R5.

**A12 — Analytics Event Ingest** *(internal/instrumented, called by client and server components)*
`POST /events`
Inputs: event type, actor/cohort reference, timestamp, metadata.
Outputs: acknowledgement.
Errors: malformed event schema → rejected and logged, but **must never block or fail the primary
user action it's attached to** (fire-and-forget; a failed analytics write is not a failed post/
answer/vote) — this is itself an error-handling contract, not just a technical detail.
Serves: R8.

---

## 7. NFRs

| Dimension | Target | Measurement | Provenance |
|---|---|---|---|
| Moderation coverage | 100% of published UGC has a corresponding cleared Moderation Case; 0% publish-without-moderation | Automated reconciliation: published-content count == moderation-cleared-content count | R6; PRD Goal 5 |
| Moderation failure posture | 0% of UGC auto-publishes during an AI Moderation API outage | Outage-drill test + backlog-age audit on the `pending moderation` queue | R6 acceptance criterion ("no UGC bypasses it") |
| Grievance acknowledgement SLA | Acknowledged within 24h of report submission | Timestamp diff: `report.created_at` → `report.acknowledged_at` | R7 + `[ASSUMPTION: 24h, general IT Rules 2021 grievance-acknowledgement norm — see residual open question, §11]` |
| Grievance resolution SLA | General reports resolved within 15 days; specific unlawful-content categories (e.g. impersonation, non-consensual content) expedited to 24–36h | Timestamp diff: `report.created_at` → `report.resolved_at`, segmented by category | R7 + `[ASSUMPTION: IT Rules 2021 Rule 3(2)-aligned figures — legal review recommended, §11]` |
| Offline sync reliability | 100% of queued client writes reach a terminal state (synced / rejected / conflict-resolved); none silently lost | Sync-queue reconciliation audit: no `Sync Queue Item` remains in a non-terminal state past a bounded window | write_model (`offline_write_queue`) |
| Ban durability | A banned email is permanently blocked from re-registration, independent of whether the original account was deleted | Re-registration attempt test against Ban Record | R5 |
| Identity non-disclosure | 0 API responses or downstream payloads expose raw email or real identity to any non-owner actor | API response-schema audit across every contract in §6 | R1, R2 |
| Event instrumentation completeness | 100% of the PRD §1/§5 metrics (registration penetration, WAU density, D30 retention, activation, answer liquidity) are computable from captured Analytics Events; none un-instrumented | Metric-to-event traceability audit | R8 |
| Search availability | Search/browse returns results or a valid empty state under normal load | p95 query latency tracked; degrade-to-topic-browse if index unavailable (§8) | R4 + `[ASSUMPTION: no PRD-stated latency target]` |

---

## 8. Integrations

| Service | Purpose | Failure posture |
|---|---|---|
| **External AI Moderation API** (third-party UGC classification service) | Real-time classification of every UGC submission into auto-pass / auto-block / escalate tiers, at or before publish (R6). Architecture note answering PRD OQ-2/OQ-3: a **cheap, fast first-pass classifier** runs on every submission (bounding per-item cost); only the tier it flags as ambiguous is escalated to a costlier, higher-fidelity check or the human queue — this structurally bounds the still-unsized per-user moderation cost named in OQ-3, without fully sizing it in rupee terms (residual open question, §11). | **Fail-closed.** On timeout or outage, content is held in `pending moderation` and retried with backoff; if unresolved past a defined threshold, it is auto-routed to the Human Escalation Queue rather than published or silently dropped. No UGC is ever auto-published because the moderation provider was unreachable (R6's explicit "no UGC bypasses it," enforced here, not just stated). |
| **Email / OTP Delivery Provider** | Delivers the college-email verification link/OTP (R1) and grievance acknowledgement notices (R7). | Retry with backoff on delivery failure; user-visible "resend verification" affordance; registration is **blocked**, never silently defaulted to unverified, if delivery cannot be confirmed. |

*No other external services are introduced. A separate search engine, push-notification service, or
object-storage provider is deliberately **not** added — the PRD names no attachment/media
requirement in R3, and Postgres full-text search covers R4 at v1's single-campus scale (§2). Adding
either would be speculative architecture the write-trd skill's discipline rules forbid.*

---

## 9. Risks

| Risk | Blast radius | Mitigation / escalation |
|---|---|---|
| External moderation API outage stalls all new UGC publication (fail-closed is mandatory, §8) | Activation and answer-liquidity goals (PRD Goal 4) degrade platform-wide during the outage window | Retry+backoff, auto-escalation to the human queue past a threshold, provider SLA monitoring. Dual-provider fallback is a future hardening step, `[ASSUMPTION]` not required for v1. |
| Offline write queue + moderation gate interaction confuses users: a "sent" question may sit invisible for a while after sync | User trust in the app's reliability during/after connectivity loss | Client-visible, explicit `queued → syncing → pending moderation → published/blocked` state (ux stage sources this directly from API A10's status values, §6) — never silently jump from queued to published. |
| Last-write-wins (§3) `[ASSUMPTION]` conflict resolution could silently overwrite a user's own concurrent edit, or worse, reputation-relevant state | Data-integrity trust; a lost edit or a silently-erased ban/reputation state would be a serious correctness failure | Reputation/ban state is never resolved via last-write-wins overwrite — it's an append-only server-authoritative ledger (§5 Reputation Event). Last-write-wins is scoped strictly to free-text edits. Precise field-level enforcement is schema stage's responsibility (SG-5). |
| Email-hash-based ban matching (§5 Ban Record) could miss a match due to normalization differences (case, aliasing, plus-addressing) | A banned user re-registers successfully, undermining R5's core anti-toxicity guarantee | Normalize email (lowercase, strip known campus-domain aliasing) before hashing, consistently at both ban-time and registration-time. Flagged for schema-stage field-level design. |
| Single-founder operator becomes the bottleneck for human escalation (moderation) and grievance SLA resolution as density grows (Goal 2: WAU ≥ 40%) | SLA breaches → IT Act compliance/legal exposure (R7); moderation backlog; founder burnout | The cheap-classifier-first-tier architecture (§8) minimizes escalation *volume* by design. If escalation volume outpaces founder capacity at scale, staffing or volunteer-moderator tooling becomes a real future need — **not solved by v1's architecture**, flagged as a forward-looking non-blocking open question (§11), not silently assumed away. |
| Derived-year-badge parsing fails for edge-case launch-campus email/roll-number formats (PRD assumption: "the launch campus's email/roll-number scheme reliably encodes enrollment year") | Legitimate students blocked from registering (R1) | R1's acceptance criteria already require block-or-fallback, never a guessed year. TRD requires a documented, founder-owned campus-specific parsing ruleset plus a manual-review fallback queue (A2) rather than silent failure. |
| AI-moderation cost per active user remains unsized in absolute terms (PRD OQ-3) | Could exceed a viable single-founder budget at scale, even with the cost-bounding tiered architecture (§8) | Tiered classify-then-escalate architecture bounds cost *structurally*; exact vendor pricing still needs sizing against real quotes — carried forward as a non-blocking open question (§11), not guessed here. |
| DPDP Act 2023 compliance: architecture minimizes stored identity data (hashed ban-matching, never-displayed raw email, §5), but consent-flow copy and exact retention-period duration remain undefined | Regulatory exposure (PRD §6 constraint 3: penalties to INR 50 crore) if consent/retention design is inadequate at launch | Architecture-level minimization is answered here (§5, §8); the remaining legal/consent-copy and retention-duration decisions are carried forward as a narrowed, non-blocking open question owned by engineering + legal review (§11), not silently assumed. |

---

## 10. Out of Scope

- DDL, column/field types, indexes, keys — schema stage (docs/05-schema.md).
- Screens, navigation flows, wireframes, empty/error/loading screen states — ux stage
  (docs/04-ux.md), sourced from `apis[].errors` above.
- Visual design, branding, component styling — ui stage.
- Task sequencing, sprint/milestone planning — plan stage.
- Sponsor/ad tooling, B2B config, any monetization infrastructure — explicit PRD non-goal #1; not
  built in v1.
- Native iOS/Android app builds — the PWA/mobile-web `[ASSUMPTION]` in §2 explicitly deprioritizes
  native for v1; revisit only if a future P0 demands it.
- Mentor/support feature backend of any kind (P2-B) — explicitly blocked pending a human-designed
  safety/escalation protocol (OQ-1, §11); no architecture in this document builds toward it.
- Multi-campus data partitioning/tenancy design — PRD constraint: single campus only in v1 (§6
  constraint 4); each new campus is a deliberate future cold-start, not a v1 architecture concern.
- Seasonal roommate-finding (P2-A, requires opt-in de-anonymization) and Fizz-style multi-campus
  ads/marketplace (P2-C/D) — deferred PRD items, no v1 architecture built toward them.

---

## 11. Open Questions

| ID | Question | Owner | Blocking |
|---|---|---|---|
| OQ-1 | *(Carried verbatim from PRD.)* What safety/escalation protocol (trained volunteers or counseling-cell tie-up) will exist before the deferred mentor/support feature (P2-B) is ever built? **Scoped note (this TRD):** this is explicitly scoped to the out-of-v1-scope P2-B feature per the PRD's own text and does not gate this TRD's architecture — no P0 depends on it — but it remains an unresolved, human-owned blocker for if/when P2-B is ever built. | human | **true** (scoped to P2-B only) |
| OQ-2 | *(Substantially answered by this TRD.)* Detailed moderation/legal-liability spec — this document specifies the tiered classify-then-escalate architecture (§8), the fail-closed failure posture (§6 A7, §8), and grievance SLA structure (§7, §9). **Residual:** exact IT Rules 2021 SLA figures encoded in §7 (24h ack / 15-day general / 24–36h expedited categories) are `[ASSUMPTION]` and should get a legal review before launch (see `escalations`, JSON block). Who specifically staffs grievance handling day-to-day beyond "the founder" is not decided here — an operational, not architectural, decision. | engineering / legal | false |
| OQ-3 | Roughly size the AI-moderation inference cost per active user in absolute (rupee) terms. This TRD bounds the cost *structurally* (cheap-classifier-first tier, §8) but does not size it — real vendor pricing is needed. | engineering | false |
| OQ-4 | Independently verify the Incog toxicity/founder-suspension claim — not TRD-relevant; carried forward unchanged. | human | false |
| OQ-5 | *(Partially answered by this TRD.)* DPDP Act 2023 data-minimization architecture is specified (§5 Ban Record: hashed email, not raw; §2 raw email never returned in any API response). **Residual:** exact consent-flow copy and retention-period duration remain undecided — a legal/compliance decision, not an architecture one. | engineering / legal | false |
| OQ-6 | Run revenue experiment #2 (sign 1–2 hyperlocal campus sponsors) only after the retention experiment succeeds — not TRD-relevant; carried forward unchanged. | user | false |
| OQ-7 | Is there credible evidence a college administrator would pay for a B2B2C product? Not TRD-relevant; carried forward unchanged. | user | false |
| OQ-8 | Replicate the 10-junior validation test at larger scale if resourcing allows — not TRD-relevant; carried forward unchanged. | user | false |
| OQ-9 | Set concrete numeric targets for campus penetration %, WAU %, D30 %, and the answer-liquidity window — not a TRD decision; the NFRs in §7 that reference these targets inherit the PRD's `[ASSUMPTION]` tag on the underlying numbers rather than inventing new ones. Carried forward unchanged. | user | false |
| OQ-10 *(new, TRD-added)* | If AI-moderation escalation volume outpaces the single founder's human-review capacity as density grows toward Goal 2 (WAU ≥ 40%), what operational/staffing plan (trained volunteers, part-time moderators) addresses it? Not solvable by architecture alone (see Risks, §9). | human | false |

---

## 12. JSON Handoff

```json
{
  "artifact": "trd",
  "architecture_pattern": "Modular monolith: single deployable JSON/REST API service organized into identity, content, moderation, grievance, reputation, sync, and analytics modules, plus one background worker for async retries/escalation timers/SLA timers/offline-sync reconciliation. No microservice decomposition — no P0/NFR forces it; single-founder-operator constraint favors minimal operational surface area.",
  "stack": {
    "client": "Mobile-first responsive web app, installable as a PWA (not native iOS/Android) [ASSUMPTION — no P0 mandates native; single-founder ops overhead + zero v1 monetization budget + land-grab speed-to-density constraint favor no app-store review cycle]",
    "server": "Single deployable modular monolith, JSON/REST API, boring managed-language runtime (e.g. Node.js/TypeScript) [ASSUMPTION on exact runtime] + one background worker process",
    "store": "PostgreSQL (relational) — transactional integrity for ban-matching, threaded content + reputation, grievance SLA/audit trail, moderation-case ledger; JSONB for variable moderation-provider payloads; built-in full-text search covers R4 at v1 scale",
    "dialect": "postgresql"
  },
  "write_model": "offline_write_queue",
  "components": [
    { "name": "Identity & Verification Service", "responsibility": "College-email verification and derived year-badge issuance; refuses non-campus/already-used emails; never surfaces raw email onward", "talks_to": ["Pseudonymous Profile Manager", "Notification Dispatcher", "Ban Enforcement (Identity store)"], "provenance": "prd.p0_requirements[R1]; prd.p0_requirements[R5]" },
    { "name": "Pseudonymous Profile Manager", "responsibility": "Owns the persistent pseudonym + year-badge display identity shown to other users; holds the hidden internal link to the Identity Account", "talks_to": ["Identity & Verification Service", "Content Service", "Reputation Engine"], "provenance": "prd.p0_requirements[R2]" },
    { "name": "Content Service (Q&A Core)", "responsibility": "Question/answer CRUD, threading, topic tagging, pseudonym attribution; gates every publish through the Moderation Gateway", "talks_to": ["Moderation Gateway", "Search & Browse Index", "Pseudonymous Profile Manager", "Offline Sync Manager", "Analytics Instrumentation Service"], "provenance": "prd.p0_requirements[R3]" },
    { "name": "Search & Browse Index", "responsibility": "Indexes published Q&A content for keyword/topic search across batches", "talks_to": ["Content Service"], "provenance": "prd.p0_requirements[R4]" },
    { "name": "Reputation Engine", "responsibility": "Applies contribution-based reputation deltas as server-authoritative append-only events; triggers ban propagation on severe violations", "talks_to": ["Content Service", "Identity & Verification Service", "Moderation Gateway"], "provenance": "prd.p0_requirements[R5]" },
    { "name": "Moderation Gateway", "responsibility": "Synchronous pre-publish gate for every UGC submission; calls the external AI Moderation API; enforces fail-closed failure posture", "talks_to": ["Content Service", "External AI Moderation API", "Human Escalation Queue"], "provenance": "prd.p0_requirements[R6]" },
    { "name": "Human Escalation Queue", "responsibility": "Operator-facing queue for AI-ambiguous/high-risk content and grievance reports needing human judgment", "talks_to": ["Moderation Gateway", "Grievance & Takedown Service"], "provenance": "prd.p0_requirements[R6]; prd.p0_requirements[R7]; prd.constraints[single-founder operator]" },
    { "name": "Grievance & Takedown Service", "responsibility": "In-app report intake, SLA-timed grievance queue, takedown action + audit log, published grievance-officer contact", "talks_to": ["Content Service", "Human Escalation Queue", "Notification Dispatcher"], "provenance": "prd.p0_requirements[R7]" },
    { "name": "Offline Sync Manager", "responsibility": "Reconciles queued client writes: idempotent replay, client-ID mapping, last-write-wins text-conflict resolution, routes every synced UGC item back through the Moderation Gateway before publish", "talks_to": ["Content Service", "Moderation Gateway"], "provenance": "write_model[offline_write_queue]; prd.p0_requirements[R6]" },
    { "name": "Analytics Instrumentation Service", "responsibility": "Captures events sufficient to compute registration penetration, WAU density, D30 retention, activation, and answer liquidity", "talks_to": ["all user-facing components"], "provenance": "prd.p0_requirements[R8]" },
    { "name": "Notification Dispatcher", "responsibility": "Sends verification emails/OTPs and grievance acknowledgement notices; alerts the operator on new escalations", "talks_to": ["Identity & Verification Service", "Grievance & Takedown Service", "Email/OTP Delivery Provider"], "provenance": "prd.p0_requirements[R1]; prd.p0_requirements[R7]" }
  ],
  "entities": [
    { "name": "Identity Account", "key_attributes": ["verified college email (minimized/hashed, never displayed)", "verification status", "derived enrollment year", "ban status", "created at"], "relationships": ["Identity Account 1-1 Pseudonymous Profile (hidden link)", "referenced by Ban Record lookups at registration"] },
    { "name": "Ban Record", "key_attributes": ["hashed email identifier", "ban reason", "issued at", "originating moderation case reference"], "relationships": ["Ban Record persists independent of Identity Account/Pseudonymous Profile lifecycle"] },
    { "name": "Pseudonymous Profile", "key_attributes": ["persistent pseudonym/handle", "verified-year badge", "reputation score", "status"], "relationships": ["Pseudonymous Profile 1-1 Identity Account (hidden)", "Pseudonymous Profile 1-n Question", "Pseudonymous Profile 1-n Answer", "Pseudonymous Profile 1-n Reputation Event"] },
    { "name": "Question", "key_attributes": ["title/body text", "topic tag", "moderation status", "published at"], "relationships": ["Question n-1 Pseudonymous Profile (author)", "Question 1-n Answer", "Question 1-1 Moderation Case per submission"] },
    { "name": "Answer", "key_attributes": ["body text", "moderation status", "accepted flag"], "relationships": ["Answer n-1 Question", "Answer n-1 Pseudonymous Profile (author)", "Answer 1-1 Moderation Case per submission"] },
    { "name": "Reputation Event", "key_attributes": ["event type", "delta", "actor reference", "created at"], "relationships": ["Reputation Event n-1 Pseudonymous Profile (subject)", "Reputation Event n-1 content item"] },
    { "name": "Moderation Case", "key_attributes": ["content reference", "AI classification result", "risk tier", "decision", "decided by", "decided at", "external provider case reference"], "relationships": ["Moderation Case 1-1 UGC item", "Moderation Case 0-1 Escalation"] },
    { "name": "Grievance Report", "key_attributes": ["reported content reference", "reason", "reporter reference", "status", "SLA deadline", "resolution action", "resolved at", "audit trail"], "relationships": ["Grievance Report n-1 content item", "Grievance Report 0-1 Moderation Case"] },
    { "name": "Sync Queue Item", "key_attributes": ["client-generated local ID", "entity type", "payload", "client created at", "sync status", "server-assigned ID"], "relationships": ["Sync Queue Item n-1 Pseudonymous Profile (owner)", "resolves into Question/Answer/Reputation Event once synced"] },
    { "name": "Analytics Event", "key_attributes": ["event type", "actor/cohort reference", "timestamp"], "relationships": ["Analytics Event n-1 Pseudonymous Profile / Identity Account (cohort derivation)"] }
  ],
  "apis": [
    { "id": "A1", "name": "Initiate Email Verification", "contract": "POST /verification/initiate", "inputs": ["college email address"], "outputs": ["verification-pending confirmation"], "errors": ["non-campus email domain refused", "already-used/already-registered email refused", "malformed email rejected", "rate-limited"], "serves": "p0_requirements[R1]" },
    { "id": "A2", "name": "Confirm Verification & Derive Year Badge", "contract": "POST /verification/confirm", "inputs": ["verification token/OTP"], "outputs": ["activated Identity Account", "derived year badge", "linked/created Pseudonymous Profile"], "errors": ["token expired/invalid", "enrollment year cannot be reliably parsed -> blocked or manual-fallback, never guessed", "email matches existing Ban Record -> registration refused"], "serves": "p0_requirements[R1], p0_requirements[R5]" },
    { "id": "A3", "name": "Create Question", "contract": "POST /questions", "inputs": ["topic tag", "title/body", "author (pseudonym context)", "client-generated local ID + idempotency key"], "outputs": ["question resource with moderation status"], "errors": ["Moderation Gateway unavailable/timeout -> held pending, never auto-published", "banned/suspended profile forbidden", "empty/invalid topic rejected", "duplicate idempotency key -> idempotent replay"], "serves": "p0_requirements[R3], p0_requirements[R6], write_model" },
    { "id": "A4", "name": "Create Answer", "contract": "POST /questions/{id}/answers", "inputs": ["body text", "author (pseudonym context)", "client-generated local ID + idempotency key"], "outputs": ["answer resource with moderation status"], "errors": ["same moderation/ban/idempotency errors as A3", "parent question not found/removed"], "serves": "p0_requirements[R3], p0_requirements[R6], write_model" },
    { "id": "A5", "name": "Search / Browse Questions", "contract": "GET /questions/search?q=&topic=&cohort=", "inputs": ["keyword", "topic filter", "batch/cohort filter"], "outputs": ["matching published questions/answers across batches"], "errors": ["invalid query parameters rejected", "no matches -> explicit empty-state payload, not an error"], "serves": "p0_requirements[R4]" },
    { "id": "A6", "name": "Submit Vote / Accept Answer", "contract": "POST /answers/{id}/vote | POST /answers/{id}/accept", "inputs": ["actor (pseudonym context)", "vote type"], "outputs": ["applied Reputation Event", "updated reputation score"], "errors": ["self-vote forbidden", "duplicate vote forbidden", "banned/suspended actor forbidden", "target content not found"], "serves": "p0_requirements[R5]" },
    { "id": "A7", "name": "Moderation Classify", "contract": "internal call: Moderation Gateway -> External AI Moderation API", "inputs": ["content payload", "content type", "submission context"], "outputs": ["classification (auto-pass/auto-block/escalate)", "risk score", "provider case reference"], "errors": ["external API timeout/outage -> fail-closed: held pending, retried with backoff, auto-escalated to human queue past threshold, never published or dropped"], "serves": "p0_requirements[R6]" },
    { "id": "A8", "name": "Report Content", "contract": "POST /reports", "inputs": ["reported content reference", "reason", "reporter (pseudonym or anonymous)"], "outputs": ["grievance ticket ID", "SLA-bound acknowledgement timestamp"], "errors": ["content not found rejected", "duplicate report from same actor merged into existing ticket", "rate-limited report abuse throttled"], "serves": "p0_requirements[R7]" },
    { "id": "A9", "name": "Resolve Grievance / Takedown Action", "contract": "POST /reports/{id}/resolve", "inputs": ["operator/human decision", "action (takedown/dismiss/escalate-further)", "notes"], "outputs": ["updated grievance status", "audit-log entry", "updated content moderation status if takedown"], "errors": ["report not found", "unauthorized caller forbidden", "resolution past SLA deadline flagged/logged, not blocked"], "serves": "p0_requirements[R7]" },
    { "id": "A10", "name": "Sync Offline Write Queue", "contract": "POST /sync/batch", "inputs": ["array of queued client writes: client-generated local ID, entity type, payload, client-created-at"], "outputs": ["per-item result: synced (server-assigned ID) | conflict (last-write-wins resolved) | rejected"], "errors": ["partial-batch failure expected: each item reports independent terminal status", "every synced content item still routed through A7 before publish -- sync never bypasses moderation"], "serves": "write_model[offline_write_queue], p0_requirements[R6]" },
    { "id": "A11", "name": "Ban Enforcement Check", "contract": "internal lookup: Identity & Verification Service -> Ban Record (hashed email)", "inputs": ["verified email identifier"], "outputs": ["ban-match boolean + reason if matched"], "errors": ["none user-facing beyond A2's registration-refused outcome"], "serves": "p0_requirements[R5]" },
    { "id": "A12", "name": "Analytics Event Ingest", "contract": "POST /events", "inputs": ["event type", "actor/cohort reference", "timestamp", "metadata"], "outputs": ["acknowledgement"], "errors": ["malformed event schema rejected/logged but must never block or fail the primary user action it's attached to"], "serves": "p0_requirements[R8]" }
  ],
  "nfrs": [
    { "dimension": "moderation coverage", "target": "100% of published UGC has a corresponding cleared Moderation Case", "measurement": "reconciliation: published-content count == moderation-cleared count", "provenance": "prd.p0_requirements[R6]; prd.goals[5]" },
    { "dimension": "moderation failure posture", "target": "0% of UGC auto-publishes during an AI Moderation API outage", "measurement": "outage-drill test + pending-queue backlog-age audit", "provenance": "prd.p0_requirements[R6]" },
    { "dimension": "grievance acknowledgement SLA", "target": "acknowledged within 24h of report submission", "measurement": "timestamp diff report.created_at -> report.acknowledged_at", "provenance": "prd.p0_requirements[R7]; [ASSUMPTION: IT Rules 2021 general grievance-acknowledgement norm]" },
    { "dimension": "grievance resolution SLA", "target": "general reports resolved within 15 days; specific unlawful-content categories expedited to 24-36h", "measurement": "timestamp diff report.created_at -> report.resolved_at, segmented by category", "provenance": "prd.p0_requirements[R7]; [ASSUMPTION: IT Rules 2021 Rule 3(2)-aligned figures, legal review recommended]" },
    { "dimension": "offline sync reliability", "target": "100% of queued client writes reach a terminal state; none silently lost", "measurement": "sync-queue reconciliation audit", "provenance": "write_model[offline_write_queue]" },
    { "dimension": "ban durability", "target": "a banned email is permanently blocked from re-registration regardless of account deletion", "measurement": "re-registration attempt test against Ban Record", "provenance": "prd.p0_requirements[R5]" },
    { "dimension": "identity non-disclosure", "target": "0 API responses expose raw email or real identity to any non-owner actor", "measurement": "API response-schema audit", "provenance": "prd.p0_requirements[R1]; prd.p0_requirements[R2]" },
    { "dimension": "event instrumentation completeness", "target": "100% of PRD goals/metrics computable from captured Analytics Events", "measurement": "metric-to-event traceability audit", "provenance": "prd.p0_requirements[R8]" },
    { "dimension": "search availability", "target": "search/browse returns results or a valid empty state under normal load", "measurement": "p95 query latency; degrade-to-topic-browse fallback if index unavailable", "provenance": "prd.p0_requirements[R4]; [ASSUMPTION: no PRD-stated latency target]" }
  ],
  "integrations": [
    { "service": "External AI Moderation API", "purpose": "Real-time classification of every UGC submission into auto-pass/auto-block/escalate tiers, at or before publish; tiered cheap-classifier-first design bounds per-user moderation cost", "failure_posture": "Fail-closed: content held pending, retried with backoff, auto-escalated to human queue past a threshold; never auto-published or silently dropped on outage" },
    { "service": "Email / OTP Delivery Provider", "purpose": "Delivers college-email verification link/OTP and grievance acknowledgement notices", "failure_posture": "Retry with backoff; user-visible resend affordance; registration blocked (never silently defaulted to unverified) if delivery cannot be confirmed" }
  ],
  "risks": [
    { "risk": "External moderation API outage stalls all new UGC publication (fail-closed is mandatory)", "mitigation": "Retry+backoff, auto-escalation past a threshold, provider SLA monitoring; dual-provider fallback flagged as future hardening, not required for v1" },
    { "risk": "Offline write queue + moderation gate interaction could confuse users about why a 'sent' item isn't visible yet", "mitigation": "Explicit client-visible queued->syncing->pending moderation->published/blocked state, sourced by ux from API A10's status values" },
    { "risk": "Last-write-wins conflict resolution could silently overwrite concurrent edits or reputation-relevant state if misapplied", "mitigation": "Reputation/ban state is always an append-only server-authoritative ledger, never resolved via last-write-wins overwrite; last-write-wins is scoped strictly to free-text edits, enforced at schema stage (SG-5)" },
    { "risk": "Email-hash-based ban matching could miss a match due to normalization differences (case, aliasing, plus-addressing)", "mitigation": "Normalize email consistently at ban-time and registration-time before hashing; flagged for schema-stage field-level design" },
    { "risk": "Single-founder operator becomes the bottleneck for human escalation and grievance SLA resolution as density grows", "mitigation": "Cheap-classifier-first tiering minimizes escalation volume by design; staffing/volunteer-moderator tooling flagged as a forward-looking non-blocking open question, not solved by v1 architecture" },
    { "risk": "Derived-year-badge parsing fails for edge-case launch-campus email/roll-number formats", "mitigation": "Block-or-fallback (never guess) per R1; founder-owned campus-specific parsing ruleset plus manual-review fallback queue" },
    { "risk": "AI-moderation cost per active user remains unsized in absolute rupee terms", "mitigation": "Tiered architecture bounds cost structurally; exact vendor pricing carried forward as a non-blocking open question" },
    { "risk": "DPDP Act 2023 consent-flow copy and retention-period duration remain undefined beyond architecture-level minimization", "mitigation": "Architecture-level minimization answered here (hashed ban-matching, never-displayed raw email); consent-copy/retention-duration carried forward as a non-blocking open question owned by engineering + legal" }
  ],
  "out_of_scope": [
    "DDL, field types, indexes, keys (schema stage)",
    "Screens, navigation flows, wireframes, error/empty/loading states (ux stage, sourced from apis[].errors)",
    "Visual design, branding, component styling (ui stage)",
    "Task sequencing, sprint/milestone planning (plan stage)",
    "Sponsor/ad tooling, B2B config, monetization infrastructure (PRD non-goal)",
    "Native iOS/Android app builds (PWA assumption in v1)",
    "Mentor/support feature backend (P2-B, blocked pending human safety protocol, OQ-1)",
    "Multi-campus data partitioning/tenancy design (single campus only in v1)",
    "Seasonal roommate-finding (P2-A) and multi-campus ads/marketplace (P2-C/D)"
  ],
  "assumptions": [
    "Client platform is a mobile-first responsive web app installable as a PWA, not native iOS/Android — no P0 mandates native; reasoning: single-founder ops overhead, zero v1 monetization budget, land-grab speed-to-density constraint",
    "Server runtime is a boring managed language (e.g. Node.js/TypeScript) — no PRD signal favors a specific language",
    "Store engine is PostgreSQL specifically among relational options — boring default, no PRD signal favors one relational dialect over another",
    "Infra is single-region managed cloud hosting (managed app platform + managed Postgres + managed cron/queue) — boring low-ops default fitting the single-founder-operator constraint",
    "Conflict-resolution strategy for the offline write queue is last-write-wins for free-text edits, per decisions/oq-3-write-model.md's own stated boring default absent PRD signal; reputation/ban state is explicitly excluded from last-write-wins",
    "Grievance SLA figures (24h acknowledgement, 15-day general resolution, 24-36h expedited categories) are modeled on general IT Rules 2021 norms, not independently legally verified against current statute text",
    "No PRD-stated search latency target exists; a boring web-performance default is assumed",
    "The launch campus's email/roll-number scheme reliably encodes enrollment year for badge derivation (inherited PRD assumption, not independently re-verified here)"
  ],
  "escalations": [
    "OQ-1 (blocking, human-owned): the mentor/support feature (P2-B) safety/escalation protocol remains undecided. Scoped strictly to P2-B per the PRD's own text — does not gate this TRD's architecture, since no P0 depends on it — but must be resolved by a human before P2-B is ever built. Carried forward, not resolved here, per the TRD stage's hard rule against resolving blocking questions itself.",
    "Grievance SLA figures encoded in NFRs (§7) as [ASSUMPTION] (24h ack / 15-day general / 24-36h expedited) are modeled on general IT Rules 2021 norms and should receive explicit legal review before launch, given R7's P0 status and the PRD's stated IT Act compliance stakes.",
    "If AI-moderation escalation volume outpaces the single founder's human-review capacity as density grows toward Goal 2 (WAU >= 40%), an operational staffing plan is needed that this architecture does not itself provide (see OQ-10)."
  ],
  "open_questions": [
    { "question": "What safety/escalation protocol will exist before the deferred mentor/support feature (P2-B) is ever built? Scoped to P2-B only per the PRD's own text; does not gate this TRD's architecture.", "owner": "human", "blocking": true },
    { "question": "Detailed moderation/legal-liability spec is substantially answered by this TRD (tiered classify-then-escalate architecture, fail-closed posture, grievance SLA structure); residual: legal review of the specific IT Rules 2021 SLA figures encoded, and who operationally staffs grievance handling day-to-day.", "owner": "engineering", "blocking": false },
    { "question": "Roughly size the AI-moderation inference cost per active user in absolute rupee terms; this TRD bounds cost structurally but does not size it.", "owner": "engineering", "blocking": false },
    { "question": "Independently verify the Incog toxicity/founder-suspension claim -- not TRD-relevant, carried forward unchanged.", "owner": "human", "blocking": false },
    { "question": "DPDP Act 2023 data-minimization architecture is specified (hashed ban-matching email, raw email never returned); residual: exact consent-flow copy and retention-period duration remain a legal/compliance decision.", "owner": "engineering", "blocking": false },
    { "question": "Run revenue experiment #2 only after the retention experiment succeeds -- not TRD-relevant, carried forward unchanged.", "owner": "user", "blocking": false },
    { "question": "Is there credible evidence a college administrator would pay for a B2B2C product? Not TRD-relevant, carried forward unchanged.", "owner": "user", "blocking": false },
    { "question": "Replicate the 10-junior validation test at larger scale if resourcing allows -- not TRD-relevant, carried forward unchanged.", "owner": "user", "blocking": false },
    { "question": "Set concrete numeric targets for campus penetration %, WAU %, D30 %, and answer-liquidity window -- not a TRD decision; NFRs referencing these inherit the PRD's [ASSUMPTION] tag rather than inventing new numbers.", "owner": "user", "blocking": false },
    { "question": "If AI-moderation escalation volume outpaces the single founder's human-review capacity as density grows, what operational/staffing plan addresses it? Not solvable by architecture alone.", "owner": "human", "blocking": false }
  ],
  "handoff": "ux"
}
```
