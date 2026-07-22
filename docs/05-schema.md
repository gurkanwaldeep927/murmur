# Stage 5 — Schema: Murmur (Verified Anonymous Campus Q&A)

**Date:** 2026-07-17
**Inherits:** `docs/03-trd.md` — PostgreSQL (`dialect: postgresql`), `write_model:
offline_write_queue`, 10 entities, 12 API contracts (A1–A12), 9 NFRs. `docs/04-ux.md` — 10 flows,
17 screens, per-screen `data_needs` (including `NEW:` fields grounded in specific flow steps).
**Scope of this document:** tables, fields, types, constraints, indexes, relationships, full
runnable DDL. No component/screen binding (ui stage), no visual design, no sequencing.

> **Provenance discipline.** Every field traces to a UX `data_needs` entry (`UX:S?.data_needs[?]`,
> including `NEW:` items), a TRD entity attribute (`TRD:entities[Name].key_attributes[...]`), or an
> API contract (`API:apis[A?].inputs/outputs/errors[...]`). Fields with no upstream trace are the
> permitted house-convention default (`created_at`/`updated_at`, described in the write-schema
> skill) and are labeled as such, never silently added. Nothing here re-litigates the TRD's store
> choice (PostgreSQL) or write-model choice (`offline_write_queue`).

---

## Phase 0 gate — record of disposition

Both handoff blocks parse cleanly: `docs/03-trd.md` has `"artifact": "trd"`, non-empty `entities`
(10), non-empty `apis` (12), `"handoff": "ux"`. `docs/04-ux.md` has `"artifact": "ux"`, non-empty
`screens` (17), and every screen's `data_needs` array is non-empty (verified S1–S17 individually).
Gate conditions on missing/unparseable blocks, empty `entities`/`screens`, and empty `data_needs`
all pass.

Both handoffs contain one `open_questions[]` entry with `"blocking": true` — the mentor/support
feature (P2-B) safety/escalation protocol. This is the same entry the TRD and UX stages each
evaluated and explicitly scoped to **P2-B only**, a feature the PRD (§8 P2-B, §9 non-goal #5)
places entirely out of v1 scope. No TRD entity, no API contract, and no UX screen/flow in this
document's input depends on it — no table below exists to serve P2-B. Per the same disposition
logic the TRD and UX stages each applied (a repeated, not new, judgment call — this is the third
stage to make it, and it is recorded each time rather than silently inherited), this schema stage
does **not** halt on it. It is carried forward verbatim in §8 Open Questions, still flagged
blocking for its own P2-B-only scope, owned by a human. All other `open_questions` in both upstream
blocks are non-blocking and are answered or carried forward in §8.

---

## 1. Data model overview

Relational, PostgreSQL, per TRD §2 (not re-litigated here). Normalization stance: 3NF for
transactional entities, with deliberate, narrowly-scoped denormalization only where a UX screen
needs a display aggregate that would otherwise require an expensive join/count on every list render
(`question.answer_count`, `answer.vote_count`, `pseudonymous_profile.reputation_score`) — each is
explicitly flagged in its field trace as a cached aggregate, with the authoritative source stated.
Migration approach: boring default — sequential, versioned, forward-only `.sql` migration files
applied in order by a standard migration runner; no ORM-generated migrations assumed (out of scope,
§7). Every table carries `created_at`/`updated_at` per house convention (the one permitted
"speculative" default named by the write-schema skill). Primary keys are surrogate UUIDs everywhere
— no natural key (email, pseudonym, phone) is ever a primary key, per the skill's discipline rule
and because DPDP erasure requests must not break FK chains; UUIDs also directly serve the
offline-write-queue fork (§4a).

---

## 2. Entity-relationship summary

```
identity_account (1) ──── (1) pseudonymous_profile
                                   │ 1
                                   ├──< question (N)
                                   ├──< answer (N)
                                   ├──< reputation_event (N, as subject)
                                   ├──< reputation_event (N, as actor)
                                   ├──< sync_queue_item (N, as owner)
                                   ├──< content_draft (N)
                                   ├──< analytics_event (N, as actor)
                                   └──< grievance_report (N, as reporter, nullable)

topic_tag (1) ──< question (N)
topic_tag (1) ──< content_draft (N, nullable)

question (1) ──< answer (N)
question (1) ──< moderation_case (N, one per submission/re-submission event)
question (1) ──< grievance_report (N, nullable target)
question (1) ──< content_draft (N, nullable, answer drafts reference parent question)

answer (1) ──< moderation_case (N, one per submission/re-submission event)
answer (1) ──< reputation_event (N)
answer (1) ──< grievance_report (N, nullable target)

moderation_case (0..1) ──── (0..1) ban_record   [originating_moderation_case_id]
moderation_case (0..1) ──── (0..1) grievance_report

grievance_report (1) ──< grievance_audit_log (N)
grievance_report (0..1) ──── (0..1) grievance_report  [merged_into_report_id, self-reference]

ban_record — deliberately NOT foreign-keyed to identity_account/pseudonymous_profile; keyed only
             by email_hash, so it survives deletion of the account that originated it (R5, TRD §5).

grievance_officer_contact — standalone, no FK; a small versioned config record (R7 AC3).
```

All cardinalities above are named directly in TRD §5 `entities[].relationships`, except where noted
`(NEW: ...)` in the tables below.

---

## 3. Tables

*Trace convention: `TRD:entities[Name].key_attributes[...]` / `TRD:entities[Name].relationships[...]`
for TRD-sourced fields; `API:apis[A?].inputs/outputs/errors[...]` for API-contract-sourced fields;
`UX:S?.data_needs[field]` for UX-sourced fields, with `(NEW:F?.step?)` appended where UX itself
flagged the field `NEW:`; `TRD:write_model[offline_write_queue]` for SG-5 offline-branch fields with
no UX/entity-attribute source of their own; `HOUSE:created_at/updated_at` for the one permitted
default. A short note labeled **"Non-stored UX data_needs claimed by this table"** appears under any
table where a UX `data_needs` entry is a computed/derived value (e.g., an error message, an
empty-state payload) rather than its own stored column — each such entry is still explicitly listed
and its resolving mechanism named, satisfying "every `data_needs` entry must be resolvable," without
inventing a column that would really be UI-stage copywriting.*

### 3.1 `topic_tag`

**Purpose:** fixed, enumerable set of question topics (placements/internships/professors/courses/
advice per PRD R3) backing the compose and browse topic pickers.

| Field | Type | Nullable | Default | Constraint | Trace |
|---|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK | HOUSE: surrogate PK convention |
| slug | text | no | — | UNIQUE | UX:S6.data_needs[topic tag list (options)] (NEW:F3.step1) |
| label | text | no | — | — | UX:S6.data_needs[topic tag list (options)] (NEW:F3.step1); UX:S10.data_needs[topic tag list (options)] (NEW:F4.step1) |
| is_active | boolean | no | `true` | — | UX:S6/S10 same NEW trace — soft-retirement of a topic without breaking historical question rows |
| created_at | timestamptz | no | `now()` | — | HOUSE:created_at/updated_at |
| updated_at | timestamptz | no | `now()` | — | HOUSE:created_at/updated_at |

**Relations:** `topic_tag (1) —< question (N)`; `topic_tag (1) —< content_draft (N)`.

### 3.2 `identity_account`

**Purpose:** the verified, non-pseudonymous identity record — email verification state and
DPDP-minimized ban-matching material. Never joined into any user-facing read path (NFR "identity
non-disclosure").

| Field | Type | Nullable | Default | Constraint | Trace |
|---|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK | HOUSE |
| email_hash | text | no | — | UNIQUE | TRD:entities[Identity Account].key_attributes[verified college email (minimized/hashed at rest — never displayed)]; matches `ban_record.email_hash` normalization (§6) |
| email_encrypted | bytea | yes | — | — | `[ASSUMPTION]` app-layer-encrypted raw email, retained only transiently for resend/manual-review (§6 retention); satisfies UX:S1.data_needs[college email address] (write path) and API:apis[A1].inputs[college email address]; **never returned by any API** (NFR "identity non-disclosure") |
| verification_status | verification_status_enum | no | `'pending'` | — | TRD:entities[Identity Account].key_attributes[verification status]; UX:S4.data_needs[blocked-state copy] resolves via the `blocked_unparseable_year` value |
| derived_enrollment_year | integer | yes | — | CHECK (`derived_enrollment_year IS NULL OR derived_enrollment_year > 0`); CHECK (`verification_status <> 'verified' OR derived_enrollment_year IS NOT NULL`) | TRD:entities[Identity Account].key_attributes[derived enrollment year]; API:apis[A2].outputs[derived year badge] (source value before copy onto profile) |
| verification_token_hash | text | yes | — | — | UX:S3.data_needs[verification token/OTP] (write path, hashed at rest) |
| verification_token_expires_at | timestamptz | yes | — | — | API:apis[A2].errors[token expired/invalid] |
| verification_attempt_count | integer | no | `0` | — | API:apis[A1].errors[rate-limited]; UX:S2.data_needs[resend cooldown timer] (NEW:F1.step2) |
| last_verification_sent_at | timestamptz | yes | — | — | UX:S2.data_needs[resend cooldown timer] (NEW:F1.step2); UX:S2.data_needs[verification-pending confirmation message] resolves via `verification_status = 'pending'` + this timestamp |
| ban_status | boolean | no | `false` | — | TRD:entities[Identity Account].key_attributes[ban status] — account-level flag set by post-registration ban propagation (Reputation Engine), distinct from the standalone `ban_record` lookup used at registration time |
| deleted_at | timestamptz | yes | — | — | `[ASSUMPTION]` soft-delete default (write-schema skill §6) — supports DPDP erasure requests without breaking `ban_record`'s deliberately-unlinked durability |
| created_at | timestamptz | no | `now()` | — | HOUSE |
| updated_at | timestamptz | no | `now()` | — | HOUSE |

**Non-stored UX data_needs claimed by this table:**
- `UX:S1.data_needs[domain-refusal error message]` — resolved at the application layer against a
  single-value campus-domain allowlist held in app config, **not a database table**: PRD/TRD scope
  v1 to one campus only (TRD §10 "Multi-campus data partitioning/tenancy design... single campus
  only in v1"), so a domain-lookup table here would be speculative multi-tenant architecture the
  write-trd/write-schema skills forbid. Flagged in §8 Open Questions if multi-campus ever ships.
- `UX:S1.data_needs[already-used error message]` — resolved by the UNIQUE constraint violation on
  `email_hash`.
- `UX:S1.data_needs[rate-limit error message]` — resolved by `verification_attempt_count` /
  `last_verification_sent_at` (app-layer rate-limit check against these two columns).

**Relations:** `identity_account (1) —— (1) pseudonymous_profile` (hidden link, TRD-mandated
never-exposed); referenced only internally, never returned by any API per NFR "identity
non-disclosure."

### 3.3 `pseudonymous_profile`

**Purpose:** the persistent, user-facing identity — the *only* identity other users ever see.

| Field | Type | Nullable | Default | Constraint | Trace |
|---|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK | HOUSE |
| identity_account_id | uuid | no | — | UNIQUE, FK → identity_account(id) | TRD:entities[Pseudonymous Profile].relationships[1-1 Identity Account (hidden link)] — internal only; never selected by any user-facing query |
| pseudonym | text | no | — | UNIQUE | TRD:entities[Pseudonymous Profile].key_attributes[persistent pseudonym/handle]; UX:S4.data_needs[assigned pseudonym/handle]; UX:S11.data_needs[persistent pseudonym/handle] |
| year_badge | text | no | — | — | TRD:entities[Pseudonymous Profile].key_attributes[verified-year badge]; UX:S4.data_needs[derived year badge]; UX:S11.data_needs[verified-year badge]; UX:S5/S7.data_needs[author pseudonym + year badge] |
| reputation_score | integer | no | `0` | — | TRD:entities[Pseudonymous Profile].key_attributes[reputation score]; UX:S11.data_needs[reputation score] — **cached aggregate**; source of truth is the append-only `reputation_event` ledger (§4a), maintained by application logic or a maintenance job, not by direct client write |
| status | profile_status_enum | no | `'active'` | — | TRD:entities[Pseudonymous Profile].key_attributes[status]; UX:S11.data_needs[account status] |
| deleted_at | timestamptz | yes | — | — | `[ASSUMPTION]` soft-delete default |
| created_at | timestamptz | no | `now()` | — | HOUSE |
| updated_at | timestamptz | no | `now()` | — | HOUSE |

**Relations:** 1–1 `identity_account`; 1–N `question` (author); 1–N `answer` (author); 1–N
`reputation_event` (as subject and as actor); 1–N `sync_queue_item` (owner); 1–N `content_draft`;
1–N `analytics_event` (actor); 0–N `grievance_report` (reporter).

### 3.4 `question`

**Purpose:** an asked question — the core write-eligible, offline-queueable, moderation-gated
content unit.

| Field | Type | Nullable | Default | Constraint | Trace |
|---|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK | TRD:write_model[offline_write_queue] — UUID PK, see §4a |
| author_profile_id | uuid | no | — | FK → pseudonymous_profile(id) | TRD:entities[Question].relationships[n-1 Pseudonymous Profile (author)] |
| topic_tag_id | uuid | no | — | FK → topic_tag(id) | TRD:entities[Question].key_attributes[topic tag]; UX:S6.data_needs[topic tag] |
| title | text | no | — | — | TRD:entities[Question].key_attributes[title/body text]; UX:S6.data_needs[title/body text] |
| body | text | no | — | — | (same as title) |
| moderation_status | moderation_status_enum | no | `'pending'` | — | TRD:entities[Question].key_attributes[moderation status]; API:apis[A3].outputs[moderation status]; UX:S6/S7.data_needs[returned moderation status / moderation status] |
| published_at | timestamptz | yes | — | — | TRD:entities[Question].key_attributes[published-at]; UX:S5.data_needs[published-at] |
| answer_count | integer | no | `0` | — | UX:S5.data_needs[answer count (denormalized)] (NEW:F3.step5) — cached count; source of truth is `answer` rows with `moderation_status = 'published'` |
| idempotency_key | uuid | no | — | UNIQUE | API:apis[A3].inputs[client-generated local ID + idempotency key]; API:apis[A3].errors[duplicate idempotency key → idempotent replay]; UX:S6.data_needs[client-generated local ID + idempotency key] |
| search_vector | tsvector | no | generated | GENERATED ALWAYS AS (`to_tsvector('english', coalesce(title,'') \|\| ' ' \|\| coalesce(body,''))`) STORED | TRD:stack.store[Postgres full-text search covers R4]; serves API:apis[A5] and UX:S9/S10 |
| deleted_at | timestamptz | yes | — | — | TRD:write_model[offline_write_queue] — tombstone delete, see §4a |
| created_at | timestamptz | no | `now()` | — | HOUSE |
| updated_at | timestamptz | no | `now()` | — | HOUSE — also the LWW conflict-comparison column, see §4a |

**Relations:** N–1 `pseudonymous_profile` (author); 1–N `answer`; 1–N `moderation_case` (one per
submission/re-submission event — see §3.7 note); 0–N `grievance_report` (target); 0–N
`content_draft` (as an answer draft's parent).

### 3.5 `answer`

**Purpose:** a threaded answer to a question — same write-eligible/offline/moderation shape as
`question`.

| Field | Type | Nullable | Default | Constraint | Trace |
|---|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK | TRD:write_model[offline_write_queue] |
| question_id | uuid | no | — | FK → question(id) | TRD:entities[Answer].relationships[Answer n-1 Question] |
| author_profile_id | uuid | no | — | FK → pseudonymous_profile(id) | TRD:entities[Answer].relationships[Answer n-1 Pseudonymous Profile (author)] |
| body | text | no | — | — | TRD:entities[Answer].key_attributes[body text]; UX:S8.data_needs[body text] |
| moderation_status | moderation_status_enum | no | `'pending'` | — | TRD:entities[Answer].key_attributes[moderation status]; API:apis[A4].outputs[answer resource with moderation status] |
| accepted | boolean | no | `false` | — | TRD:entities[Answer].key_attributes[accepted flag]; UX:S7.data_needs[answers: ... accepted flag] |
| vote_count | integer | no | `0` | — | UX:S7.data_needs[vote count / accepted-answer marker (denormalized)] (NEW:F5.step2) — cached count; source of truth is `reputation_event` rows of type `upvote` |
| idempotency_key | uuid | no | — | UNIQUE | API:apis[A4].inputs[client-generated local ID + idempotency key]; UX:S8.data_needs[client-generated local ID + idempotency key] |
| search_vector | tsvector | no | generated | GENERATED ALWAYS AS (`to_tsvector('english', coalesce(body,''))`) STORED | TRD:stack.store[Postgres full-text search covers R4]; serves A5 (R4 AC1: "matching published questions **and answers**") |
| deleted_at | timestamptz | yes | — | — | TRD:write_model[offline_write_queue] — tombstone |
| created_at | timestamptz | no | `now()` | — | HOUSE |
| updated_at | timestamptz | no | `now()` | — | HOUSE — LWW conflict column |

**Non-stored UX data_needs claimed by this table:** `UX:S8.data_needs` moderation/ban/idempotency
error messages resolve via `moderation_status`, `pseudonymous_profile.status`, and the
`idempotency_key` UNIQUE constraint respectively — same mechanism as `question`, not separate
columns.

**Relations:** N–1 `question`; N–1 `pseudonymous_profile` (author); 1–N `moderation_case`; 1–N
`reputation_event`; 0–N `grievance_report` (target).

### 3.6 `reputation_event`

**Purpose:** the append-only, server-authoritative reputation ledger — **never** resolved via
last-write-wins (TRD §3, explicitly excluded from the offline conflict-resolution branch, §4a).

| Field | Type | Nullable | Default | Constraint | Trace |
|---|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK | HOUSE |
| event_type | reputation_event_type_enum | no | — | — | TRD:entities[Reputation Event].key_attributes[event type (upvote / accepted-answer / violation-penalty)] |
| delta | integer | no | — | — | TRD:entities[Reputation Event].key_attributes[delta] |
| actor_profile_id | uuid | yes | — | FK → pseudonymous_profile(id) | TRD:entities[Reputation Event].key_attributes[actor reference]; API:apis[A6].inputs[actor (pseudonym auth context)]; nullable for system-issued `violation_penalty` events with no peer actor |
| subject_profile_id | uuid | no | — | FK → pseudonymous_profile(id) | TRD:entities[Reputation Event].relationships[n-1 Pseudonymous Profile (whose reputation changes)] |
| question_id | uuid | yes | — | FK → question(id) | TRD:entities[Reputation Event].relationships[n-1 content item] |
| answer_id | uuid | yes | — | FK → answer(id); CHECK `num_nonnulls(question_id, answer_id) = 1` | (same) |
| created_at | timestamptz | no | `now()` | — | TRD:entities[Reputation Event].key_attributes[created-at] |
| updated_at | timestamptz | no | `now()` | — | HOUSE — expected always equal to `created_at`; this table is never updated after insert (append-only ledger, §4a) |

**Non-stored UX data_needs claimed by this table:** `UX:S7.data_needs[vote-error messages]`
(self-vote, duplicate vote, banned/suspended actor, target not found) resolve via: self-vote →
`trg_prevent_self_vote` trigger (§4 DDL); duplicate vote → `uniq_reputation_event_actor_answer_upvote`
partial unique index (§5); banned/suspended actor → `pseudonymous_profile.status` check; target not
found → standard FK/lookup miss. `UX:S7.data_needs[updated reputation score]` resolves via
`pseudonymous_profile.reputation_score` (§3.3), recomputed from this ledger.

**Relations:** N–1 `pseudonymous_profile` (subject); N–1 `pseudonymous_profile` (actor, nullable);
N–1 `question` or `answer` (exactly one, via CHECK).

### 3.7 `moderation_case`

**Purpose:** one record per moderation-triggering submission event (initial create, or a
sync-time/edit re-entry through the Moderation Gateway) for a Question or Answer — the auditable
gate every UGC write passes through (R6).

| Field | Type | Nullable | Default | Constraint | Trace |
|---|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK | HOUSE |
| question_id | uuid | yes | — | FK → question(id) | TRD:entities[Moderation Case].key_attributes[content reference] |
| answer_id | uuid | yes | — | FK → answer(id); CHECK `num_nonnulls(question_id, answer_id) = 1` | (same) |
| ai_classification_label | text | yes | — | — | API:apis[A7].outputs[classification]; TRD:entities[Moderation Case].key_attributes[AI classification result] |
| risk_tier | ai_risk_tier_enum | yes | — | — | TRD:entities[Moderation Case].key_attributes[risk tier (auto-pass/auto-block/escalate)]; API:apis[A7].outputs[classification]; UX:S16.data_needs[AI classification result, risk tier]; nullable while awaiting first classification / mid fail-closed retry (API:apis[A7].errors[timeout/outage]) |
| risk_score | numeric | yes | — | — | API:apis[A7].outputs[risk score] |
| decision | moderation_status_enum | no | `'pending'` | — | TRD:entities[Moderation Case].key_attributes[decision]; UX:S16.data_needs[decision action (publish/block)] (NEW:F10.step1) |
| decided_by | moderation_decided_by_enum | yes | — | — | TRD:entities[Moderation Case].key_attributes[decided-by (AI/human)]; UX:S16.data_needs[decision, decided-by, decided-at] |
| decided_at | timestamptz | yes | — | — | (same) |
| external_provider_case_ref | text | yes | — | — | TRD:entities[Moderation Case].key_attributes[external-provider case reference]; UX:S16.data_needs[external-provider case reference] |
| provider_raw_response | jsonb | yes | — | — | TRD:stack.store[Postgres JSONB covers the one genuinely variable-shape payload — raw moderation-provider responses] |
| created_at | timestamptz | no | `now()` | — | HOUSE |
| updated_at | timestamptz | no | `now()` | — | HOUSE |

**Note on cardinality:** TRD §5 states "Question 1–1 (per submission) Moderation Case." Because the
offline-write-queue's sync-time re-entry and any future edit-triggered re-moderation both create a
new moderation pass over the *same* content item, this schema interprets "1–1 per submission" as
**N–1 from `moderation_case` to its content item** (many submission events, one case row each) — the
most-recent case per content item is authoritative for the item's current `moderation_status`. This
is a direct, literal reading of the TRD's own "per submission" qualifier, not a speculative
extension.

**Relations:** 1–1 with the content item *per submission event* (question_id XOR answer_id); 0–1
with `ban_record` (as `originating_moderation_case_id`); 0–1 with `grievance_report`.

### 3.8 `ban_record`

**Purpose:** the permanent, email-hash-keyed ban ledger — deliberately decoupled from
`identity_account`/`pseudonymous_profile` so a ban survives deletion of the account that earned it
(R5, TRD NFR "ban durability").

| Field | Type | Nullable | Default | Constraint | Trace |
|---|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK | HOUSE |
| email_hash | text | no | — | UNIQUE | TRD:entities[Ban Record].key_attributes[email identifier (one-way hashed for matching, not the raw email)]; matches `identity_account.email_hash` normalization (§6) |
| ban_reason | text | no | — | — | TRD:entities[Ban Record].key_attributes[ban reason] |
| issued_at | timestamptz | no | `now()` | — | TRD:entities[Ban Record].key_attributes[issued-at] |
| originating_moderation_case_id | uuid | yes | — | FK → moderation_case(id) | TRD:entities[Ban Record].key_attributes[originating moderation case reference] |
| created_at | timestamptz | no | `now()` | — | HOUSE |
| updated_at | timestamptz | no | `now()` | — | HOUSE (corrective edits only — see §6, no delete path exists) |

**Deliberately no `deleted_at`, and no FK to `identity_account`/`pseudonymous_profile`:**
`TRD:entities[Ban Record].relationships[persists independently of whether the originating Identity
Account/Pseudonymous Profile still exists]`; hard/soft delete is disallowed by design per NFR "ban
durability."

**Relations:** looked up by `email_hash` at registration (API:apis[A11], internal); 0–1 to the
`moderation_case` that originated it.

### 3.9 `grievance_report`

**Purpose:** the IT Act grievance/takedown ticket, SLA-timestamped and auditable (R7).

| Field | Type | Nullable | Default | Constraint | Trace |
|---|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK | TRD:write_model[offline_write_queue] — reports are named among offline-queueable writes (TRD §3 consequence summary) |
| question_id | uuid | yes | — | FK → question(id) | TRD:entities[Grievance Report].key_attributes[reported content reference]; API:apis[A8].inputs[reported content reference] |
| answer_id | uuid | yes | — | FK → answer(id); CHECK `num_nonnulls(question_id, answer_id) = 1` | (same) |
| reason | text | no | — | — | TRD:entities[Grievance Report].key_attributes[reason]; API:apis[A8].inputs[reason]; UX:S13.data_needs[reason] |
| reporter_profile_id | uuid | yes | — | FK → pseudonymous_profile(id) | TRD:entities[Grievance Report].key_attributes[reporter reference (pseudonym or anonymous)]; NULL = anonymous |
| is_anonymous | boolean | no | `false` | — | API:apis[A8].inputs[reporter (pseudonym or anonymous flag)]; UX:S13.data_needs[reporter (pseudonym or anonymous flag)] |
| status | grievance_status_enum | no | `'open'` | — | TRD:entities[Grievance Report].key_attributes[status]; UX:S14.data_needs[status] |
| sla_deadline | timestamptz | no | — | — | TRD:entities[Grievance Report].key_attributes[SLA deadline]; API:apis[A8].outputs[SLA-bound acknowledgement timestamp]; UX:S13/S14.data_needs[SLA-bound acknowledgement timestamp / SLA deadline] |
| acknowledged_at | timestamptz | yes | — | — | API:apis[A8].outputs[SLA-bound acknowledgement timestamp]; TRD:nfrs[grievance acknowledgement SLA].measurement[report.created_at → report.acknowledged_at] |
| resolution_action | grievance_resolution_enum | yes | — | — | TRD:entities[Grievance Report].key_attributes[resolution action]; API:apis[A9].inputs[action]; UX:S17.data_needs[action] |
| resolution_notes | text | yes | — | — | API:apis[A9].inputs[notes]; TRD:entities[Grievance Report].key_attributes[audit trail]; UX:S17.data_needs[notes] |
| resolved_at | timestamptz | yes | — | — | TRD:entities[Grievance Report].key_attributes[resolved-at]; UX:S14.data_needs[resolved-at] |
| sla_breached | boolean | no | generated | GENERATED ALWAYS AS (`resolved_at IS NOT NULL AND resolved_at > sla_deadline`) STORED | API:apis[A9].errors[resolution past the SLA deadline → flagged/logged]; UX:S14.data_needs[SLA-breach flag]; UX:S17 `sla_breached` state |
| merged_into_report_id | uuid | yes | — | FK → grievance_report(id) | API:apis[A8].errors[duplicate report... merged into the existing ticket, not rejected]; UX:S13 `merged` state |
| moderation_case_id | uuid | yes | — | FK → moderation_case(id) | TRD:entities[Grievance Report].relationships[0-1 Moderation Case (if the report originated from or feeds a moderation decision)] |
| idempotency_key | uuid | yes | — | UNIQUE (nullable-safe: multiple NULLs allowed) | TRD:write_model[offline_write_queue] consequence summary — reports queued offline carry a client-generated ID |
| created_at | timestamptz | no | `now()` | — | HOUSE |
| updated_at | timestamptz | no | `now()` | — | HOUSE |

**Deliberately no `deleted_at`:** this table is itself the IT Act audit/compliance record (R7); it
is retained, never soft- or hard-deleted, only status-transitioned.

**Non-stored UX data_needs claimed by this table:** `UX:S13.data_needs[grievance ticket ID]`
resolves via `id`; `UX:S14.data_needs[updated grievance status]` resolves via `status` +
`resolution_action`; content-not-found / rate-limited errors (`UX:S13`) resolve via FK lookup miss
and app-layer throttling on `(reporter_profile_id, created_at)`, not a stored column.

**Relations:** N–1 `question` or `answer` (target, exactly one); N–1 `pseudonymous_profile`
(reporter, nullable); 0–1 self (merged-into); 0–1 `moderation_case`; 1–N `grievance_audit_log`.

### 3.10 `grievance_audit_log`

**Purpose:** the auditable trail of every action taken against a `grievance_report` — TRD names
"audit trail" as a Grievance Report key attribute and API A9 names "audit-log entry" as a distinct
output; both imply an append-only multi-entry record, not a single notes field.

| Field | Type | Nullable | Default | Constraint | Trace |
|---|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK | HOUSE |
| grievance_report_id | uuid | no | — | FK → grievance_report(id) | TRD:entities[Grievance Report].key_attributes[audit trail] |
| actor_type | text | no | — | CHECK IN (`'reporter'`,`'operator'`,`'system'`) | API:apis[A9].outputs[audit-log entry] |
| actor_profile_id | uuid | yes | — | FK → pseudonymous_profile(id) | (same) — nullable for `system` entries (e.g. auto-acknowledgement) |
| action | text | no | — | — | API:apis[A9].inputs[operator/human decision]; API:apis[A9].outputs[audit-log entry] |
| notes | text | yes | — | — | API:apis[A9].inputs[notes] |
| created_at | timestamptz | no | `now()` | — | HOUSE |
| updated_at | timestamptz | no | `now()` | — | HOUSE (append-only; never updated after insert) |

**Relations:** N–1 `grievance_report`.

### 3.11 `sync_queue_item`

**Purpose:** the offline-write-queue **outbox** — the one required outbox/pending-writes table with
retry state per SG-5 (§4a). Client-authored questions, answers, votes/accepts, and reports all pass
through this table when authored offline.

| Field | Type | Nullable | Default | Constraint | Trace |
|---|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK | HOUSE (server-assigned queue-row id, distinct from `client_local_id`) |
| owner_profile_id | uuid | no | — | FK → pseudonymous_profile(id) | TRD:entities[Sync Queue Item].relationships[n-1 Pseudonymous Profile (owner)] |
| client_local_id | uuid | no | — | UNIQUE with `owner_profile_id` | TRD:entities[Sync Queue Item].key_attributes[client-generated local ID]; UX:S12.data_needs[client-generated local ID] |
| idempotency_key | uuid | no | — | — | API:apis[A3/A4].inputs[client-generated local ID + idempotency key]; API:apis[A10].inputs[array of queued client writes, each with client-generated local ID...] |
| entity_type | sync_entity_type_enum | no | — | — | TRD:entities[Sync Queue Item].key_attributes[entity type]; UX:S12.data_needs[entity type (question/answer/vote)] |
| payload | jsonb | no | — | — | TRD:entities[Sync Queue Item].key_attributes[payload] |
| client_created_at | timestamptz | no | — | — | TRD:entities[Sync Queue Item].key_attributes[client-created-at]; API:apis[A10].inputs[client-created-at] |
| sync_status | sync_status_enum | no | `'pending'` | — | TRD:entities[Sync Queue Item].key_attributes[sync status (pending/synced/conflict/rejected)]; UX:S12.data_needs[sync status]; UX:S12 states (`queued`,`syncing`,`conflict`,`rejected`) |
| server_assigned_id | uuid | yes | — | — | TRD:entities[Sync Queue Item].key_attributes[server-assigned ID once synced]; API:apis[A10].outputs[synced (with server-assigned ID)]; UX:S12.data_needs[server-assigned ID] |
| retry_count | integer | no | `0` | — | TRD:write_model[offline_write_queue] — outbox retry state (SG-5) |
| last_attempt_at | timestamptz | yes | — | — | (same) |
| error_reason | text | yes | — | — | API:apis[A10].outputs[rejected]; API:apis[A3/A4].errors; UX:S12.data_needs[rejection reason] |
| created_at | timestamptz | no | `now()` | — | HOUSE |
| updated_at | timestamptz | no | `now()` | — | HOUSE |

**Relations:** N–1 `pseudonymous_profile` (owner); resolves into a `question`/`answer`/
`reputation_event`/`grievance_report` row once `sync_status = 'synced'` (via `server_assigned_id`).

### 3.12 `analytics_event`

**Purpose:** the append-only event stream sufficient to compute registration penetration, WAU
density, D30 retention, activation, and answer liquidity (R8) — fire-and-forget, never blocking the
action it's attached to.

| Field | Type | Nullable | Default | Constraint | Trace |
|---|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK | HOUSE |
| event_type | text | no | — | — | TRD:entities[Analytics Event].key_attributes[event type]; API:apis[A12].inputs[event type] |
| actor_profile_id | uuid | yes | — | FK → pseudonymous_profile(id) | TRD:entities[Analytics Event].key_attributes[actor/cohort reference]; TRD:entities[Analytics Event].relationships[n-1 Pseudonymous Profile / Identity Account (cohort derivation)]; nullable for pre-registration events (e.g. S1 email-entry funnel steps) |
| occurred_at | timestamptz | no | `now()` | — | TRD:entities[Analytics Event].key_attributes[timestamp]; API:apis[A12].inputs[timestamp] |
| metadata | jsonb | yes | — | — | API:apis[A12].inputs[metadata] |
| created_at | timestamptz | no | `now()` | — | HOUSE |
| updated_at | timestamptz | no | `now()` | — | HOUSE (append-only; never updated after insert) |

**Non-stored UX data_needs claimed by this table:** malformed-event rejection
(`API:apis[A12].errors[malformed event schema rejected/logged, never blocks the primary action]`) is
an ingest-time validation outcome, logged to application/operational logs, not a schema column here
— consistent with A12's own contract that a failed analytics write must never affect this or any
other table.

**Relations:** N–1 `pseudonymous_profile` (actor, nullable), whose `identity_account` join supplies
cohort/registration-date derivation for D30/WAU per TRD.

### 3.13 `content_draft`

**Purpose:** cross-session, offline-tolerant autosave for an in-progress question or answer, before
it becomes a real submitted `question`/`answer`/`sync_queue_item` row.

| Field | Type | Nullable | Default | Constraint | Trace |
|---|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK | UX:S6.data_needs[draft autosave text] (NEW:F3.step1) |
| profile_id | uuid | no | — | FK → pseudonymous_profile(id) | (same) |
| entity_type | draft_entity_type_enum | no | — | — | (same); distinguishes a question draft (S6) from an answer draft (S8, same NEW rationale) |
| parent_question_id | uuid | yes | — | FK → question(id); required when `entity_type = 'answer'` | UX:S8 answer-composer draft — same NEW:F3.step1 rationale extended to the answer composer |
| topic_tag_id | uuid | yes | — | FK → topic_tag(id) | UX:S6.data_needs[topic tag list (options)] — the draft's in-progress topic selection |
| title | text | yes | — | — | UX:S6.data_needs[draft autosave text] (NEW:F3.step1) |
| body | text | yes | — | — | (same) |
| created_at | timestamptz | no | `now()` | — | HOUSE |
| updated_at | timestamptz | no | `now()` | — | HOUSE |

**Relations:** N–1 `pseudonymous_profile`; 0–1 `question` (parent, for answer drafts only); 0–1
`topic_tag`.

### 3.14 `grievance_officer_contact`

**Purpose:** the standing, always-reachable grievance-officer contact record (R7 AC3) — small,
versioned config, independent of any specific report.

| Field | Type | Nullable | Default | Constraint | Trace |
|---|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK | UX:S15.data_needs[grievance-officer contact details] (NEW:F7.step5) |
| officer_name | text | no | — | — | (same) |
| contact_email | text | no | — | — | (same) |
| contact_phone | text | yes | — | — | (same) |
| process_summary | text | yes | — | — | UX:S15.data_needs[grievance process summary text] — `[ASSUMPTION]` placeholder copy pointer, per UX's own out-of-scope note (UX §7: copywriting is not this document's job); stored as configurable text so the ui/build stage can populate it without a schema change |
| effective_from | timestamptz | no | `now()` | — | (same NEW:F7.step5 — versioning so contact info can change over time while old versions remain auditable) |
| created_at | timestamptz | no | `now()` | — | HOUSE |
| updated_at | timestamptz | no | `now()` | — | HOUSE |

**Relations:** none (standalone reference config). Also resolves `UX:S4.data_needs[link to
grievance contact]` (NEW:F1.step4c) — the S4 refused-state link points at this table's current row;
no separate field needed on `identity_account`.

---

## 4. DDL

```sql
-- =========================================================================
-- Murmur — Stage 5 Schema — PostgreSQL
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
CREATE TYPE moderation_status_enum AS ENUM ('pending', 'published', 'blocked');
CREATE TYPE ai_risk_tier_enum AS ENUM ('auto_pass', 'auto_block', 'escalate');
CREATE TYPE moderation_decided_by_enum AS ENUM ('ai', 'human');
CREATE TYPE reputation_event_type_enum AS ENUM ('upvote', 'accepted_answer', 'violation_penalty');
CREATE TYPE profile_status_enum AS ENUM ('active', 'suspended', 'banned');
CREATE TYPE verification_status_enum AS ENUM ('pending', 'verified', 'blocked_unparseable_year');
CREATE TYPE sync_status_enum AS ENUM ('pending', 'syncing', 'synced', 'conflict', 'rejected');
CREATE TYPE sync_entity_type_enum AS ENUM ('question', 'answer', 'vote', 'report');
CREATE TYPE grievance_status_enum AS ENUM ('open', 'resolved');
CREATE TYPE grievance_resolution_enum AS ENUM ('takedown', 'dismiss', 'escalate_further');
CREATE TYPE draft_entity_type_enum AS ENUM ('question', 'answer');

-- ---------------------------------------------------------------------
-- topic_tag
-- ---------------------------------------------------------------------
CREATE TABLE topic_tag (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        text NOT NULL UNIQUE,
    label       text NOT NULL,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- identity_account
-- ---------------------------------------------------------------------
CREATE TABLE identity_account (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email_hash                      text NOT NULL UNIQUE,
    email_encrypted                 bytea,
    verification_status             verification_status_enum NOT NULL DEFAULT 'pending',
    derived_enrollment_year         integer,
    verification_token_hash         text,
    verification_token_expires_at   timestamptz,
    verification_attempt_count      integer NOT NULL DEFAULT 0,
    last_verification_sent_at       timestamptz,
    ban_status                      boolean NOT NULL DEFAULT false,
    deleted_at                      timestamptz,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_identity_year_positive
        CHECK (derived_enrollment_year IS NULL OR derived_enrollment_year > 0),
    CONSTRAINT chk_identity_verified_has_year
        CHECK (verification_status <> 'verified' OR derived_enrollment_year IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- pseudonymous_profile
-- ---------------------------------------------------------------------
CREATE TABLE pseudonymous_profile (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_account_id  uuid NOT NULL UNIQUE REFERENCES identity_account(id),
    pseudonym            text NOT NULL UNIQUE,
    year_badge           text NOT NULL,
    reputation_score     integer NOT NULL DEFAULT 0,
    status               profile_status_enum NOT NULL DEFAULT 'active',
    deleted_at           timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- question
-- ---------------------------------------------------------------------
CREATE TABLE question (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_profile_id  uuid NOT NULL REFERENCES pseudonymous_profile(id),
    topic_tag_id       uuid NOT NULL REFERENCES topic_tag(id),
    title              text NOT NULL,
    body               text NOT NULL,
    moderation_status  moderation_status_enum NOT NULL DEFAULT 'pending',
    published_at       timestamptz,
    answer_count       integer NOT NULL DEFAULT 0,
    idempotency_key    uuid NOT NULL UNIQUE,
    search_vector      tsvector GENERATED ALWAYS AS (
                           to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
                       ) STORED,
    deleted_at         timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- answer
-- ---------------------------------------------------------------------
CREATE TABLE answer (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id        uuid NOT NULL REFERENCES question(id),
    author_profile_id  uuid NOT NULL REFERENCES pseudonymous_profile(id),
    body               text NOT NULL,
    moderation_status  moderation_status_enum NOT NULL DEFAULT 'pending',
    accepted           boolean NOT NULL DEFAULT false,
    vote_count         integer NOT NULL DEFAULT 0,
    idempotency_key    uuid NOT NULL UNIQUE,
    search_vector      tsvector GENERATED ALWAYS AS (
                           to_tsvector('english', coalesce(body, ''))
                       ) STORED,
    deleted_at         timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- moderation_case
-- ---------------------------------------------------------------------
CREATE TABLE moderation_case (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id                   uuid REFERENCES question(id),
    answer_id                     uuid REFERENCES answer(id),
    ai_classification_label       text,
    risk_tier                     ai_risk_tier_enum,
    risk_score                    numeric,
    decision                      moderation_status_enum NOT NULL DEFAULT 'pending',
    decided_by                    moderation_decided_by_enum,
    decided_at                    timestamptz,
    external_provider_case_ref    text,
    provider_raw_response         jsonb,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_moderation_case_one_target
        CHECK (num_nonnulls(question_id, answer_id) = 1)
);

-- ---------------------------------------------------------------------
-- ban_record  (no FK to identity_account/pseudonymous_profile — by design)
-- ---------------------------------------------------------------------
CREATE TABLE ban_record (
    id                               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email_hash                       text NOT NULL UNIQUE,
    ban_reason                       text NOT NULL,
    issued_at                        timestamptz NOT NULL DEFAULT now(),
    originating_moderation_case_id   uuid REFERENCES moderation_case(id),
    created_at                       timestamptz NOT NULL DEFAULT now(),
    updated_at                       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- reputation_event  (append-only ledger, never LWW-resolved)
-- ---------------------------------------------------------------------
CREATE TABLE reputation_event (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type          reputation_event_type_enum NOT NULL,
    delta               integer NOT NULL,
    actor_profile_id    uuid REFERENCES pseudonymous_profile(id),
    subject_profile_id  uuid NOT NULL REFERENCES pseudonymous_profile(id),
    question_id         uuid REFERENCES question(id),
    answer_id           uuid REFERENCES answer(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_reputation_event_one_target
        CHECK (num_nonnulls(question_id, answer_id) = 1)
);

-- ---------------------------------------------------------------------
-- grievance_report
-- ---------------------------------------------------------------------
CREATE TABLE grievance_report (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id           uuid REFERENCES question(id),
    answer_id             uuid REFERENCES answer(id),
    reason                text NOT NULL,
    reporter_profile_id   uuid REFERENCES pseudonymous_profile(id),
    is_anonymous          boolean NOT NULL DEFAULT false,
    status                grievance_status_enum NOT NULL DEFAULT 'open',
    sla_deadline          timestamptz NOT NULL,
    acknowledged_at       timestamptz,
    resolution_action     grievance_resolution_enum,
    resolution_notes      text,
    resolved_at           timestamptz,
    sla_breached          boolean GENERATED ALWAYS AS (
                               resolved_at IS NOT NULL AND resolved_at > sla_deadline
                           ) STORED,
    merged_into_report_id uuid REFERENCES grievance_report(id),
    moderation_case_id    uuid REFERENCES moderation_case(id),
    idempotency_key       uuid UNIQUE,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_grievance_report_one_target
        CHECK (num_nonnulls(question_id, answer_id) = 1)
);

-- ---------------------------------------------------------------------
-- grievance_audit_log
-- ---------------------------------------------------------------------
CREATE TABLE grievance_audit_log (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grievance_report_id   uuid NOT NULL REFERENCES grievance_report(id),
    actor_type            text NOT NULL CHECK (actor_type IN ('reporter', 'operator', 'system')),
    actor_profile_id      uuid REFERENCES pseudonymous_profile(id),
    action                text NOT NULL,
    notes                 text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- sync_queue_item  (offline-write-queue outbox, SG-5)
-- ---------------------------------------------------------------------
CREATE TABLE sync_queue_item (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_profile_id    uuid NOT NULL REFERENCES pseudonymous_profile(id),
    client_local_id     uuid NOT NULL,
    idempotency_key     uuid NOT NULL,
    entity_type         sync_entity_type_enum NOT NULL,
    payload             jsonb NOT NULL,
    client_created_at   timestamptz NOT NULL,
    sync_status         sync_status_enum NOT NULL DEFAULT 'pending',
    server_assigned_id  uuid,
    retry_count         integer NOT NULL DEFAULT 0,
    last_attempt_at     timestamptz,
    error_reason        text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_sync_queue_owner_local_id UNIQUE (owner_profile_id, client_local_id)
);

-- ---------------------------------------------------------------------
-- analytics_event
-- ---------------------------------------------------------------------
CREATE TABLE analytics_event (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type         text NOT NULL,
    actor_profile_id   uuid REFERENCES pseudonymous_profile(id),
    occurred_at        timestamptz NOT NULL DEFAULT now(),
    metadata           jsonb,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- content_draft
-- ---------------------------------------------------------------------
CREATE TABLE content_draft (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id           uuid NOT NULL REFERENCES pseudonymous_profile(id),
    entity_type          draft_entity_type_enum NOT NULL,
    parent_question_id   uuid REFERENCES question(id),
    topic_tag_id         uuid REFERENCES topic_tag(id),
    title                text,
    body                 text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_content_draft_answer_has_parent
        CHECK (entity_type <> 'answer' OR parent_question_id IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- grievance_officer_contact
-- ---------------------------------------------------------------------
CREATE TABLE grievance_officer_contact (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    officer_name      text NOT NULL,
    contact_email     text NOT NULL,
    contact_phone     text,
    process_summary   text,
    effective_from    timestamptz NOT NULL DEFAULT now(),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

-- =========================================================================
-- Triggers
-- =========================================================================

-- Standard updated_at maintenance (skipped on append-only ledgers by design:
-- reputation_event, analytics_event, ban_record, grievance_audit_log are
-- never UPDATEd after insert, so no trigger is attached to them).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_topic_tag_updated_at BEFORE UPDATE ON topic_tag
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_identity_account_updated_at BEFORE UPDATE ON identity_account
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pseudonymous_profile_updated_at BEFORE UPDATE ON pseudonymous_profile
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_question_updated_at BEFORE UPDATE ON question
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_answer_updated_at BEFORE UPDATE ON answer
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_moderation_case_updated_at BEFORE UPDATE ON moderation_case
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_grievance_report_updated_at BEFORE UPDATE ON grievance_report
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sync_queue_item_updated_at BEFORE UPDATE ON sync_queue_item
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_content_draft_updated_at BEFORE UPDATE ON content_draft
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_grievance_officer_contact_updated_at BEFORE UPDATE ON grievance_officer_contact
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Self-vote prevention (API:apis[A6].errors[self-vote forbidden]) — cannot be
-- expressed as a CHECK constraint because it must read another table.
CREATE OR REPLACE FUNCTION prevent_self_vote() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.event_type = 'upvote' AND NEW.answer_id IS NOT NULL THEN
        IF NEW.actor_profile_id = (SELECT author_profile_id FROM answer WHERE id = NEW.answer_id) THEN
            RAISE EXCEPTION 'self-vote forbidden';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_self_vote
    BEFORE INSERT ON reputation_event
    FOR EACH ROW EXECUTE FUNCTION prevent_self_vote();
```

### 4a. Write-model fork (SG-5)

**Declared write model (TRD §3): `offline_write_queue`.** This schema is built on the offline
branch, not the cache-only branch. Applied as follows:

- **Client-generatable UUID primary keys** on every synced mutable table (`question`, `answer`,
  `grievance_report`) — all use `uuid` PKs via `gen_random_uuid()`, the type that makes
  client-side ID generation collision-safe. Per API A10's own contract, the *value* stored in
  `id` is server-assigned at sync time (distinct from the client's `client_local_id`, tracked only
  in `sync_queue_item`) — TRD's Sync Queue Item entity explicitly names both a "client-generated
  local ID" and a separate "server-assigned ID once synced" as two different values, which is what
  necessitates `sync_queue_item` as the ID-mapping outbox rather than letting the client's local ID
  become the permanent row ID directly.
- **A conflict/version column:** `updated_at` on `question` and `answer` serves as the
  last-write-wins comparison column for free-text edits (title/body), per TRD §3's explicit scoping
  of last-write-wins to free-text edits only.
- **Tombstone deletes:** `question.deleted_at` and `answer.deleted_at` — no hard `DELETE` is issued
  against synced content rows; a delete is a tombstone write like any other queued mutation.
- **One outbox/pending-writes table with retry state:** `sync_queue_item` (§3.11) — `retry_count`,
  `last_attempt_at`, `error_reason`, and `sync_status` implement the retry/reconciliation state API
  A10 requires (partial-batch results, per-item terminal status).
- **`grievance_report`** also carries offline-branch fields (`idempotency_key`, and it is
  UUID-PK'd) because TRD §3's consequence summary explicitly lists "reports" among the
  offline-queueable writes — traced `TRD:write_model[offline_write_queue]`, not to any UX
  `data_needs` entry, per the skill's citation rule for SG-5-only fields.
- **Explicitly excluded from the offline/LWW branch — server-authoritative, append-only,
  never conflict-resolved:**
  - `reputation_event` — no `updated_at`-based conflict logic is ever applied to it; it is
    insert-only. An offline-authored vote/accept is represented purely as a `sync_queue_item` row
    pre-sync; only once the server processes it does a `reputation_event` row get created — the
    ledger itself never receives a client-supplied ID or a conflict/version comparison.
  - `ban_record` and `identity_account.ban_status` — ban state is never resolved via
    last-write-wins overwrite; a ban is issued (or an account's `ban_status` flipped) only as a
    discrete, server-authoritative write, never merged against a concurrent client edit.
  - `moderation_case` — decisions are AI/operator-authored server-side only; never client-queued.
- **Cache-only-branch machinery (client-side read caching, ETags, stale-while-revalidate) is
  deliberately absent from this schema** — it is a client/API concern, not a server data-shape
  concern, and the TRD did not choose the cache-only write model.

---

## 5. Indexes

| Table | Fields | Serves |
|---|---|---|
| `identity_account` | `email_hash` (UNIQUE, implicit) | API:apis[A1] uniqueness check; API:apis[A11] ban lookup pairing |
| `pseudonymous_profile` | `pseudonym` (UNIQUE, implicit) | UX:S11, UX:S5/S7 author display lookup |
| `pseudonymous_profile` | `identity_account_id` (UNIQUE, implicit) | 1-1 hidden-link integrity |
| `question` | `(moderation_status, published_at DESC)` | UX:S5 Home Feed (published, most-recent-first) |
| `question` | `topic_tag_id` | UX:S10 Topic Browse |
| `question` | `author_profile_id` | UX:S11 My Profile / UX:S12 My Content |
| `question` | `search_vector` GIN | UX:S9 Search / API:apis[A5] |
| `answer` | `question_id` | UX:S7 Question Detail / Thread |
| `answer` | `author_profile_id` | UX:S11 / UX:S12 |
| `answer` | `search_vector` GIN | UX:S9 Search / API:apis[A5] (R4 AC1 "questions and answers") |
| `reputation_event` | `subject_profile_id` | UX:S11 reputation-score recompute |
| `reputation_event` | `(actor_profile_id, answer_id)` UNIQUE, partial `WHERE event_type = 'upvote'` | API:apis[A6].errors[duplicate vote by the same actor forbidden] |
| `moderation_case` | `(question_id, answer_id)` | UX:S7/S12 current-status lookup |
| `moderation_case` | `risk_tier`, partial `WHERE risk_tier = 'escalate' AND decision = 'pending'` | UX:S16 Operator Escalation Queue |
| `ban_record` | `email_hash` (UNIQUE, implicit) | API:apis[A11] ban enforcement check |
| `grievance_report` | `status` | UX:S17 Operator Grievance Resolution queue |
| `grievance_report` | `reporter_profile_id` | UX:S14 My Reports |
| `grievance_report` | `sla_deadline` | TRD:nfrs[grievance acknowledgement/resolution SLA] monitoring |
| `grievance_audit_log` | `grievance_report_id` | UX:S17 audit-trail render |
| `sync_queue_item` | `(owner_profile_id, sync_status)` | UX:S12 My Content & Sync Status |
| `sync_queue_item` | `(owner_profile_id, client_local_id)` UNIQUE (implicit) | API:apis[A10] idempotent replay |
| `analytics_event` | `(event_type, occurred_at)` | TRD:nfrs[event instrumentation completeness] metric queries |
| `analytics_event` | `actor_profile_id` | R8 cohort derivation |
| `content_draft` | `(profile_id, entity_type)`, partial unique per entity_type (question: one per profile; answer: one per `(profile_id, parent_question_id)`) | UX:S6/S8 draft autosave upsert |

```sql
CREATE INDEX idx_question_status_published ON question (moderation_status, published_at DESC);
CREATE INDEX idx_question_topic ON question (topic_tag_id);
CREATE INDEX idx_question_author ON question (author_profile_id);
CREATE INDEX idx_question_search_vector ON question USING GIN (search_vector);

CREATE INDEX idx_answer_question ON answer (question_id);
CREATE INDEX idx_answer_author ON answer (author_profile_id);
CREATE INDEX idx_answer_search_vector ON answer USING GIN (search_vector);

CREATE INDEX idx_reputation_event_subject ON reputation_event (subject_profile_id);
CREATE UNIQUE INDEX uniq_reputation_event_actor_answer_upvote
    ON reputation_event (actor_profile_id, answer_id)
    WHERE event_type = 'upvote' AND answer_id IS NOT NULL AND actor_profile_id IS NOT NULL;

CREATE INDEX idx_moderation_case_content ON moderation_case (question_id, answer_id);
CREATE INDEX idx_moderation_case_escalation_queue ON moderation_case (risk_tier)
    WHERE risk_tier = 'escalate' AND decision = 'pending';

CREATE INDEX idx_grievance_report_status ON grievance_report (status);
CREATE INDEX idx_grievance_report_reporter ON grievance_report (reporter_profile_id);
CREATE INDEX idx_grievance_report_sla_deadline ON grievance_report (sla_deadline);

CREATE INDEX idx_grievance_audit_log_report ON grievance_audit_log (grievance_report_id);

CREATE INDEX idx_sync_queue_owner_status ON sync_queue_item (owner_profile_id, sync_status);

CREATE INDEX idx_analytics_event_type_time ON analytics_event (event_type, occurred_at);
CREATE INDEX idx_analytics_event_actor ON analytics_event (actor_profile_id);

CREATE UNIQUE INDEX uniq_content_draft_question ON content_draft (profile_id)
    WHERE entity_type = 'question';
CREATE UNIQUE INDEX uniq_content_draft_answer ON content_draft (profile_id, parent_question_id)
    WHERE entity_type = 'answer';
```

---

## 6. Data lifecycle

- **Retention/delete stance, per table:**
  - Soft delete (`deleted_at` tombstone, `[ASSUMPTION]` house default absent a PRD-stated
    retention period): `identity_account`, `pseudonymous_profile`, `question`, `answer`. Question/
    answer soft-delete is additionally mandatory, not just a default, per the offline-write-queue
    fork (§4a).
  - **No delete, ever, by design (not a default — a requirement):** `ban_record` (R5/NFR "ban
    durability" — a ban must survive account deletion, so it cannot itself be deletable);
    `grievance_report` and `grievance_audit_log` (R7 — the IT Act audit trail is a compliance
    record); `reputation_event` and `analytics_event` (append-only ledgers, TRD §3).
  - `moderation_case`: never deleted (it is the auditable proof of R6's "100% moderation
    coverage" NFR); only updated as a decision resolves.
  - `topic_tag`: soft-retired via `is_active = false`, never deleted (would orphan historical
    `question.topic_tag_id` references).
  - `content_draft`, `sync_queue_item`: `[ASSUMPTION]` — these are working-state tables, not
    covered by any PRD retention constraint; hard delete/cleanup once a draft is submitted or a
    sync item reaches a terminal state is reasonable and left to a build-time housekeeping job, not
    specified further here (out of scope, §7).
- **DPDP Act 2023 minimization, enforced at the schema level (R1, TRD §5/§8/§9):**
  - `identity_account.email_encrypted` holds the raw college email, application-layer encrypted,
    and is **nulled out once `verification_status` reaches `'verified'`** — the hash alone
    (`email_hash`) suffices for all ongoing operations (ban-matching, duplicate-registration
    checks) after that point. It is retained only transiently while `verification_status IN
    ('pending', 'blocked_unparseable_year')`, for resend delivery (S2) and manual-fallback review.
  - No API in TRD §6 returns `email_encrypted` or `email_hash`; every response schema audited
    against NFR "identity non-disclosure" (TRD §7) excludes both. `ban_record.email_hash` is the
    only email-derived value that ever crosses the registration boundary (A11's internal
    ban-match lookup), and it is a one-way hash, never the raw address.
  - **Normalization before hashing (TRD §9 Risk: "Email-hash-based ban matching could miss a match
    due to normalization differences"):** both `identity_account.email_hash` and
    `ban_record.email_hash` must be computed by the *same* deterministic procedure — lowercase the
    local part and domain, strip known campus-domain plus-addressing/aliasing patterns, then apply
    a keyed hash (HMAC, not a bare SHA-256, to resist offline dictionary/rainbow-table attacks
    against the small, guessable space of campus email addresses) using a server-held secret. This
    procedure is an application-layer contract, not itself expressible as a DDL constraint; it is
    recorded here so both write paths (registration, ban issuance) never drift apart. Flagged in
    §8 as a non-blocking engineering open question (secret/pepper management, not decided here).
  - `pseudonymous_profile.identity_account_id` is the one FK that could re-identify a user if
    joined and exposed; no query path in any traced UX screen or API contract selects across this
    join outward-facing, and it is flagged in `pii_fields` below as an access-restricted internal
    linkage, not casual-query-safe.
- **PII fields (flagged for access control and any future retention/consent-copy decision, TRD
  OQ-5/UX OQ-5):**
  - `identity_account.email_hash`
  - `identity_account.email_encrypted`
  - `identity_account.verification_token_hash`
  - `ban_record.email_hash`
  - `pseudonymous_profile.identity_account_id` (sensitive internal linkage — not raw PII itself,
    but the single point of re-identification risk if ever exposed)

---

## 7. Out of Scope

- ORM models/entities, seed/fixture scripts, query-plan tuning beyond the indexes named in §5 —
  build stage.
- Exact DPDP-mandated retention *duration* and consent-flow copy (TRD OQ-5/UX OQ-5) — legal/
  compliance decision, not a schema-shape decision; this document only enforces minimization
  mechanically (§6).
- HMAC pepper/secret management and rotation policy for `email_hash` computation (§6) — a
  security-operations decision, carried to §8.
- Multi-campus domain-allowlist modeling — deliberately not a table (§3.2), since v1 is
  single-campus (TRD §10); would need a `campus` table and a domain-to-campus mapping if/when a
  second campus is added.
- Session/auth-token storage — no TRD API models login/session distinctly from A2 (UX OQ-14); this
  document does not invent a `session` table pending that decision.
- A distinct data-shape or table for "operator resolves an AI-escalated Moderation Case outside a
  Grievance Report" — the `moderation_case.decision`/`decided_by`/`decided_at` fields already carry
  this state (§3.7, UX:S16 NEW:F10.step1), but the *API contract* that writes them is UX OQ-11's
  unresolved gap, not a schema gap; carried forward, §8.
- Bulk-action/dashboard tooling for the operator console (S16/S17) beyond the minimum fields named
  — UX itself scoped this as a build-time refinement (UX §7), not a v1 schema requirement.
- Task sequencing, migration file numbering/ordering mechanics — plan stage.

---

## 8. Open Questions

*Every upstream non-blocking open question from TRD §11 / UX §8 is carried forward verbatim below
(deduplicated where TRD and UX name the same item), plus new schema-stage questions.*

| Question | Owner | Blocking |
|---|---|---|
| What safety/escalation protocol will exist before the deferred mentor/support feature (P2-B) is ever built? Scoped strictly to P2-B per the PRD/TRD/UX's own text; does not gate this schema stage — no table here exists to serve P2-B. | human | **true** (scoped to P2-B only) |
| Detailed moderation/legal-liability spec is substantially answered upstream; residual legal review of the specific IT Rules 2021 SLA figures encoded in `grievance_report.sla_deadline`'s computation, and who operationally staffs grievance handling day-to-day. | engineering / legal | false |
| Roughly size the AI-moderation inference cost per active user in absolute rupee terms — not a schema concern, carried forward unchanged. | engineering | false |
| Independently verify the Incog toxicity/founder-suspension claim — not schema-relevant, carried forward unchanged. | human | false |
| DPDP Act 2023 consent-flow copy and exact retention-period duration remain undecided; this schema enforces minimization mechanically (§6) but does not set a retention clock — the `[ASSUMPTION]` soft-delete stance on `identity_account`/`pseudonymous_profile` is a placeholder pending that legal decision. | engineering / legal | false |
| Run revenue experiment #2 only after the retention experiment succeeds — not schema-relevant, carried forward unchanged. | user | false |
| Is there credible evidence a college administrator would pay for a B2B2C product? Not schema-relevant, carried forward unchanged. | user | false |
| Replicate the 10-junior validation test at larger scale if resourcing allows — not schema-relevant, carried forward unchanged. | user | false |
| Set concrete numeric targets for campus penetration %, WAU %, D30 %, and answer-liquidity window — not a schema decision; carried forward unchanged. | user | false |
| If AI-moderation escalation volume outpaces the single founder's human-review capacity, what operational/staffing plan addresses it? Not resolvable at schema stage; `moderation_case`'s shape does not change either way. | human | false |
| No distinct API contract exists for an operator resolving an AI-escalated `moderation_case` outside the report-scoped A9 flow (UX OQ-11) — the schema fields exist (`decision`, `decided_by`, `decided_at`), but which endpoint writes them for a non-report-originated escalation is unresolved; carried forward for the next API-completeness pass. | engineering | false |
| A student refused registration on a `ban_record` match has no defined dispute/appeal path (UX OQ-12) — this schema stores no dispute/appeal table, since none is named by any TRD entity or UX screen; if a dispute flow is designed later, it will need a new table, not a retrofit of `ban_record` (which must remain append-only/undeletable). | engineering / human | false |
| Whether `grievance_report.sla_breached` is exposed to the original reporter via a future API, or kept operator-internal only, is undecided (UX OQ-13); the column exists and computes correctly either way — this is an API/UI exposure decision, not a schema gap. | engineering / legal | false |
| Repeat-session/login mechanism after initial verification is unspecified by any TRD API (UX OQ-14); no `session`/`auth_token` table is included here pending that decision (§7 Out of Scope). | engineering | false |
| Whether an anonymous reporter (`grievance_report.is_anonymous = true`, `reporter_profile_id IS NULL`) receives any acknowledgement/status visibility is unclear (UX OQ-15); the schema supports anonymous reports structurally but provides no retrieval key for an anonymous reporter to check status later — flagged, not solved here. | engineering | false |
| *(new, schema-stage)* HMAC pepper/secret management and rotation policy for `email_hash` computation (§6) is unspecified — an operational security decision needed before launch, since rotating the secret would silently break all existing `ban_record`/`identity_account` hash matches unless a migration/dual-hash strategy is planned. | engineering | false |
| *(new, schema-stage)* `pseudonymous_profile.reputation_score`, `question.answer_count`, and `answer.vote_count` are cached aggregates (§1, §3.3–3.5); the exact maintenance mechanism (synchronous app-layer update on write vs. an async recomputation job) is left to the build stage, not decided here — either is consistent with this schema's shape. | engineering | false |
| *(new, schema-stage)* Self-vote prevention is implemented as a `BEFORE INSERT` trigger on `reputation_event` (§4); duplicate-vote prevention is a partial unique index (§5). Both are schema-level enforcement of API:apis[A6] error contracts, included here rather than left purely to application code — flagged for review at build time to confirm no double-enforcement conflict with app-layer validation. | engineering | false |

---

## 9. JSON Handoff

```json
{
  "artifact": "schema",
  "dialect": "postgresql",
  "tables": [
    { "name": "topic_tag", "purpose": "Fixed enumerable topic set backing question compose/browse.", "fields": [
      { "name": "id", "type": "uuid", "nullable": false, "constraint": "PRIMARY KEY DEFAULT gen_random_uuid()", "trace": "HOUSE:created_at/updated_at (surrogate PK convention)" },
      { "name": "slug", "type": "text", "nullable": false, "constraint": "UNIQUE", "trace": "UX:S6.data_needs[topic tag list (options)] (NEW:F3.step1)" },
      { "name": "label", "type": "text", "nullable": false, "constraint": "", "trace": "UX:S6.data_needs[topic tag list (options)] (NEW:F3.step1); UX:S10.data_needs[topic tag list (options)] (NEW:F4.step1)" },
      { "name": "is_active", "type": "boolean", "nullable": false, "constraint": "DEFAULT true", "trace": "UX:S6.data_needs[topic tag list (options)] (NEW:F3.step1)" },
      { "name": "created_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE:created_at/updated_at" },
      { "name": "updated_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE:created_at/updated_at" }
    ], "relations": [ { "to": "question", "kind": "1:N", "via": "question.topic_tag_id" }, { "to": "content_draft", "kind": "1:N", "via": "content_draft.topic_tag_id" } ] },

    { "name": "identity_account", "purpose": "Verified identity + DPDP-minimized ban-matching material; never joined into user-facing reads.", "fields": [
      { "name": "id", "type": "uuid", "nullable": false, "constraint": "PRIMARY KEY", "trace": "HOUSE" },
      { "name": "email_hash", "type": "text", "nullable": false, "constraint": "UNIQUE", "trace": "TRD:entities[Identity Account].key_attributes[verified college email (minimized/hashed at rest — never displayed)]; UX:S1.data_needs[already-used error message] (resolved by UNIQUE violation); UX:S1.data_needs[domain-refusal error message] (resolved by app-config domain check adjacent to this uniqueness check, §3.2 note)" },
      { "name": "email_encrypted", "type": "bytea", "nullable": true, "constraint": "never returned by any API", "trace": "[ASSUMPTION]; UX:S1.data_needs[college email address]; API:apis[A1].inputs[college email address]; UX:S4.data_needs[raw email] (mode: never displayed)" },
      { "name": "verification_status", "type": "verification_status_enum", "nullable": false, "constraint": "DEFAULT 'pending'", "trace": "TRD:entities[Identity Account].key_attributes[verification status]; UX:S2.data_needs[verification-pending confirmation message]; UX:S4.data_needs[blocked-state copy]" },
      { "name": "derived_enrollment_year", "type": "integer", "nullable": true, "constraint": "CHECK > 0; CHECK NOT NULL if verified", "trace": "TRD:entities[Identity Account].key_attributes[derived enrollment year]; API:apis[A2].outputs[derived year badge]" },
      { "name": "verification_token_hash", "type": "text", "nullable": true, "constraint": "", "trace": "UX:S3.data_needs[verification token/OTP]" },
      { "name": "verification_token_expires_at", "type": "timestamptz", "nullable": true, "constraint": "", "trace": "API:apis[A2].errors[token expired/invalid]" },
      { "name": "verification_attempt_count", "type": "integer", "nullable": false, "constraint": "DEFAULT 0", "trace": "API:apis[A1].errors[rate-limited]; UX:S1.data_needs[rate-limit error message]; UX:S2.data_needs[resend cooldown timer] (NEW:F1.step2)" },
      { "name": "last_verification_sent_at", "type": "timestamptz", "nullable": true, "constraint": "", "trace": "UX:S2.data_needs[resend cooldown timer] (NEW:F1.step2)" },
      { "name": "ban_status", "type": "boolean", "nullable": false, "constraint": "DEFAULT false", "trace": "TRD:entities[Identity Account].key_attributes[ban status]" },
      { "name": "deleted_at", "type": "timestamptz", "nullable": true, "constraint": "", "trace": "[ASSUMPTION] soft-delete default" },
      { "name": "created_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" },
      { "name": "updated_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" }
    ], "relations": [ { "to": "pseudonymous_profile", "kind": "1:1", "via": "pseudonymous_profile.identity_account_id" } ] },

    { "name": "pseudonymous_profile", "purpose": "Persistent, user-facing identity — the only identity other users ever see.", "fields": [
      { "name": "id", "type": "uuid", "nullable": false, "constraint": "PRIMARY KEY", "trace": "HOUSE" },
      { "name": "identity_account_id", "type": "uuid", "nullable": false, "constraint": "UNIQUE, FK identity_account(id)", "trace": "TRD:entities[Pseudonymous Profile].relationships[1-1 Identity Account (hidden link)]" },
      { "name": "pseudonym", "type": "text", "nullable": false, "constraint": "UNIQUE", "trace": "TRD:entities[Pseudonymous Profile].key_attributes[persistent pseudonym/handle]; UX:S4.data_needs[assigned pseudonym/handle]; UX:S11.data_needs[persistent pseudonym/handle]; UX:S5.data_needs[author pseudonym + year badge]; UX:S7.data_needs[author/answerer pseudonym + year badge]" },
      { "name": "year_badge", "type": "text", "nullable": false, "constraint": "", "trace": "TRD:entities[Pseudonymous Profile].key_attributes[verified-year badge]; UX:S4.data_needs[derived year badge]; UX:S11.data_needs[verified-year badge]; UX:S5.data_needs[author pseudonym + year badge]; UX:S7.data_needs[author/answerer pseudonym + year badge]; UX:S9.data_needs[batch/cohort filter]" },
      { "name": "reputation_score", "type": "integer", "nullable": false, "constraint": "DEFAULT 0 (cached aggregate)", "trace": "TRD:entities[Pseudonymous Profile].key_attributes[reputation score]; UX:S11.data_needs[reputation score]; UX:S7.data_needs[updated reputation score]" },
      { "name": "status", "type": "profile_status_enum", "nullable": false, "constraint": "DEFAULT 'active'", "trace": "TRD:entities[Pseudonymous Profile].key_attributes[status]; UX:S11.data_needs[account status]" },
      { "name": "deleted_at", "type": "timestamptz", "nullable": true, "constraint": "", "trace": "[ASSUMPTION] soft-delete default" },
      { "name": "created_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" },
      { "name": "updated_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" }
    ], "relations": [ { "to": "question", "kind": "1:N", "via": "question.author_profile_id" }, { "to": "answer", "kind": "1:N", "via": "answer.author_profile_id" }, { "to": "reputation_event", "kind": "1:N", "via": "reputation_event.subject_profile_id" }, { "to": "sync_queue_item", "kind": "1:N", "via": "sync_queue_item.owner_profile_id" } ] },

    { "name": "question", "purpose": "Asked question — write-eligible, offline-queueable, moderation-gated content unit.", "fields": [
      { "name": "id", "type": "uuid", "nullable": false, "constraint": "PRIMARY KEY", "trace": "TRD:write_model[offline_write_queue]" },
      { "name": "author_profile_id", "type": "uuid", "nullable": false, "constraint": "FK pseudonymous_profile(id)", "trace": "TRD:entities[Question].relationships[n-1 Pseudonymous Profile (author)]; UX:S6.data_needs[author (pseudonym auth context)]; UX:S11.data_needs[own questions/answers list]" },
      { "name": "topic_tag_id", "type": "uuid", "nullable": false, "constraint": "FK topic_tag(id)", "trace": "TRD:entities[Question].key_attributes[topic tag]; UX:S6.data_needs[topic tag]; UX:S5.data_needs[topic tag]; UX:S7.data_needs[question title/body, topic tag, moderation status, published-at]; UX:S9.data_needs[topic filter]; UX:S10.data_needs[topic-filtered questions]" },
      { "name": "title", "type": "text", "nullable": false, "constraint": "", "trace": "TRD:entities[Question].key_attributes[title/body text]; UX:S6.data_needs[title/body text]; UX:S5.data_needs[question title/body (preview)]; UX:S7.data_needs[question title/body, topic tag, moderation status, published-at]; UX:S9.data_needs[matching questions/answers]" },
      { "name": "body", "type": "text", "nullable": false, "constraint": "", "trace": "TRD:entities[Question].key_attributes[title/body text]; UX:S6.data_needs[title/body text]; UX:S5.data_needs[question title/body (preview)]; UX:S7.data_needs[question title/body, topic tag, moderation status, published-at]; UX:S9.data_needs[matching questions/answers]" },
      { "name": "moderation_status", "type": "moderation_status_enum", "nullable": false, "constraint": "DEFAULT 'pending'", "trace": "TRD:entities[Question].key_attributes[moderation status]; API:apis[A3].outputs[moderation status]; UX:S5.data_needs[moderation status]; UX:S6.data_needs[returned moderation status]; UX:S7.data_needs[question title/body, topic tag, moderation status, published-at]; UX:S12.data_needs[moderation status of resolved item]; UX:S17.data_needs[updated content moderation status]" },
      { "name": "published_at", "type": "timestamptz", "nullable": true, "constraint": "", "trace": "TRD:entities[Question].key_attributes[published-at]; UX:S5.data_needs[published-at]; UX:S7.data_needs[question title/body, topic tag, moderation status, published-at]" },
      { "name": "answer_count", "type": "integer", "nullable": false, "constraint": "DEFAULT 0 (cached)", "trace": "UX:S5.data_needs[answer count (denormalized)] (NEW:F3.step5)" },
      { "name": "idempotency_key", "type": "uuid", "nullable": false, "constraint": "UNIQUE", "trace": "API:apis[A3].inputs[client-generated local ID + idempotency key]; UX:S6.data_needs[client-generated local ID + idempotency key]" },
      { "name": "search_vector", "type": "tsvector", "nullable": false, "constraint": "GENERATED ALWAYS AS (...) STORED", "trace": "TRD:stack.store[Postgres full-text search covers R4]; UX:S9.data_needs[keyword query]; UX:S9.data_needs[matching questions/answers]; UX:S9.data_needs[no-matches empty-state payload]; UX:S10.data_needs[topic-filtered questions]" },
      { "name": "deleted_at", "type": "timestamptz", "nullable": true, "constraint": "", "trace": "TRD:write_model[offline_write_queue] tombstone" },
      { "name": "created_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" },
      { "name": "updated_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE; also LWW conflict column (TRD:write_model[offline_write_queue])" }
    ], "relations": [ { "to": "answer", "kind": "1:N", "via": "answer.question_id" }, { "to": "moderation_case", "kind": "1:N", "via": "moderation_case.question_id" }, { "to": "grievance_report", "kind": "1:N", "via": "grievance_report.question_id" } ] },

    { "name": "answer", "purpose": "Threaded answer to a question — same write-eligible/offline/moderation shape as question.", "fields": [
      { "name": "id", "type": "uuid", "nullable": false, "constraint": "PRIMARY KEY", "trace": "TRD:write_model[offline_write_queue]" },
      { "name": "question_id", "type": "uuid", "nullable": false, "constraint": "FK question(id)", "trace": "TRD:entities[Answer].relationships[Answer n-1 Question]; UX:S8.data_needs[parent question reference]" },
      { "name": "author_profile_id", "type": "uuid", "nullable": false, "constraint": "FK pseudonymous_profile(id)", "trace": "TRD:entities[Answer].relationships[Answer n-1 Pseudonymous Profile (author)]; UX:S8.data_needs[author (pseudonym auth context)]; UX:S11.data_needs[own questions/answers list]" },
      { "name": "body", "type": "text", "nullable": false, "constraint": "", "trace": "TRD:entities[Answer].key_attributes[body text]; UX:S8.data_needs[body text]; UX:S7.data_needs[answers: body text, moderation status, accepted flag]" },
      { "name": "moderation_status", "type": "moderation_status_enum", "nullable": false, "constraint": "DEFAULT 'pending'", "trace": "TRD:entities[Answer].key_attributes[moderation status]; API:apis[A4].outputs[answer resource with moderation status]; UX:S7.data_needs[answers: body text, moderation status, accepted flag]; UX:S8.data_needs[returned moderation status]; UX:S12.data_needs[moderation status of resolved item]; UX:S17.data_needs[updated content moderation status]" },
      { "name": "accepted", "type": "boolean", "nullable": false, "constraint": "DEFAULT false", "trace": "TRD:entities[Answer].key_attributes[accepted flag]; UX:S7.data_needs[answers: body text, moderation status, accepted flag]" },
      { "name": "vote_count", "type": "integer", "nullable": false, "constraint": "DEFAULT 0 (cached)", "trace": "UX:S7.data_needs[vote count / accepted-answer marker (denormalized)] (NEW:F5.step2)" },
      { "name": "idempotency_key", "type": "uuid", "nullable": false, "constraint": "UNIQUE", "trace": "API:apis[A4].inputs[client-generated local ID + idempotency key]; UX:S8.data_needs[client-generated local ID + idempotency key]" },
      { "name": "search_vector", "type": "tsvector", "nullable": false, "constraint": "GENERATED ALWAYS AS (...) STORED", "trace": "TRD:stack.store[Postgres full-text search covers R4]; UX:S9.data_needs[matching questions/answers]" },
      { "name": "deleted_at", "type": "timestamptz", "nullable": true, "constraint": "", "trace": "TRD:write_model[offline_write_queue] tombstone" },
      { "name": "created_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" },
      { "name": "updated_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE; LWW conflict column" }
    ], "relations": [ { "to": "question", "kind": "N:1", "via": "answer.question_id" }, { "to": "moderation_case", "kind": "1:N", "via": "moderation_case.answer_id" }, { "to": "reputation_event", "kind": "1:N", "via": "reputation_event.answer_id" } ] },

    { "name": "reputation_event", "purpose": "Append-only server-authoritative reputation ledger; never LWW-resolved.", "fields": [
      { "name": "id", "type": "uuid", "nullable": false, "constraint": "PRIMARY KEY", "trace": "HOUSE" },
      { "name": "event_type", "type": "reputation_event_type_enum", "nullable": false, "constraint": "", "trace": "TRD:entities[Reputation Event].key_attributes[event type]; UX:S7.data_needs[vote/accept action]; UX:S7.data_needs[vote-error messages] (resolved via trg_prevent_self_vote + uniq_reputation_event_actor_answer_upvote, §4/§5)" },
      { "name": "delta", "type": "integer", "nullable": false, "constraint": "", "trace": "TRD:entities[Reputation Event].key_attributes[delta]; UX:S7.data_needs[vote/accept action]" },
      { "name": "actor_profile_id", "type": "uuid", "nullable": true, "constraint": "FK pseudonymous_profile(id)", "trace": "TRD:entities[Reputation Event].key_attributes[actor reference]; API:apis[A6].inputs[actor]; UX:S7.data_needs[vote/accept action]" },
      { "name": "subject_profile_id", "type": "uuid", "nullable": false, "constraint": "FK pseudonymous_profile(id)", "trace": "TRD:entities[Reputation Event].relationships[n-1 Pseudonymous Profile]" },
      { "name": "question_id", "type": "uuid", "nullable": true, "constraint": "FK question(id); CHECK exactly one of question_id/answer_id", "trace": "TRD:entities[Reputation Event].relationships[n-1 content item]" },
      { "name": "answer_id", "type": "uuid", "nullable": true, "constraint": "FK answer(id)", "trace": "TRD:entities[Reputation Event].relationships[n-1 content item]" },
      { "name": "created_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "TRD:entities[Reputation Event].key_attributes[created-at]" },
      { "name": "updated_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE (append-only; never updated)" }
    ], "relations": [ { "to": "pseudonymous_profile", "kind": "N:1", "via": "reputation_event.subject_profile_id" } ] },

    { "name": "moderation_case", "purpose": "One record per moderation-triggering submission event for a Question/Answer — the R6 audit gate.", "fields": [
      { "name": "id", "type": "uuid", "nullable": false, "constraint": "PRIMARY KEY", "trace": "HOUSE" },
      { "name": "question_id", "type": "uuid", "nullable": true, "constraint": "FK question(id); CHECK exactly one of question_id/answer_id", "trace": "TRD:entities[Moderation Case].key_attributes[content reference]; UX:S16.data_needs[content reference]" },
      { "name": "answer_id", "type": "uuid", "nullable": true, "constraint": "FK answer(id)", "trace": "TRD:entities[Moderation Case].key_attributes[content reference]; UX:S16.data_needs[content reference]" },
      { "name": "ai_classification_label", "type": "text", "nullable": true, "constraint": "", "trace": "API:apis[A7].outputs[classification]" },
      { "name": "risk_tier", "type": "ai_risk_tier_enum", "nullable": true, "constraint": "", "trace": "TRD:entities[Moderation Case].key_attributes[risk tier]; UX:S16.data_needs[AI classification result, risk tier]" },
      { "name": "risk_score", "type": "numeric", "nullable": true, "constraint": "", "trace": "API:apis[A7].outputs[risk score]" },
      { "name": "decision", "type": "moderation_status_enum", "nullable": false, "constraint": "DEFAULT 'pending'", "trace": "TRD:entities[Moderation Case].key_attributes[decision]; UX:S16.data_needs[decision action (publish/block)] (NEW:F10.step1)" },
      { "name": "decided_by", "type": "moderation_decided_by_enum", "nullable": true, "constraint": "", "trace": "TRD:entities[Moderation Case].key_attributes[decided-by]; UX:S16.data_needs[decision, decided-by, decided-at]" },
      { "name": "decided_at", "type": "timestamptz", "nullable": true, "constraint": "", "trace": "TRD:entities[Moderation Case].key_attributes[decided-at]" },
      { "name": "external_provider_case_ref", "type": "text", "nullable": true, "constraint": "", "trace": "TRD:entities[Moderation Case].key_attributes[external-provider case reference]; UX:S16.data_needs[external-provider case reference]" },
      { "name": "provider_raw_response", "type": "jsonb", "nullable": true, "constraint": "", "trace": "TRD:stack.store[JSONB for raw moderation-provider responses]" },
      { "name": "created_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" },
      { "name": "updated_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" }
    ], "relations": [ { "to": "ban_record", "kind": "1:1", "via": "ban_record.originating_moderation_case_id" }, { "to": "grievance_report", "kind": "1:N", "via": "grievance_report.moderation_case_id" } ] },

    { "name": "ban_record", "purpose": "Permanent email-hash-keyed ban ledger, decoupled from identity_account/pseudonymous_profile so it survives deletion.", "fields": [
      { "name": "id", "type": "uuid", "nullable": false, "constraint": "PRIMARY KEY", "trace": "HOUSE" },
      { "name": "email_hash", "type": "text", "nullable": false, "constraint": "UNIQUE", "trace": "TRD:entities[Ban Record].key_attributes[email identifier (one-way hashed for matching)]; UX:S4.data_needs[refused-state copy] (a match on this column at registration is the resolving mechanism for the refused-state copy shown on S4)" },
      { "name": "ban_reason", "type": "text", "nullable": false, "constraint": "", "trace": "TRD:entities[Ban Record].key_attributes[ban reason]" },
      { "name": "issued_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "TRD:entities[Ban Record].key_attributes[issued-at]" },
      { "name": "originating_moderation_case_id", "type": "uuid", "nullable": true, "constraint": "FK moderation_case(id)", "trace": "TRD:entities[Ban Record].key_attributes[originating moderation case reference]" },
      { "name": "created_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" },
      { "name": "updated_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" }
    ], "relations": [] },

    { "name": "grievance_report", "purpose": "IT Act grievance/takedown ticket, SLA-timestamped and auditable (R7).", "fields": [
      { "name": "id", "type": "uuid", "nullable": false, "constraint": "PRIMARY KEY", "trace": "TRD:write_model[offline_write_queue]; UX:S13.data_needs[grievance ticket ID]" },
      { "name": "question_id", "type": "uuid", "nullable": true, "constraint": "FK question(id); CHECK exactly one of question_id/answer_id", "trace": "TRD:entities[Grievance Report].key_attributes[reported content reference]; UX:S13.data_needs[reported content reference]; UX:S14.data_needs[reported content reference]; UX:S7.data_needs[report entry point]" },
      { "name": "answer_id", "type": "uuid", "nullable": true, "constraint": "FK answer(id)", "trace": "TRD:entities[Grievance Report].key_attributes[reported content reference]; UX:S13.data_needs[reported content reference]; UX:S14.data_needs[reported content reference]; UX:S7.data_needs[report entry point]" },
      { "name": "reason", "type": "text", "nullable": false, "constraint": "", "trace": "TRD:entities[Grievance Report].key_attributes[reason]; UX:S13.data_needs[reason]" },
      { "name": "reporter_profile_id", "type": "uuid", "nullable": true, "constraint": "FK pseudonymous_profile(id)", "trace": "TRD:entities[Grievance Report].key_attributes[reporter reference]; UX:S13.data_needs[reporter (pseudonym or anonymous flag)]" },
      { "name": "is_anonymous", "type": "boolean", "nullable": false, "constraint": "DEFAULT false", "trace": "API:apis[A8].inputs[reporter (pseudonym or anonymous flag)]; UX:S13.data_needs[reporter (pseudonym or anonymous flag)]" },
      { "name": "status", "type": "grievance_status_enum", "nullable": false, "constraint": "DEFAULT 'open'", "trace": "TRD:entities[Grievance Report].key_attributes[status]; UX:S14.data_needs[status]; UX:S17.data_needs[updated grievance status]" },
      { "name": "sla_deadline", "type": "timestamptz", "nullable": false, "constraint": "", "trace": "TRD:entities[Grievance Report].key_attributes[SLA deadline]; UX:S14.data_needs[SLA deadline]" },
      { "name": "acknowledged_at", "type": "timestamptz", "nullable": true, "constraint": "", "trace": "API:apis[A8].outputs[SLA-bound acknowledgement timestamp]; UX:S13.data_needs[SLA-bound acknowledgement timestamp]" },
      { "name": "resolution_action", "type": "grievance_resolution_enum", "nullable": true, "constraint": "", "trace": "TRD:entities[Grievance Report].key_attributes[resolution action]; API:apis[A9].inputs[action]; UX:S14.data_needs[resolution action]; UX:S17.data_needs[operator/human decision]; UX:S17.data_needs[action (takedown/dismiss/escalate-further)]" },
      { "name": "resolution_notes", "type": "text", "nullable": true, "constraint": "", "trace": "API:apis[A9].inputs[notes]; UX:S17.data_needs[notes]" },
      { "name": "resolved_at", "type": "timestamptz", "nullable": true, "constraint": "", "trace": "TRD:entities[Grievance Report].key_attributes[resolved-at]; UX:S14.data_needs[resolved-at]" },
      { "name": "sla_breached", "type": "boolean", "nullable": false, "constraint": "GENERATED ALWAYS AS (...) STORED", "trace": "API:apis[A9].errors[resolution past the SLA deadline]; UX:S14.data_needs[SLA-breach flag]" },
      { "name": "merged_into_report_id", "type": "uuid", "nullable": true, "constraint": "FK grievance_report(id)", "trace": "API:apis[A8].errors[duplicate report merged into existing ticket]" },
      { "name": "moderation_case_id", "type": "uuid", "nullable": true, "constraint": "FK moderation_case(id)", "trace": "TRD:entities[Grievance Report].relationships[0-1 Moderation Case]" },
      { "name": "idempotency_key", "type": "uuid", "nullable": true, "constraint": "UNIQUE", "trace": "TRD:write_model[offline_write_queue]" },
      { "name": "created_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" },
      { "name": "updated_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" }
    ], "relations": [ { "to": "grievance_audit_log", "kind": "1:N", "via": "grievance_audit_log.grievance_report_id" } ] },

    { "name": "grievance_audit_log", "purpose": "Auditable trail of every action taken against a grievance_report.", "fields": [
      { "name": "id", "type": "uuid", "nullable": false, "constraint": "PRIMARY KEY", "trace": "HOUSE" },
      { "name": "grievance_report_id", "type": "uuid", "nullable": false, "constraint": "FK grievance_report(id)", "trace": "TRD:entities[Grievance Report].key_attributes[audit trail]" },
      { "name": "actor_type", "type": "text", "nullable": false, "constraint": "CHECK IN ('reporter','operator','system')", "trace": "API:apis[A9].outputs[audit-log entry]" },
      { "name": "actor_profile_id", "type": "uuid", "nullable": true, "constraint": "FK pseudonymous_profile(id)", "trace": "API:apis[A9].outputs[audit-log entry]" },
      { "name": "action", "type": "text", "nullable": false, "constraint": "", "trace": "API:apis[A9].inputs[operator/human decision]; API:apis[A9].outputs[audit-log entry]; UX:S17.data_needs[audit-log entry]" },
      { "name": "notes", "type": "text", "nullable": true, "constraint": "", "trace": "API:apis[A9].inputs[notes]" },
      { "name": "created_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" },
      { "name": "updated_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE (append-only)" }
    ], "relations": [] },

    { "name": "sync_queue_item", "purpose": "Offline-write-queue outbox with retry state (SG-5).", "fields": [
      { "name": "id", "type": "uuid", "nullable": false, "constraint": "PRIMARY KEY", "trace": "HOUSE" },
      { "name": "owner_profile_id", "type": "uuid", "nullable": false, "constraint": "FK pseudonymous_profile(id)", "trace": "TRD:entities[Sync Queue Item].relationships[n-1 Pseudonymous Profile (owner)]" },
      { "name": "client_local_id", "type": "uuid", "nullable": false, "constraint": "UNIQUE with owner_profile_id", "trace": "TRD:entities[Sync Queue Item].key_attributes[client-generated local ID]; UX:S12.data_needs[client-generated local ID]" },
      { "name": "idempotency_key", "type": "uuid", "nullable": false, "constraint": "", "trace": "API:apis[A10].inputs[client-generated local ID]" },
      { "name": "entity_type", "type": "sync_entity_type_enum", "nullable": false, "constraint": "", "trace": "TRD:entities[Sync Queue Item].key_attributes[entity type]; UX:S12.data_needs[entity type]" },
      { "name": "payload", "type": "jsonb", "nullable": false, "constraint": "", "trace": "TRD:entities[Sync Queue Item].key_attributes[payload]" },
      { "name": "client_created_at", "type": "timestamptz", "nullable": false, "constraint": "", "trace": "TRD:entities[Sync Queue Item].key_attributes[client-created-at]" },
      { "name": "sync_status", "type": "sync_status_enum", "nullable": false, "constraint": "DEFAULT 'pending'", "trace": "TRD:entities[Sync Queue Item].key_attributes[sync status]; UX:S12.data_needs[sync status]" },
      { "name": "server_assigned_id", "type": "uuid", "nullable": true, "constraint": "", "trace": "TRD:entities[Sync Queue Item].key_attributes[server-assigned ID once synced]; UX:S12.data_needs[server-assigned ID]" },
      { "name": "retry_count", "type": "integer", "nullable": false, "constraint": "DEFAULT 0", "trace": "TRD:write_model[offline_write_queue]" },
      { "name": "last_attempt_at", "type": "timestamptz", "nullable": true, "constraint": "", "trace": "TRD:write_model[offline_write_queue]" },
      { "name": "error_reason", "type": "text", "nullable": true, "constraint": "", "trace": "API:apis[A10].outputs[rejected]; UX:S12.data_needs[rejection reason]" },
      { "name": "created_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" },
      { "name": "updated_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" }
    ], "relations": [] },

    { "name": "analytics_event", "purpose": "Append-only event stream sufficient to compute R8 metrics.", "fields": [
      { "name": "id", "type": "uuid", "nullable": false, "constraint": "PRIMARY KEY", "trace": "HOUSE" },
      { "name": "event_type", "type": "text", "nullable": false, "constraint": "", "trace": "TRD:entities[Analytics Event].key_attributes[event type]; API:apis[A12].inputs[event type]" },
      { "name": "actor_profile_id", "type": "uuid", "nullable": true, "constraint": "FK pseudonymous_profile(id)", "trace": "TRD:entities[Analytics Event].key_attributes[actor/cohort reference]" },
      { "name": "occurred_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "TRD:entities[Analytics Event].key_attributes[timestamp]" },
      { "name": "metadata", "type": "jsonb", "nullable": true, "constraint": "", "trace": "API:apis[A12].inputs[metadata]" },
      { "name": "created_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" },
      { "name": "updated_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE (append-only)" }
    ], "relations": [] },

    { "name": "content_draft", "purpose": "Cross-session autosave for an in-progress question/answer.", "fields": [
      { "name": "id", "type": "uuid", "nullable": false, "constraint": "PRIMARY KEY", "trace": "UX:S6.data_needs[draft autosave text] (NEW:F3.step1)" },
      { "name": "profile_id", "type": "uuid", "nullable": false, "constraint": "FK pseudonymous_profile(id)", "trace": "UX:S6.data_needs[draft autosave text] (NEW:F3.step1)" },
      { "name": "entity_type", "type": "draft_entity_type_enum", "nullable": false, "constraint": "", "trace": "UX:S6.data_needs[draft autosave text] (NEW:F3.step1)" },
      { "name": "parent_question_id", "type": "uuid", "nullable": true, "constraint": "FK question(id); required if entity_type='answer'", "trace": "UX:S8 answer-composer draft (NEW:F3.step1 extended)" },
      { "name": "topic_tag_id", "type": "uuid", "nullable": true, "constraint": "FK topic_tag(id)", "trace": "UX:S6.data_needs[topic tag list (options)]" },
      { "name": "title", "type": "text", "nullable": true, "constraint": "", "trace": "UX:S6.data_needs[draft autosave text] (NEW:F3.step1)" },
      { "name": "body", "type": "text", "nullable": true, "constraint": "", "trace": "UX:S6.data_needs[draft autosave text] (NEW:F3.step1)" },
      { "name": "created_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" },
      { "name": "updated_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" }
    ], "relations": [] },

    { "name": "grievance_officer_contact", "purpose": "Standing, always-reachable grievance-officer contact record (R7 AC3).", "fields": [
      { "name": "id", "type": "uuid", "nullable": false, "constraint": "PRIMARY KEY", "trace": "UX:S15.data_needs[grievance-officer contact details] (NEW:F7.step5); UX:S4.data_needs[link to grievance contact] (NEW:F1.step4c)" },
      { "name": "officer_name", "type": "text", "nullable": false, "constraint": "", "trace": "UX:S15.data_needs[grievance-officer contact details] (NEW:F7.step5); UX:S4.data_needs[link to grievance contact] (NEW:F1.step4c)" },
      { "name": "contact_email", "type": "text", "nullable": false, "constraint": "", "trace": "UX:S15.data_needs[grievance-officer contact details] (NEW:F7.step5)" },
      { "name": "contact_phone", "type": "text", "nullable": true, "constraint": "", "trace": "UX:S15.data_needs[grievance-officer contact details] (NEW:F7.step5)" },
      { "name": "process_summary", "type": "text", "nullable": true, "constraint": "", "trace": "UX:S15.data_needs[grievance process summary text] ([ASSUMPTION] copy placeholder)" },
      { "name": "effective_from", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "UX:S15.data_needs[grievance-officer contact details] (NEW:F7.step5)" },
      { "name": "created_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" },
      { "name": "updated_at", "type": "timestamptz", "nullable": false, "constraint": "DEFAULT now()", "trace": "HOUSE" }
    ], "relations": [] }
  ],
  "indexes": [
    { "table": "question", "fields": ["moderation_status", "published_at"], "serves": "UX:S5" },
    { "table": "question", "fields": ["topic_tag_id"], "serves": "UX:S10" },
    { "table": "question", "fields": ["author_profile_id"], "serves": "UX:S11" },
    { "table": "question", "fields": ["search_vector"], "serves": "UX:S9" },
    { "table": "answer", "fields": ["question_id"], "serves": "UX:S7" },
    { "table": "answer", "fields": ["author_profile_id"], "serves": "UX:S11" },
    { "table": "answer", "fields": ["search_vector"], "serves": "UX:S9" },
    { "table": "reputation_event", "fields": ["subject_profile_id"], "serves": "UX:S11" },
    { "table": "reputation_event", "fields": ["actor_profile_id", "answer_id"], "serves": "API:apis[A6].errors[duplicate vote]" },
    { "table": "moderation_case", "fields": ["question_id", "answer_id"], "serves": "UX:S7, UX:S12" },
    { "table": "moderation_case", "fields": ["risk_tier"], "serves": "UX:S16" },
    { "table": "grievance_report", "fields": ["status"], "serves": "UX:S17" },
    { "table": "grievance_report", "fields": ["reporter_profile_id"], "serves": "UX:S14" },
    { "table": "grievance_report", "fields": ["sla_deadline"], "serves": "TRD:nfrs[grievance SLA]" },
    { "table": "grievance_audit_log", "fields": ["grievance_report_id"], "serves": "UX:S17" },
    { "table": "sync_queue_item", "fields": ["owner_profile_id", "sync_status"], "serves": "UX:S12" },
    { "table": "analytics_event", "fields": ["event_type", "occurred_at"], "serves": "TRD:nfrs[event instrumentation completeness]" },
    { "table": "content_draft", "fields": ["profile_id", "entity_type"], "serves": "UX:S6, UX:S8" }
  ],
  "pii_fields": [
    "identity_account.email_hash",
    "identity_account.email_encrypted",
    "identity_account.verification_token_hash",
    "ban_record.email_hash",
    "pseudonymous_profile.identity_account_id"
  ],
  "assumptions": [
    "identity_account.email_encrypted is an [ASSUMPTION] application-layer-encrypted transient store of the raw email, nulled once verification_status='verified', added because resend (S2) and manual-fallback review need the raw address operationally while R1 requires it never be displayed via any API — not a TRD-named field, but a schema-stage design decision resolving that tension.",
    "Soft delete (deleted_at) is the [ASSUMPTION] house default on identity_account, pseudonymous_profile, question, answer, absent a PRD-stated retention duration; ban_record, grievance_report, grievance_audit_log, reputation_event, analytics_event, moderation_case are deliberately never deleted by requirement, not by default.",
    "A single-value campus-domain allowlist is application config, not a database table, since TRD/PRD scope v1 to one campus only; modeling it as a table now would be speculative multi-tenant architecture.",
    "moderation_case's TRD-stated '1-1 per submission' relationship is read as N:1 from moderation_case to its content item (many submission/re-moderation events per item over its lifecycle), the literal reading of 'per submission' given offline sync-time re-entry and possible future edit-triggered re-moderation.",
    "email_hash normalization (lowercase, strip plus-aliasing, keyed HMAC with a server-held secret) is an application-layer contract shared by identity_account and ban_record, not itself expressible as a DDL constraint.",
    "reputation_score, question.answer_count, and answer.vote_count are cached aggregates; their maintenance mechanism (synchronous update vs async job) is left to the build stage."
  ],
  "escalations": [
    "OQ-1 (non-blocking per human decision 2026-07-18, human-owned, scoped to P2-B only): the mentor/support feature safety/escalation protocol remains undecided; does not gate this schema stage since no table here serves P2-B, but must be resolved before P2-B is ever built.",
    "HMAC pepper/secret management and rotation policy for email_hash computation is unspecified; rotating the secret would silently break existing ban_record/identity_account hash matches unless a migration/dual-hash strategy is planned before launch.",
    "No distinct API contract exists (UX OQ-11) for an operator resolving an AI-escalated moderation_case outside the report-scoped A9 flow; the schema fields (decision/decided_by/decided_at) exist and are ready, but the endpoint that writes them for a non-report-originated escalation remains an upstream API-completeness gap."
  ],
  "open_questions": [
    { "question": "What safety/escalation protocol will exist before the deferred mentor/support feature (P2-B) is ever built? Scoped to P2-B only; does not gate this schema stage. Marked non-blocking by human decision (gurkanwaldeep, 2026-07-18): P2-B is deferred and no v1 table depends on it; must still be resolved before P2-B is built.", "owner": "human", "blocking": false },
    { "question": "Detailed moderation/legal-liability spec is substantially answered upstream; residual legal review of the specific IT Rules 2021 SLA figures encoded in grievance_report.sla_deadline's computation, and who staffs grievance handling day-to-day.", "owner": "engineering / legal", "blocking": false },
    { "question": "Roughly size the AI-moderation inference cost per active user in absolute rupee terms.", "owner": "engineering", "blocking": false },
    { "question": "Independently verify the Incog toxicity/founder-suspension claim.", "owner": "human", "blocking": false },
    { "question": "DPDP Act 2023 consent-flow copy and exact retention-period duration remain undecided; this schema enforces minimization mechanically but does not set a retention clock.", "owner": "engineering / legal", "blocking": false },
    { "question": "Run revenue experiment #2 only after the retention experiment succeeds.", "owner": "user", "blocking": false },
    { "question": "Is there credible evidence a college administrator would pay for a B2B2C product?", "owner": "user", "blocking": false },
    { "question": "Replicate the 10-junior validation test at larger scale if resourcing allows.", "owner": "user", "blocking": false },
    { "question": "Set concrete numeric targets for campus penetration %, WAU %, D30 %, and answer-liquidity window.", "owner": "user", "blocking": false },
    { "question": "If AI-moderation escalation volume outpaces the single founder's human-review capacity, what operational/staffing plan addresses it?", "owner": "human", "blocking": false },
    { "question": "No distinct API contract exists for an operator resolving an AI-escalated moderation_case outside the report-scoped A9 flow; schema fields exist but the writing endpoint is unresolved.", "owner": "engineering", "blocking": false },
    { "question": "A student refused registration on a ban_record match has no defined dispute/appeal path; no dispute table exists in this schema pending that design.", "owner": "engineering / human", "blocking": false },
    { "question": "Whether grievance_report.sla_breached is exposed to the original reporter via a future API, or kept operator-internal only, is undecided.", "owner": "engineering / legal", "blocking": false },
    { "question": "Repeat-session/login mechanism after initial verification is unspecified by any TRD API; no session/auth_token table is included pending that decision.", "owner": "engineering", "blocking": false },
    { "question": "Whether an anonymous reporter receives any acknowledgement/status visibility is unclear; the schema supports anonymous reports structurally but provides no retrieval key for later status checks.", "owner": "engineering", "blocking": false },
    { "question": "HMAC pepper/secret management and rotation policy for email_hash computation is unspecified.", "owner": "engineering", "blocking": false },
    { "question": "Cached-aggregate maintenance mechanism (reputation_score, answer_count, vote_count) is left to the build stage.", "owner": "engineering", "blocking": false },
    { "question": "Self-vote/duplicate-vote enforcement is implemented at the schema level (trigger + partial unique index); confirm no double-enforcement conflict with planned app-layer validation at build time.", "owner": "engineering", "blocking": false }
  ],
  "handoff": "ui"
}
```
