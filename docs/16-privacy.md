# 16 — Privacy / Data-Protection Posture (DPDP)

**Stage:** 16 (privacy-agent, DECISION QK-7 — runs before stage 15 in execution order)
**Document type:** incremental. Each Layer-2 run appends a dated section
(`quality-kit-additions/cadence.md` §5.1); the JSON handoff block is finalized at **T76 (M6)**.
This first run already carries a schema-valid handoff so the stage-16 shape is registered early.

---

## Phase 0 gate — record of disposition

| # | Precondition | Disposition |
|---|---|---|
| 1 | `docs/07-plan.md` exists and its JSON handoff validates against the plan schema | **PASS** — executed: `jsonschema.validate(plan_handoff, .claude/schemas/handoff-plan.json)` → `PLAN VALIDATES` |
| 2 | `docs/05-schema.md` handoff readable | **PASS** — parsed; `tables[]` = 14 names, `pii_fields[]` = 5 entries |
| 3 | Codebase exists at the path named in the plan handoff | **PASS** — `server/src` (36 TS files), `client/src`, `server/migrations` (001, 002, 006 up/down) |
| 4 | Skill `privacy-audit` readable | **PASS** — `.claude/skills/privacy-audit/SKILL.md`, 8-step Method |
| 5 | Waivers | **None** — `.pipeline/waivers/*.json` → no files found. No waiver is cited or self-granted. |

---

## Run 1 — 2026-07-30 · M1 milestone gate · **WARN-ONLY** (first run, DECISION QK-7)

**Task:** T61 (`docs/07-plan.md` §4). **Mode:** warn-only per `cadence.md` §2 (M1 row) and the
§3 promotion mechanic — findings do **not** block M1 exit; they become the M2-entry fix list.
The exception in §3 still applies: a **critical** finding would escalate immediately regardless
of mode. **This run produced no critical findings.**

**Scope (deliberately narrower than the full audit, which is T70 at M5):**
1. PII inventory over migration 001 (`identity_account`, `pseudonymous_profile`), extended to
   every table the schema handoff names so no table is skipped.
2. Leakage baseline across three channels — API responses (A1/A2, session, content), logs
   (`shared/logger.ts` + every `logger.*` call), analytics (`analytics_event.metadata`).
3. Record — do not resolve — the RR-10 items owned by T43.

### Method limitation, stated plainly

**This run is static analysis plus locally-executed probes. No database was read or written.**

`DATABASE_URL` points at a live Supabase instance holding **real user data**, and it is
unreachable from this network:

```
DATABASE_URL host (credentials withheld): db.yinckproedjodpbvzdhb.supabase.co
IPv4 lookup: ENOTFOUND
IPv6 lookup: ENOENT
```
*(executed: `node -e` DNS-only probe, no connection attempted, no credentials printed)*

Consequently `tests/integration/*` and `tests/nfr/*` were **not** run — they TRUNCATE, and the
guard in `tests/helpers/test-db.ts` was not bypassed. Only the safe commands were used:

- `npx vitest run tests/unit` → **4 files, 35/35 passed** (this is also the log-capture source below)
- Two standalone `node -e` probes (pino redaction, DNS) that touch no database

Anything requiring live data — actual retention deletion, an actual erasure run, inspection of
stored `analytics_event.metadata` rows — is **deferred to T70 (M5)**, which the plan already
scopes as "retention enforcement executed (not just read)".

---

### 1. PII inventory

Classification vocabulary per the `privacy-audit` skill: `direct-pii`, `pseudonymous-keyed`
(keyed HMAC / internal linkage, pepper server-held), `content-pii-possible` (free-text UGC),
`non-pii`.

**Provenance for every classification:** the frozen DDL in `docs/05-schema.md` §3–§4, the
applied migrations in `server/migrations/`, and `schema:pii_fields` (5 flagged fields, all of
which appear below).

#### 1.1 The two representations of the same identifier

`identity_account.email_encrypted` and `identity_account.email_hash` are **two representations of
one identifier** and must be read as a pair:

| | `email_encrypted` | `email_hash` |
|---|---|---|
| Form | AES-256-GCM, application layer; layout `[12B IV][16B tag][ciphertext]` | Versioned keyed HMAC-SHA256, `v<n>$<hexdigest>` |
| Where | `server/src/shared/email-encryption.ts:24-32` | `server/src/shared/email-identity.ts:103-106` |
| Key/pepper | `EMAIL_ENCRYPTION_KEY` (32-byte base64) | `EMAIL_HASH_PEPPER_ACTIVE`, versioned for rotation (RR-13) |
| Reversible | **Yes**, with the key → `direct-pii` | No → `pseudonymous-keyed` |
| Lifecycle | Nulled at `verification_status = 'verified'` (`identity.repo.ts:94`) | Permanent; the join key for duplicate + ban checks |
| Verified | Code **matches** the documented stance in schema §6 | Single hashing path confirmed — `email-identity.ts` is the only HMAC site (RR-7) |

The pepper is server-held and versioned; `candidateHashes()` (`email-identity.ts:121-124`) tries
active + retired peppers so rotation does not silently break matches. **This agent does not judge
whether keyed-HMAC pseudonymization is a legally sufficient safeguard — that is T43's call.**

#### 1.2 Implemented tables (migrations 001, 002, 006) — every column

**`identity_account`** (`server/migrations/001_identity.up.sql:21-39`)

| Column | Class | Purpose | Retention | Deletion mechanism | Legal basis |
|---|---|---|---|---|---|
| `id` | pseudonymous-keyed | internal identity PK; the re-identification anchor `pseudonymous_profile.identity_account_id` points at | MISSING (T43) | MISSING | MISSING |
| `email_hash` | pseudonymous-keyed | duplicate-registration check (A1), ban match (A11) | MISSING (T43) | MISSING | MISSING |
| `email_encrypted` | **direct-pii** | transient: resend delivery (S2) + manual-fallback review | MISSING (T43) — schema §6 says "transiently", no duration | **partial**: `SET email_encrypted = NULL` on the verified path only (`identity.repo.ts:94`); no mechanism for `pending`/`blocked_unparseable_year` rows | MISSING |
| `verification_status` | non-pii | state machine | n/a | n/a | n/a |
| `derived_enrollment_year` | non-pii *(quasi-identifier — see note)* | year badge derivation | n/a | n/a | n/a |
| `verification_token_hash` | pseudonymous-keyed *(credential digest, not identity material)* | OTP verification | MISSING (T43) | nulled at verified/blocked (`identity.repo.ts:92,105`) | MISSING |
| `verification_token_expires_at` | non-pii | token TTL | n/a | n/a | n/a |
| `verification_attempt_count` | non-pii | rate limiting | n/a | n/a | n/a |
| `last_verification_sent_at` | non-pii | resend cooldown | n/a | n/a | n/a |
| `ban_status` | non-pii | ban flag (see PRV-2) | n/a | n/a | n/a |
| `deleted_at` | non-pii | soft-delete tombstone — **read by `identity.repo.ts:30`, written by nothing** | n/a | n/a | n/a |
| `created_at` / `updated_at` | non-pii | audit timestamps | n/a | n/a | n/a |

*Note on `derived_enrollment_year`:* classified `non-pii` **because `schema:pii_fields` does not
list it** — this agent verifies the upstream decision rather than re-making it. It is nonetheless
a quasi-identifier (year + single campus + pseudonym), and it is deliberately public as the year
badge (R1). Recorded here for T70, not raised as a finding.

**`pseudonymous_profile`** (`001_identity.up.sql:42-52`)

| Column | Class | Purpose | Retention | Deletion mechanism | Legal basis |
|---|---|---|---|---|---|
| `id` | pseudonymous-keyed | public actor key; FK target of all content | MISSING (T43) | MISSING | MISSING |
| `identity_account_id` | pseudonymous-keyed | **the single re-identification linkage** (`schema:pii_fields[4]`) | MISSING (T43) | MISSING | MISSING |
| `pseudonym` | pseudonymous-keyed | the only identity others see | MISSING (T43) | MISSING | MISSING |
| `year_badge` | non-pii | public seniority signal (R1) | n/a | n/a | n/a |
| `reputation_score` | non-pii | cached aggregate | n/a | n/a | n/a |
| `status` | non-pii | active/suspended/banned; live revocation authority | n/a | n/a | n/a |
| `deleted_at` | non-pii | tombstone — read by `profile.repo.ts:33`, **written by nothing** | n/a | n/a | n/a |
| `created_at` / `updated_at` | non-pii | audit timestamps | n/a | n/a | n/a |

**Verified:** `identity_account_id` is never selected back out — `profile.repo.ts:31` and
`:56` both project public columns only, and `content.repo.ts:49-54`'s single shared
`AUTHOR_SELECT` builds `{pseudonym, year_badge, reputation_score}` and nothing else.

**`question` / `answer`** (`002_content.up.sql:32-68`) — identical shape:
`author_profile_id` → pseudonymous-keyed (retention/deletion/legal basis MISSING);
`title`, `body`, and the GENERATED `search_vector` → **content-pii-possible** (a student can type
anything, including their own or a third party's identity, into free text); everything else
(`id`, `topic_tag_id`, `question_id`, `moderation_status`, `published_at`, `answer_count`,
`accepted`, `vote_count`, `idempotency_key`, `deleted_at`, `created_at`, `updated_at`) → non-pii.
Note `search_vector` is a **derived copy** of the UGC — it is `GENERATED ALWAYS ... STORED`, so it
tracks the source automatically; no separate erasure step is needed for it.

**`topic_tag`** (`002:20-27`) — all six columns non-pii (fixed seeded reference data).

**`moderation_case`** (`002:74-90`) — non-pii except **`provider_raw_response jsonb`**
(content-pii-possible: the raw third-party payload, which in practice echoes the classified text
back). Schema §6 declares this table **"never deleted, ever"**. No provider is bound today
(`config.moderationProvider` defaults to `""` → hold-all), so no such rows exist yet — but this is
a second, uncontrolled copy of UGC inside a never-deleted table the moment T14b binds one → **PRV-14**.

**`analytics_event`** (`006_analytics.up.sql:6-14`) — `actor_profile_id` → pseudonymous-keyed;
**`metadata jsonb` → content-pii-possible** (see PRV-7: the ingest route accepts arbitrary
caller-supplied JSON); the rest non-pii. Schema §6: append-only ledger, **never deleted**.

#### 1.3 Tables in the schema handoff not yet migrated — inventoried, deferred to T70

No table is skipped. Migrations 003/004/005 do not exist, so these are inventoried from the frozen
DDL (`docs/05-schema.md` §4) at PII-column level; full column-level treatment lands at T70.

| Table | Non-`non-pii` columns | Class |
|---|---|---|
| `reputation_event` | `actor_profile_id`, `subject_profile_id` | pseudonymous-keyed |
| `ban_record` | `email_hash` | pseudonymous-keyed |
| | `ban_reason` | content-pii-possible (operator free text) |
| `grievance_report` | `reporter_profile_id` | pseudonymous-keyed |
| | `reason`, `resolution_notes` | content-pii-possible |
| `grievance_audit_log` | `actor_profile_id` | pseudonymous-keyed |
| | `notes` | content-pii-possible |
| `sync_queue_item` | `owner_profile_id`, `client_local_id` | pseudonymous-keyed |
| | `payload`, `error_reason` | content-pii-possible |
| `content_draft` | `profile_id` | pseudonymous-keyed |
| | `title`, `body` | content-pii-possible |
| `grievance_officer_contact` | `officer_name`, `contact_email`, `contact_phone` | **direct-pii** (staff PII, published deliberately per R7) |

`ban_record`, `grievance_report`, `grievance_audit_log` and `reputation_event` are declared
**"no delete, ever, by design"** in schema §6 — which is precisely why the erasure-vs-ban tension
below is structural, not incidental.

---

### 2. Executable checks

#### 2.1 Retention enforcement — **NOT EXECUTED (blocked), and no mechanism exists to execute**

The skill requires execution against an ephemeral DB. There is none (see method limitation), so
the deletion itself is deferred to T70. What **was** executed here is a mechanism-existence sweep —
this is not "read the code and infer"; it is an exhaustive search for the enforcement machinery,
and it comes back empty:

```
== A: scheduled jobs registered in the worker ==
server/src/worker/index.ts:18:const jobs: Job[] = [moderationRetryJob];
== B: any DELETE/soft-delete against PII tables in server/src ==
server/src/db/migrate.ts:132: DELETE FROM schema_migrations WHERE version = $1     <- not a PII table
== C: any cron/pg_cron/scheduler ==
(none)
== D: erasure/DSR route ==
(none)
```

Findings: there is **no retention job, no cron, no trigger, no erasure endpoint, and no code path
anywhere that writes `deleted_at`** — although three tables declare the column and four read
paths filter on `deleted_at IS NULL` (`identity.repo.ts:30`, `profile.repo.ts:33`,
`content.repo.ts:126,140,163,217,235`). The soft-delete stance in schema §6 is **declared but
unimplemented**. → **PRV-1**, and the specific unbounded holding → **PRV-12**.

Retention **duration** is undecided (T43). Restated verbatim as a blocking Open Question below.

#### 2.2 Consent presence — **finding**

Executed sweep of `client/src` (the live S1→S4 flow) and the data model:

- **Zero** occurrences of `consent` or a privacy-notice/policy link in `client/src/**`. S1's copy
  (`client/src/screens/email-entry.ts:57,67`) is anonymity *reassurance* — "We verify your email
  once, scramble it, and never show it to anyone" — not a DPDP notice, and there is no
  affirmative capture (no checkbox, no accept action) anywhere in `verification-flow.ts`.
- **No place to store one:** migration 001 has no consent column, `registration-events.ts:5-12`
  defines no consent event, and `analytics_event` receives no consent record.

So the gap is twofold: the **copy** is a T43 human/legal decision (correctly pending), but the
**capture record** — timestamp + copy version, queryable — is an engineering gap that exists
independently of the copy and can be built before T43 lands. → **PRV-4**.

#### 2.3 Erasure vs ban durability — **finding** (execution deferred to T70)

Current state, from the sweep in 2.1: **the only erasure path in the codebase is a manual admin
script**, `server/scripts/admin-delete-identity.ts`. There is no user-facing or operator-facing
erasure route at all. What the script does:

```
36:  "DELETE FROM pseudonymous_profile WHERE identity_account_id = $1 RETURNING pseudonym"
39:  "DELETE FROM identity_account WHERE id = $1"
```

Three problems, all recorded for T70:

1. **It defeats the ban.** `ban_record` does not exist until migration 003 (M3) — confirmed by
   `ban-check.ts:46-49`, which catches Postgres `42P01` and returns no-match. Today the *only*
   record that an account was banned is `identity_account.ban_status` (a column on the very row
   this script deletes). Hard-deleting a banned user today therefore erases the ban with them,
   and the same email re-registers cleanly. The TRD's ban-durability NFR is satisfied by design
   *only once* `ban_record` exists — it is decoupled by design (schema §3.8: "no FK to
   `identity_account`", "no delete path exists"). Until M3, the tension is not merely unresolved,
   it resolves the **wrong way**. → **PRV-2**.
2. **It contradicts the frozen decision.** Schema §6 puts `identity_account` and
   `pseudonymous_profile` under *soft* delete (`deleted_at` tombstone). The script hard-deletes.
   The code does not do what the documented decision says. → **PRV-2**.
3. **It cannot run for a real user.** `question.author_profile_id` and `answer.author_profile_id`
   are `NOT NULL REFERENCES pseudonymous_profile(id)` with no `ON DELETE` clause
   (`002_content.up.sql:34,56`), so the profile DELETE raises a foreign-key violation for any
   author who has ever posted. The erasure path is untested against content and will fail on the
   first real request. → **PRV-13**. *(Static conclusion from the DDL — asserting the violation
   requires the DB, so it is deferred to T70.)*

**Legal-basis note:** searched `decisions/`, `runbooks/`, `docs/HUMAN-TASKS.md`. **No documented
legal-basis note exists** for `ban_record.email_hash` surviving an erasure request, nor for any
other retained PII column. `docs/HUMAN-TASKS.md:163` lists it as work *to be delivered by T43*,
which is the opposite of a decision on record. → **PRV-3**, owner **human/legal**. This agent does
not assess sufficiency; it verifies only that the decision exists, and it does not.

#### 2.4 Leakage — API responses — **finding (coverage gap; no leak found)**

Reviewed every implemented route: A1/A2 (`identity.routes.ts`), `POST /session/exchange`,
`GET /session`, `POST /session/logout` (`session.routes.ts`), A3/A4/A5-browse/thread/topics
(`content.routes.ts`), A12 (`analytics.routes.ts`), `/health`, and the central error handler
(`app.ts:45-53`).

**No identity leak found in any response shape.** The product promise — author shown as pseudonym
+ year badge and nothing else — holds structurally, and it holds because of a deliberate design
choice worth naming: serialization is centralized. `content.routes.ts:25-50` whitelists fields
into `questionView`/`answerView` so no handler can hand back a raw row, and `AUTHOR_SELECT`
(`content.repo.ts:49-54`) is the single author projection, so no query can select an identity
column into a response by accident. Error copy is PII-free by construction
(`error-envelope.ts:53-85`, fixed strings).

The gap is in **what pins that promise**: the T55 automated audit
(`tests/nfr/identity-nondisclosure.test.ts:88-140`) asserts only against **A1 and A2**. The
session endpoints (T12) and the content endpoints (T15–T17) landed afterwards with no
non-disclosure assertions, and `FORBIDDEN_KEYS` (`:20-30`) omits the camel/snake variants that
the newer surfaces would use (`author_profile_id` / `authorProfileId`). A future handler can
regress the promise on those routes without any test turning red. → **PRV-11**. (That suite could
not be executed here — it truncates.)

#### 2.5 Leakage — logs — **finding (two high, one medium)**

`shared/logger.ts:11-25` declares a redact list. Executed probe replicating that exact config
against the request shape `pino-http` actually emits (`app.ts:19`):

```
PROBE-A → {"req":{"id":7,"method":"GET","url":"/questions?topic=placements",
  "headers":{"host":"murmur.example",
             "authorization":"Bearer v1.eyJzdWIiOiI3ZjNhIn0.SIG",
             "cookie":"murmur.session=abc123",
             "user-agent":"Mozilla/5.0 (Android 14; SM-G991B)"},
  "remoteAddress":"203.0.113.42","remotePort":51234}, "msg":"PROBE-A ..."}

PROBE-B → {"err":{"type":"Error","message":"550 5.1.1 <student.2027@example-college.edu>:
  Recipient address rejected","stack":"Error: 550 5.1.1 <student.2027@example-college.edu>..."}}

PROBE-C → {"email":"[redacted]","user":{"email_hash":"[redacted]"},"token":"[redacted]"}
```

Corroborated by the real logger output captured during `npx vitest run tests/unit`, which shows
`pino-http` emitting the full `headers` map and `remoteAddress` on every request:

```
{"level":30,...,"req":{"id":1,"method":"POST","url":"/questions","query":{},"params":{},
 "headers":{"host":"127.0.0.1:53770","accept-encoding":"gzip, deflate",
 "content-type":"application/json","content-length":"2","connection":"close"},
 "remoteAddress":"::ffff:127.0.0.1","remotePort":53771},...,"msg":"request completed"}
```

Reading of the three probes:

- **PROBE-C passes** — the declared paths work for the shapes they name. The intent in the
  file's doc comment is real and correctly implemented *for direct field logging*.
- **PROBE-A fails** — the list covers `email`, `*.email`, `token`, `*.token` etc., but pino's
  `*` wildcard matches exactly one level, so nothing covers `req.headers.authorization`,
  `req.headers.cookie`, or `req.remoteAddress`. Every request therefore logs a **live session
  bearer credential** and the **client IP** (personal data under DPDP). → **PRV-5**.
- **PROBE-B fails** — an error's `message` and `stack` are not redactable by field path.
  `identity.service.ts:108` logs `{ err }` on exactly the SMTP delivery-failure path, and SMTP
  rejections routinely embed the recipient address. → **PRV-9**.

Separately, and outside pino entirely: `EMAIL_PROVIDER` **defaults to `"console"`**
(`config/index.ts:56`), and `ConsoleEmailProvider.sendVerification` does

```
email-provider.ts:27:  console.log(`[email:console] verification token for ${to}: ${token}`);
```

— raw address **and** live OTP straight to stdout, which in managed hosting *is* the log sink,
bypassing every redact path. The file's own comment says "Never do this in prod", but the safe
property is inverted: an unset or typo'd `EMAIL_PROVIDER` in staging/production silently selects
it (a *typo'd* value at least hits `UnconfiguredProvider`, which throws — the unset case does
not). It also reports delivery as confirmed when no email was sent. → **PRV-6**.

All other `logger.*` call sites were reviewed (14 in total, `server/src/**`): they log ids,
counts, signals, provider names, ports and job names — no PII. `ban-check.ts:48`, the moderation
gateway, the retry job, `migrate.ts` and the worker are clean.

#### 2.6 Leakage — analytics — **finding**

**Server-side emitters are clean.** Every `emit()` call was traced:
`identity.service.ts:82,94,149,166,167` emit an event name and, at most,
`{ noRuleForDomain: boolean }` (`:159`) plus a `profile.id`; `registration-events.ts:5-12` is a
name vocabulary only; `content-events.ts:43-82` emits `questionId` / `answerId` / `topic` /
`contentType` / bucketed `outcome` and the actor's **profile** id. No email, no hash, no token,
no free text reaches `analytics_event.metadata` from server code.

**The ingest route is the problem.** A12 `POST /events` (`analytics.routes.ts:22`) is mounted at
`app.ts:33` with **no `requireSession`** — unlike every content route — and its schema
(`:13-18`) accepts `metadata: z.record(z.unknown())`, persisted verbatim
(`analytics.service.ts:19-30`) into a table schema §6 declares **append-only, never deleted**.
Anyone on the internet can therefore write arbitrary JSON up to the 256 kB body limit
(`app.ts:18`) into a PII-capable store with no delete path, no retention clock, and no schema
constraint. → **PRV-7**. The same route accepts a caller-supplied `actorProfileId`
(`:15`), so behavioural events can be attributed to any profile id an attacker guesses or
observes. → **PRV-10**.

Inspecting **stored** payloads (the skill's "fire the instrumented events and inspect what
landed") requires the DB → deferred to T70.

#### 2.7 Third-party data flows — **finding**

| Processor | Data that crosses | Verified | DPA / terms recorded? |
|---|---|---|---|
| Email/OTP provider (SMTP, e.g. Gmail SMTP) | raw address + OTP text — unavoidable and minimal (`email-provider.ts:86-93`: `to`, subject, one-line body) | Yes — no other field is sent | **No** — nothing in `decisions/` |
| Supabase (managed Postgres) | **all** of it, including `email_encrypted` ciphertext and every hash | Yes — `DATABASE_URL` | **No** — nothing in `decisions/` |
| AI moderation provider | **nothing today** — `config.moderationProvider` defaults to `""` → hold-all adapter, so no request is ever made | Yes | n/a until T14b |

The moderation port is **clean by construction**, which is worth recording as a positive: the
whole contract is `ClassifyInput { text, contentType }` (`moderation.types.ts:18-21`) — there is
no field on the port through which an identity value *could* travel, so T70's "assert the A7
request carries no identity fields" is satisfied at the type level and only needs a captured
real request once T14b binds a vendor. Note that `text` is UGC, so it remains
`content-pii-possible` by nature.

Unrecorded processors → **PRV-15** (medium per the skill's "unrecorded processor => medium").

#### 2.8 Existence check — breach-notification runbook — **finding**

`runbooks/dpdp-breach-notification.md` exists but is **placeholder**: 5 `[HUMAN:` markers remain,
including the two the skill checks for by name — owner and the notification clock:

```
4:**Owner:** [HUMAN: name]  **Last reviewed:** [HUMAN: date]
18: ... execute pepper-rotation / [HUMAN: key-rotation procedure] in parallel.
21:4. **Notify counsel:** [HUMAN: contact + backup contact].
22:5. **Notify the Board** within the deadline via [HUMAN: form/portal] ...
23:6. **Notify affected students** ... [HUMAN: pre-draft this template NOW ...]
```

Owned by **T75 (M6)**, whose plan row explicitly folds the notification clock into T43's legal
scope. PRR-27 makes this NO-GO at launch. Skill step 7 fixes the severity at high. → **PRV-8**.

---

### 3. Findings — Run 1

Ranked by severity. Every finding carries file:line or executed-command provenance; none is
prose-only. **Warn-only: none of these block M1 exit.** Full detail in the handoff block.

| ID | Sev | Category | Location | One-line |
|---|---|---|---|---|
| PRV-1 | high | retention_enforcement | `server/src/worker/index.ts:18` | No retention/deletion mechanism of any kind exists; `deleted_at` is read but never written |
| PRV-2 | high | erasure_vs_ban | `server/scripts/admin-delete-identity.ts:36-39` | The only erasure path hard-deletes (schema §6 says soft) and, pre-`ban_record`, erases the ban with the user |
| PRV-3 | high | legal_basis_missing | `decisions/` (absent) | No documented legal-basis note for `ban_record.email_hash` survival or any retained PII — owner human/legal |
| PRV-4 | high | consent_presence | `client/src/screens/`, `001_identity.up.sql` | No DPDP consent notice **and** no capture record (no column, no event) anywhere |
| PRV-5 | high | leak_logs | `server/src/app.ts:19` + `shared/logger.ts:11-25` | Every request logs `req.headers.authorization` (live session token), `cookie`, and client IP — uncovered by the redact list |
| PRV-6 | high | leak_logs | `server/src/config/index.ts:56` + `email-provider.ts:27` | `EMAIL_PROVIDER` **defaults** to console → raw email + live OTP to stdout, bypassing pino redaction |
| PRV-7 | high | leak_analytics | `analytics.routes.ts:13-33`, `app.ts:33` | A12 `POST /events` is unauthenticated and accepts arbitrary `metadata` into a never-deleted table |
| PRV-8 | high | breach_runbook | `runbooks/dpdp-breach-notification.md:4` | Breach runbook is placeholder — 5 `[HUMAN:` markers, no owner, no clock |
| PRV-9 | medium | leak_logs | `identity.service.ts:108` | `{ err }` logged verbatim; SMTP rejections embed the recipient address (PROBE-B) |
| PRV-10 | medium | leak_analytics | `analytics.routes.ts:15` | Caller-supplied `actorProfileId` on an unauthenticated route → spoofable attribution |
| PRV-11 | medium | leak_responses | `tests/nfr/identity-nondisclosure.test.ts:20-30,88` | T55 audit covers A1/A2 only; session + content routes are unpinned |
| PRV-12 | medium | retention | `identity.repo.ts:101-110` | `email_encrypted` retained unbounded on `pending` / `blocked_unparseable_year` rows (matches schema §6 — the duration is what's missing) |
| PRV-13 | medium | erasure_vs_ban | `002_content.up.sql:34,56` | Hard delete will FK-violate for any author with content; no erasure route exists at all |
| PRV-14 | medium | retention | `002_content.up.sql:85` | `moderation_case.provider_raw_response` will hold a second UGC copy in a never-deleted table once T14b binds a provider |
| PRV-15 | medium | third_party_flows | `decisions/` (absent) | No processor/DPA record for the SMTP provider or Supabase |
| PRV-16 | low | leak_logs | `admin-delete-identity.ts:13,32,42` | Admin script takes the raw email as argv (shell history) and prints it to stdout |
| PRV-17 | low | config | `config/index.ts:39`, `email-encryption.ts:15-22` | `EMAIL_ENCRYPTION_KEY` is optional and silently no-ops to NULL; no production startup guard |
| PRV-18 | low | client_storage | `client/src/session.ts:13,56` | Session token + profile persisted in `localStorage` (pseudonymous only; consistent with `decisions/oq-14-session-mechanism.md` §7 — recorded, not disputed) |

**Counts:** critical **0** · high **8** · medium **7** · low **3**.
**Status: `fail`** by the stage gate rule (`counts.critical == 0 and counts.high == 0`).
**Warn-only, so this does not block M1** (`cadence.md` §2 M1 row, §3): these become the M2-entry
fix list. No critical was found, so no §6 immediate escalation is triggered.

### 4. Escalated verbatim as Open Questions

Restated, not paraphrased, and **not designed around**:

1. **RR-10** (`docs/07-plan.md` §6): *"DPDP consent copy and retention duration undefined;
   penalties to INR 50 crore"* — owner human/legal (T43), **blocking**.
2. **T43 items 2–4** (`docs/HUMAN-TASKS.md:160-163`): *"DPDP consent-flow copy — the exact wording
   shown at S1/S4 onboarding"*; *"Retention duration — how long Murmur keeps identity data"*;
   *"Erasure vs ban legal basis — a banned user asking for deletion cannot simply be deleted"* —
   owner human/legal, **blocking**.
3. **No ephemeral test database.** `DATABASE_URL` targets a live Supabase instance holding real
   user data and is unreachable (IPv4 `ENOTFOUND`). Retention deletion and the erasure run could
   not be executed; T70 requires them. Owner engineering, **blocking** for the T70 run.

### 5. Carried to T70 (M5, blocking run)

- Execute retention deletion against an ephemeral DB, using the T43 duration (PRV-1, PRV-12).
- Execute the erasure path end-to-end: assert profile PII and content attribution are gone,
  assert `ban_record.email_hash` survives, assert the legal-basis note exists (PRV-2, PRV-3, PRV-13).
- Inspect **stored** `analytics_event.metadata` rows after firing T45/T51–T53 events (PRV-7).
- Grievance PII: `grievance_report`, `is_anonymous`, `grievance_audit_log`, and
  `grievance_officer_contact`'s three direct-pii staff columns (not yet migrated).
- Capture a real A7 moderation request once T14b binds a provider; re-check
  `provider_raw_response` (PRV-14).
- Re-run the full leakage sweep against operator routes S16/S17, which show more than student
  routes.

---

## JSON Handoff

Provenance note: `handoff_sha256` values are SHA-256 over the exact text of each upstream doc's
last fenced JSON block (reproducible: extract the block, hash the UTF-8 bytes without the fences).

```json
{
  "stage": "privacy",
  "schema_version": "1.0",
  "inputs_consumed": [
    { "stage": "plan", "handoff_sha256": "78cb95758b9dacd9f30c491fba071772d5b8ce7f93d37aa57c16bbd2ea645997" },
    { "stage": "schema", "handoff_sha256": "b7ed682856059cb7de647649666da43d58f6261b53b0de735fe2604c47d567fb" }
  ],
  "status": "fail",
  "open_questions": [
    {
      "id": "OQ-PRV-1",
      "text": "RR-10, verbatim: \"DPDP consent copy and retention duration undefined; penalties to INR 50 crore\" (docs/07-plan.md section 6). T43 owns it; this agent records it and does not improvise a duration or copy.",
      "owner": "human/legal",
      "blocking": true
    },
    {
      "id": "OQ-PRV-2",
      "text": "T43 items 2-4, verbatim (docs/HUMAN-TASKS.md:160-163): \"DPDP consent-flow copy - the exact wording shown at S1/S4 onboarding\"; \"Retention duration - how long Murmur keeps identity data. Needed by the T70 privacy gate, which executes retention enforcement rather than just reading policy\"; \"Erasure vs ban legal basis - a banned user asking for deletion cannot simply be deleted\".",
      "owner": "human/legal",
      "blocking": true
    },
    {
      "id": "OQ-PRV-3",
      "text": "No ephemeral test database exists. DATABASE_URL targets a live Supabase instance holding real user data and is unreachable from this network (IPv4 lookup ENOTFOUND, IPv6 ENOENT). tests/integration and tests/nfr TRUNCATE and were deliberately not run; the guard in tests/helpers/test-db.ts was not bypassed. Retention deletion and the erasure run therefore could not be executed and are deferred to T70, which requires them.",
      "owner": "engineering",
      "blocking": true
    }
  ],
  "waivers_cited": [],
  "pii_inventory": [
    { "table": "identity_account", "column": "id", "classification": "pseudonymous-keyed", "purpose": "internal identity PK; re-identification anchor targeted by pseudonymous_profile.identity_account_id", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "MISSING (no job/trigger/route; server/src/worker/index.ts:18 registers only moderationRetryJob)", "legal_basis": "MISSING (no note in decisions/)" },
    { "table": "identity_account", "column": "email_hash", "classification": "pseudonymous-keyed", "purpose": "duplicate-registration check (A1) and ban match (A11); versioned keyed HMAC-SHA256, server-held pepper (shared/email-identity.ts:103-106)", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "MISSING", "legal_basis": "MISSING (no note in decisions/)" },
    { "table": "identity_account", "column": "email_encrypted", "classification": "direct-pii", "purpose": "raw college email, AES-256-GCM app-layer (shared/email-encryption.ts:24-32); retained transiently for resend (S2) and manual-fallback review", "retention": "MISSING (T43 undecided; schema section 6 says 'transiently' with no duration)", "deletion_mechanism": "PARTIAL: SET email_encrypted = NULL on the verified path only (server/src/modules/identity/identity.repo.ts:94). No mechanism for rows stuck in 'pending' or 'blocked_unparseable_year' (identity.repo.ts:101-110)", "legal_basis": "MISSING (no note in decisions/)" },
    { "table": "identity_account", "column": "verification_status", "classification": "non-pii", "purpose": "verification state machine", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },
    { "table": "identity_account", "column": "derived_enrollment_year", "classification": "non-pii", "purpose": "year-badge derivation (R1). Classified non-pii because schema:pii_fields does not list it; noted as a quasi-identifier (year + single campus + pseudonym) and deliberately public as the badge", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },
    { "table": "identity_account", "column": "verification_token_hash", "classification": "pseudonymous-keyed", "purpose": "OTP credential digest (not identity material); listed in schema:pii_fields", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "nulled at verified and at blocked_unparseable_year (identity.repo.ts:92,105)", "legal_basis": "MISSING" },
    { "table": "identity_account", "column": "verification_token_expires_at", "classification": "non-pii", "purpose": "token TTL", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },
    { "table": "identity_account", "column": "verification_attempt_count", "classification": "non-pii", "purpose": "A1 rate limiting", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },
    { "table": "identity_account", "column": "last_verification_sent_at", "classification": "non-pii", "purpose": "resend cooldown", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },
    { "table": "identity_account", "column": "ban_status", "classification": "non-pii", "purpose": "ban flag; pre-M3 this is the ONLY record that an account was banned (see PRV-2)", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },
    { "table": "identity_account", "column": "deleted_at", "classification": "non-pii", "purpose": "soft-delete tombstone; read by identity.repo.ts:30, written by no code path (PRV-1)", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },
    { "table": "identity_account", "column": "created_at", "classification": "non-pii", "purpose": "audit timestamp", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },
    { "table": "identity_account", "column": "updated_at", "classification": "non-pii", "purpose": "audit timestamp (trigger set_updated_at)", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },

    { "table": "pseudonymous_profile", "column": "id", "classification": "pseudonymous-keyed", "purpose": "public actor key; FK target of all authored content", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "MISSING", "legal_basis": "MISSING" },
    { "table": "pseudonymous_profile", "column": "identity_account_id", "classification": "pseudonymous-keyed", "purpose": "the single re-identification linkage (schema:pii_fields[4]); verified never selected outward (profile.repo.ts:31,56; content.repo.ts:49-54)", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "MISSING", "legal_basis": "MISSING" },
    { "table": "pseudonymous_profile", "column": "pseudonym", "classification": "pseudonymous-keyed", "purpose": "the only identity other users ever see (PRD R2 AC1)", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "MISSING", "legal_basis": "MISSING" },
    { "table": "pseudonymous_profile", "column": "year_badge", "classification": "non-pii", "purpose": "public seniority signal (R1)", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },
    { "table": "pseudonymous_profile", "column": "reputation_score", "classification": "non-pii", "purpose": "cached aggregate", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },
    { "table": "pseudonymous_profile", "column": "status", "classification": "non-pii", "purpose": "active/suspended/banned; live revocation authority read on every request (require-session.ts:44)", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },
    { "table": "pseudonymous_profile", "column": "deleted_at", "classification": "non-pii", "purpose": "soft-delete tombstone; read by profile.repo.ts:33, written by no code path (PRV-1)", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },
    { "table": "pseudonymous_profile", "column": "created_at", "classification": "non-pii", "purpose": "audit timestamp", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },
    { "table": "pseudonymous_profile", "column": "updated_at", "classification": "non-pii", "purpose": "audit timestamp", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },

    { "table": "topic_tag", "column": "id, slug, label, is_active, created_at, updated_at", "classification": "non-pii", "purpose": "fixed seeded reference data (002_content.up.sql:20-27, 124-130); no column relates to a person", "retention": "n/a", "deletion_mechanism": "soft-retire via is_active = false, never deleted (schema section 6)", "legal_basis": "n/a" },

    { "table": "question", "column": "author_profile_id", "classification": "pseudonymous-keyed", "purpose": "authorship link to pseudonymous_profile; never serialized into a response (content.routes.ts:25-37)", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "MISSING", "legal_basis": "MISSING" },
    { "table": "question", "column": "title", "classification": "content-pii-possible", "purpose": "user-authored free text; a student can type identity material into it", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "MISSING (deleted_at column exists, no code writes it)", "legal_basis": "MISSING" },
    { "table": "question", "column": "body", "classification": "content-pii-possible", "purpose": "user-authored free text", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "MISSING (deleted_at column exists, no code writes it)", "legal_basis": "MISSING" },
    { "table": "question", "column": "search_vector", "classification": "content-pii-possible", "purpose": "GENERATED ALWAYS AS tsvector over title+body, STORED (002:42-44) - a derived copy of the UGC that tracks the source automatically, so it needs no separate erasure step", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "follows title/body automatically (generated column)", "legal_basis": "MISSING" },
    { "table": "question", "column": "id, topic_tag_id, moderation_status, published_at, answer_count, idempotency_key, deleted_at, created_at, updated_at", "classification": "non-pii", "purpose": "structural and lifecycle fields (002_content.up.sql:32-48)", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },

    { "table": "answer", "column": "author_profile_id", "classification": "pseudonymous-keyed", "purpose": "authorship link; never serialized (content.routes.ts:39-50)", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "MISSING", "legal_basis": "MISSING" },
    { "table": "answer", "column": "body", "classification": "content-pii-possible", "purpose": "user-authored free text", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "MISSING (deleted_at column exists, no code writes it)", "legal_basis": "MISSING" },
    { "table": "answer", "column": "search_vector", "classification": "content-pii-possible", "purpose": "GENERATED tsvector over body (002:62-64); derived copy, tracks the source", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "follows body automatically (generated column)", "legal_basis": "MISSING" },
    { "table": "answer", "column": "id, question_id, moderation_status, accepted, vote_count, idempotency_key, deleted_at, created_at, updated_at", "classification": "non-pii", "purpose": "structural and lifecycle fields (002_content.up.sql:53-68)", "retention": "n/a", "deletion_mechanism": "n/a", "legal_basis": "n/a" },

    { "table": "moderation_case", "column": "provider_raw_response", "classification": "content-pii-possible", "purpose": "raw third-party classifier payload stored verbatim for threshold tuning (002:85); in practice echoes the classified UGC text back. No rows exist yet (no provider bound: config.moderationProvider defaults to empty). Schema section 6 declares this table never deleted - see PRV-14", "retention": "MISSING (T43 undecided; schema section 6 says never deleted)", "deletion_mechanism": "none by design (schema section 6: moderation_case is never deleted - it is R6's auditable coverage proof)", "legal_basis": "MISSING" },
    { "table": "moderation_case", "column": "id, question_id, answer_id, ai_classification_label, risk_tier, risk_score, decision, decided_by, decided_at, external_provider_case_ref, created_at, updated_at", "classification": "non-pii", "purpose": "moderation decision record (002_content.up.sql:74-90)", "retention": "n/a", "deletion_mechanism": "never deleted by design (schema section 6)", "legal_basis": "n/a" },

    { "table": "analytics_event", "column": "actor_profile_id", "classification": "pseudonymous-keyed", "purpose": "behavioural attribution to a pseudonymous profile (006_analytics.up.sql:9). Spoofable via the unauthenticated ingest route - PRV-10", "retention": "MISSING (T43 undecided; schema section 6: append-only ledger, never deleted)", "deletion_mechanism": "none by design", "legal_basis": "MISSING" },
    { "table": "analytics_event", "column": "metadata", "classification": "content-pii-possible", "purpose": "event payload. Server emitters write only ids/booleans/buckets (verified: identity.service.ts:159, content-events.ts:43-82), but A12 POST /events accepts arbitrary caller-supplied JSON (analytics.routes.ts:17) - PRV-7", "retention": "MISSING (T43 undecided; never deleted per schema section 6)", "deletion_mechanism": "none by design", "legal_basis": "MISSING" },
    { "table": "analytics_event", "column": "id, event_type, occurred_at, created_at, updated_at", "classification": "non-pii", "purpose": "ledger structure (006_analytics.up.sql:6-14)", "retention": "n/a", "deletion_mechanism": "none by design (append-only)", "legal_basis": "n/a" },

    { "table": "reputation_event", "column": "actor_profile_id, subject_profile_id", "classification": "pseudonymous-keyed", "purpose": "append-only reputation ledger (docs/05-schema.md section 3.6). NOT YET IMPLEMENTED - migration 003 absent; full column-level inventory deferred to T70", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "none by design (append-only ledger, schema section 6)", "legal_basis": "MISSING" },
    { "table": "ban_record", "column": "email_hash", "classification": "pseudonymous-keyed", "purpose": "the permanent ban ledger key; must survive account erasure (TRD ban durability, schema section 3.8). NOT YET IMPLEMENTED - migration 003 absent. Lookup mechanism is already live and probes for the table (ban-check.ts:36-49)", "retention": "no delete, ever, by design (schema section 6)", "deletion_mechanism": "none by design - deliberately no deleted_at and no FK to identity_account", "legal_basis": "MISSING - no documented note exists for why this survives an erasure request (PRV-3, owner human/legal)" },
    { "table": "ban_record", "column": "ban_reason", "classification": "content-pii-possible", "purpose": "operator free text on the ban ledger. NOT YET IMPLEMENTED", "retention": "no delete, ever, by design (schema section 6)", "deletion_mechanism": "none by design", "legal_basis": "MISSING" },
    { "table": "grievance_report", "column": "reporter_profile_id", "classification": "pseudonymous-keyed", "purpose": "IT Act grievance ticket reporter, nullable when is_anonymous (schema section 3.9). NOT YET IMPLEMENTED - migration 005 absent; T70 scope", "retention": "no delete, ever, by design (compliance record, schema section 6)", "deletion_mechanism": "none by design", "legal_basis": "MISSING" },
    { "table": "grievance_report", "column": "reason, resolution_notes", "classification": "content-pii-possible", "purpose": "grievance free text, the highest-legal-exposure UGC in the system. NOT YET IMPLEMENTED", "retention": "no delete, ever, by design (schema section 6)", "deletion_mechanism": "none by design", "legal_basis": "MISSING" },
    { "table": "grievance_audit_log", "column": "actor_profile_id", "classification": "pseudonymous-keyed", "purpose": "grievance audit trail actor (schema section 3.10). NOT YET IMPLEMENTED", "retention": "no delete, ever, by design (schema section 6)", "deletion_mechanism": "none by design", "legal_basis": "MISSING" },
    { "table": "grievance_audit_log", "column": "notes", "classification": "content-pii-possible", "purpose": "audit-trail free text. NOT YET IMPLEMENTED", "retention": "no delete, ever, by design", "deletion_mechanism": "none by design", "legal_basis": "MISSING" },
    { "table": "sync_queue_item", "column": "owner_profile_id, client_local_id", "classification": "pseudonymous-keyed", "purpose": "offline write-queue ownership and device-local id (schema section 3.11). NOT YET IMPLEMENTED - migration 004 absent", "retention": "MISSING (schema section 6 marks this working-state table [ASSUMPTION], cleanup left to a housekeeping job that does not exist)", "deletion_mechanism": "MISSING", "legal_basis": "MISSING" },
    { "table": "sync_queue_item", "column": "payload, error_reason", "classification": "content-pii-possible", "purpose": "queued UGC payload awaiting sync, plus failure text. NOT YET IMPLEMENTED", "retention": "MISSING", "deletion_mechanism": "MISSING", "legal_basis": "MISSING" },
    { "table": "content_draft", "column": "profile_id", "classification": "pseudonymous-keyed", "purpose": "draft ownership (schema section 3.13). NOT YET IMPLEMENTED", "retention": "MISSING (working-state table, [ASSUMPTION] in schema section 6)", "deletion_mechanism": "MISSING", "legal_basis": "MISSING" },
    { "table": "content_draft", "column": "title, body", "classification": "content-pii-possible", "purpose": "unsubmitted user free text - never moderated, so a higher raw-PII likelihood than published content. NOT YET IMPLEMENTED", "retention": "MISSING", "deletion_mechanism": "MISSING", "legal_basis": "MISSING" },
    { "table": "grievance_officer_contact", "column": "officer_name, contact_email, contact_phone", "classification": "direct-pii", "purpose": "the published grievance officer's contact details (S15, R7 AC3) - staff PII, deliberately public. NOT YET IMPLEMENTED - migration 005 absent; content is T42 (human-owned)", "retention": "MISSING (T43 undecided)", "deletion_mechanism": "MISSING (superseded by effective_from versioning per schema section 3.14)", "legal_basis": "MISSING - statutory publication requirement is asserted by R7 but no note is on record" }
  ],
  "checks": [
    {
      "check": "retention_enforcement",
      "executed": false,
      "verdict": "blocked",
      "evidence": "NOT EXECUTED - no ephemeral DB (see OQ-PRV-3: DATABASE_URL host db.yinckproedjodpbvzdhb.supabase.co, IPv4 ENOTFOUND / IPv6 ENOENT; tests that TRUNCATE were deliberately not run). What WAS executed is an exhaustive mechanism-existence sweep, which returns empty: worker jobs = [moderationRetryJob] only (server/src/worker/index.ts:18); the only DELETE in server/src is against schema_migrations (db/migrate.ts:132); no cron/pg_cron/scheduler; no erasure route in any module. No code path writes deleted_at, although identity.repo.ts:30, profile.repo.ts:33 and content.repo.ts:126,140,163,217,235 all filter on it. Retention duration itself is undecided (T43) - restated verbatim in OQ-PRV-1/2. Findings PRV-1, PRV-12, PRV-14."
    },
    {
      "check": "consent_presence",
      "executed": true,
      "verdict": "finding",
      "evidence": "Executed sweep of client/src (the live S1-S4 flow) and the data model: zero occurrences of 'consent' or a privacy-notice/policy link. S1 copy at client/src/screens/email-entry.ts:57,67 is anonymity reassurance, not a DPDP notice, and there is no affirmative capture control anywhere in verification-flow.ts. No storage exists either: migration 001 has no consent column, registration-events.ts:5-12 defines no consent event. The copy is T43's (correctly pending); the capture record - timestamp + copy version, queryable - is an engineering gap that does not depend on T43. Finding PRV-4."
    },
    {
      "check": "erasure_vs_ban",
      "executed": false,
      "verdict": "finding",
      "evidence": "Deletion path NOT EXECUTED (OQ-PRV-3, no DB). Static result: the only erasure path in the codebase is server/scripts/admin-delete-identity.ts:36-39, which HARD-deletes pseudonymous_profile then identity_account. (a) It contradicts the frozen decision - schema section 6 puts both tables under soft delete via deleted_at. (b) It defeats the ban: ban_record does not exist until migration 003/M3 (confirmed by ban-check.ts:46-49 catching Postgres 42P01), so today identity_account.ban_status is the only ban record and it is deleted with the user, letting the same email re-register. (c) It cannot run for a real user: question.author_profile_id and answer.author_profile_id are NOT NULL REFERENCES pseudonymous_profile(id) with no ON DELETE (002_content.up.sql:34,56), so the profile DELETE FK-violates for any author with content. No documented legal-basis note exists for ban_record.email_hash survival - searched decisions/, runbooks/, docs/HUMAN-TASKS.md; HUMAN-TASKS.md:163 lists it as work owed by T43, not a decision on record. Findings PRV-2, PRV-3, PRV-13."
    },
    {
      "check": "leak_responses",
      "executed": true,
      "verdict": "finding",
      "evidence": "No identity leak found in any implemented route (A1/A2, POST /session/exchange, GET /session, POST /session/logout, A3/A4/A5-browse/thread/topics, A12, /health, central error handler app.ts:45-53). It holds structurally: serialization is centralized in content.routes.ts:25-50 (whitelist views) over the single AUTHOR_SELECT projection content.repo.ts:49-54 = {pseudonym, year_badge, reputation_score}; profile.repo.ts:31,56 project public columns only; error copy is fixed PII-free strings (error-envelope.ts:53-85). The finding is a COVERAGE gap: the T55 audit tests/nfr/identity-nondisclosure.test.ts:88-140 asserts against A1/A2 only, and its FORBIDDEN_KEYS list (:20-30) omits author_profile_id/authorProfileId, so a regression on the session or content routes would turn nothing red. That suite could not be executed here (it truncates). Corroborating run: npx vitest run tests/unit = 4 files, 35/35 passed. Finding PRV-11."
    },
    {
      "check": "leak_logs",
      "executed": true,
      "verdict": "finding",
      "evidence": "Executed pino probe replicating shared/logger.ts:11-25's exact redact config against the shape pino-http emits (app.ts:19). PROBE-A: req.headers.authorization ('Bearer v1...SIG'), req.headers.cookie and req.remoteAddress ('203.0.113.42') all emitted VERBATIM - pino's * wildcard matches one level, so nothing in the list covers req.headers.* or req.remoteAddress. Corroborated by real output captured during npx vitest run tests/unit: {\"req\":{...,\"headers\":{...},\"remoteAddress\":\"::ffff:127.0.0.1\",...},\"msg\":\"request completed\"} on every request. PROBE-B: an Error's message and stack pass through unredacted ('550 5.1.1 <student.2027@example-college.edu>: Recipient address rejected'); identity.service.ts:108 logs { err } on exactly that SMTP failure path. PROBE-C: the declared paths DO work for the shapes they name (email, *.email_hash, token all censored) - the intent is implemented, the coverage is short. Separately, EMAIL_PROVIDER defaults to 'console' (config/index.ts:56) and email-provider.ts:27 console.logs the raw address plus the live OTP, bypassing pino entirely. All 14 logger.* call sites in server/src were reviewed; the rest log ids, counts, signals, provider and job names only. Findings PRV-5, PRV-6, PRV-9, PRV-16."
    },
    {
      "check": "leak_analytics",
      "executed": true,
      "verdict": "finding",
      "evidence": "Server-side emitters are CLEAN: every emit() traced (identity.service.ts:82,94,149,166,167 -> event name plus at most { noRuleForDomain: boolean } and a profile id; registration-events.ts:5-12 is a name vocabulary; content-events.ts:43-82 -> questionId/answerId/topic/contentType/bucketed outcome plus actor profile id). No email, hash, token or free text reaches analytics_event.metadata from server code. The ingest route is the exposure: A12 POST /events (analytics.routes.ts:22, mounted app.ts:33) has NO requireSession - unlike every content route - and accepts metadata: z.record(z.unknown()) persisted verbatim (analytics.service.ts:19-30) into a table schema section 6 declares append-only and never deleted, up to the 256kb body limit (app.ts:18). It also accepts a caller-supplied actorProfileId (:15). Inspecting STORED payloads requires the DB - deferred to T70. Findings PRV-7, PRV-10."
    },
    {
      "check": "third_party_flows",
      "executed": true,
      "verdict": "finding",
      "evidence": "Email/OTP provider: raw address + OTP cross, unavoidable and minimal - email-provider.ts:86-93 sends only { from, to, subject, one-line text }. Supabase (managed Postgres): everything crosses, including email_encrypted ciphertext and every hash. AI moderation provider: NOTHING crosses today - config.moderationProvider defaults to '' (config/index.ts:76) which resolves to the hold-all adapter, so no request is made. The moderation port is clean by construction: ClassifyInput = { text, contentType } (moderation.types.ts:18-21) has no field through which an identity value could travel, so T70's 'assert no identity fields in the A7 request' holds at the type level and needs only a captured real request once T14b binds a vendor; note text is UGC and stays content-pii-possible. No DPA/terms/processor record exists in decisions/ for the SMTP provider or for Supabase (searched decisions/, 5 files, none on processors). Findings PRV-14, PRV-15."
    },
    {
      "check": "breach_runbook_exists",
      "executed": true,
      "verdict": "finding",
      "evidence": "runbooks/dpdp-breach-notification.md EXISTS but is placeholder: 5 [HUMAN: markers remain, including line 4 '**Owner:** [HUMAN: name]  **Last reviewed:** [HUMAN: date]' - so neither the owner nor the notification clock the skill checks for is named. Others at :18 (key-rotation procedure), :21 (counsel contact), :22 (Board notification form/portal), :23 (student notification template). Owned by T75 (M6), whose plan row folds the notification clock into T43's legal scope; PRR-27 makes it NO-GO at launch. Finding PRV-8."
    }
  ],
  "findings": [
    {
      "id": "PRV-1",
      "severity": "high",
      "category": "retention_enforcement",
      "location": "server/src/worker/index.ts:18 (and the absence of any job/trigger/route elsewhere)",
      "evidence": "No retention or deletion mechanism of any kind exists. Executed sweep: worker jobs = [moderationRetryJob] only; the sole DELETE in server/src targets schema_migrations (db/migrate.ts:132); no cron, pg_cron or scheduler in server/migrations or server/src; no erasure route in any module. The soft-delete stance of schema section 6 is declared but unimplemented - no code path writes deleted_at, while identity.repo.ts:30, profile.repo.ts:33 and content.repo.ts:126,140,163,217,235 all filter on deleted_at IS NULL, so a tombstone would work if anything ever set one.",
      "provenance": "Executed grep sweep A-D (output reproduced in section 2.1 of this doc); server/src/worker/index.ts:18; server/src/db/migrate.ts:132",
      "fix_hint": "Not fixable by this agent and not yet fixable at all: the duration is T43's (OQ-PRV-1/2). What CAN be built ahead of T43 is the clock itself - a worker job in the existing jobs array plus a writer for deleted_at - parameterised by a config value, so T43's answer becomes a number rather than a project. Severity becomes CRITICAL at T70 if T43 has landed and no enforcement exists (skill step 2)."
    },
    {
      "id": "PRV-2",
      "severity": "high",
      "category": "erasure_vs_ban",
      "location": "server/scripts/admin-delete-identity.ts:36-39",
      "evidence": "The only erasure path in the codebase hard-deletes pseudonymous_profile then identity_account. Two defects: (1) it contradicts the frozen decision - schema section 6 places both tables under soft delete via a deleted_at tombstone; (2) it defeats the ban - ban_record does not exist until migration 003/M3 (ban-check.ts:46-49 catches Postgres 42P01 undefined_table and returns no-match), so identity_account.ban_status is today the ONLY record that an account was banned, and it is deleted along with the user, after which the same email re-registers cleanly. The TRD ban-durability NFR is architecturally satisfied only once ban_record exists (schema section 3.8: no FK to identity_account, no delete path, by design). Until then the erasure-vs-ban tension resolves the wrong way.",
      "provenance": "server/scripts/admin-delete-identity.ts:36-39; server/src/modules/identity/ban-check.ts:46-49; docs/05-schema.md section 6 (retention/delete stance) and section 3.8 (ban_record)",
      "fix_hint": "Deferred to T70 by plan design. Interim: the script is dev-only tooling - do not promote it to an erasure path. The real path must soft-delete and must write a ban_record row before removing anything, so the ban outlives the account."
    },
    {
      "id": "PRV-3",
      "severity": "high",
      "category": "legal_basis_missing",
      "location": "decisions/ (no such file); docs/HUMAN-TASKS.md:163",
      "evidence": "No documented legal-basis note exists for ban_record.email_hash surviving an erasure request, nor for any other retained PII column - every legal_basis cell in the inventory above reads MISSING. Searched decisions/ (5 files: oq-14-session-mechanism, oq-3-write-model, quality-kit-qk-decisions, schema-agent-v2, t54-moderation-vendor), runbooks/ (4 files) and docs/HUMAN-TASKS.md. The only mention is HUMAN-TASKS.md:163, which lists 'Erasure vs ban legal basis' as an item T43 must deliver - i.e. work owed, not a decision on record.",
      "provenance": "Executed grep for 'legal basis|legal-basis|lawful|legitimate' across decisions/, runbooks/, docs/HUMAN-TASKS.md - only unrelated hits (oq-14-session-mechanism.md:105, oq-3-write-model.md:22) plus HUMAN-TASKS.md:163",
      "fix_hint": "Owner human/legal (T43). This agent does not assess whether keyed-HMAC pseudonymization with a server-held pepper is a sufficient basis - only that no decision is on record. Deliverable is a short dated note in decisions/ naming the basis and the retention purpose, which T70 then verifies the code matches."
    },
    {
      "id": "PRV-4",
      "severity": "high",
      "category": "consent_presence",
      "location": "client/src/screens/email-entry.ts:57,67; client/src/screens/verification-flow.ts; server/migrations/001_identity.up.sql:21-39",
      "evidence": "No DPDP consent notice renders anywhere in the live S1-S4 onboarding flow, and no consent is captured before the first PII write (A1 writes email_encrypted + email_hash at identity.service.ts:87-92). Executed sweep of client/src returns zero occurrences of 'consent' and no privacy-notice or policy link; the S1 copy is anonymity reassurance ('We verify your email once, scramble it, and never show it to anyone') rather than a notice. Independently of the copy, there is nowhere to record consent: migration 001 declares no consent column, and registration-events.ts:5-12 defines no consent event, so a captured record (timestamp + copy version) could not be stored or queried even if the copy existed today.",
      "provenance": "Executed grep over client/src for consent|privacy|terms (60 hits reviewed, none a consent control); server/migrations/001_identity.up.sql:21-52; server/src/modules/identity/registration-events.ts:5-12",
      "fix_hint": "The copy is T43's decision (OQ-PRV-1/2) and must not be improvised. The storage - a consent column or consent event carrying timestamp + copy version - is an engineering task that can land before the copy does. Skill step 3 makes this launch-blocking via PRR."
    },
    {
      "id": "PRV-5",
      "severity": "high",
      "category": "leak_logs",
      "location": "server/src/app.ts:19 (pinoHttp) with server/src/shared/logger.ts:11-25 (redact list)",
      "evidence": "Every HTTP request logs the full req.headers map and req.remoteAddress. Executed probe (PROBE-A) against the exact redact config shows authorization ('Bearer v1.eyJzdWIiOiI3ZjNhIn0.SIG'), cookie ('murmur.session=abc123') and remoteAddress ('203.0.113.42') emitted verbatim: pino's * wildcard matches exactly one level, so the declared paths (email, *.email, token, *.token, ...) cover none of req.headers.authorization, req.headers.cookie or req.remoteAddress. Confirmed against real output during npx vitest run tests/unit, where each request line carries the headers object and remoteAddress. Two distinct exposures: a LIVE session bearer credential (anyone with log access can impersonate the profile until exp - the session is stateless and cannot be revoked, per decisions/oq-14-session-mechanism.md) and the client IP, which is personal data.",
      "provenance": "Executed node -e pino probe, PROBE-A output reproduced in section 2.5; live pino-http output captured during npx vitest run tests/unit (4 files, 35/35 passed); server/src/app.ts:19; server/src/shared/logger.ts:11-25",
      "fix_hint": "Add req.headers.authorization, req.headers.cookie and req.remoteAddress to the redact paths (or supply a custom pino-http req serializer that emits method/url/id only). Boring and one-line-ish; also feeds PRR-14."
    },
    {
      "id": "PRV-6",
      "severity": "high",
      "category": "leak_logs",
      "location": "server/src/config/index.ts:56; server/src/modules/notification/email-provider.ts:22-28",
      "evidence": "EMAIL_PROVIDER defaults to 'console', and ConsoleEmailProvider.sendVerification does console.log(`[email:console] verification token for ${to}: ${token}`) - the raw college email address AND the live OTP written straight to stdout, which in managed hosting is the log sink. It bypasses pino entirely, so no redact path can reach it. The file's own comment says 'Never do this in prod', but the safe property is inverted: an UNSET EMAIL_PROVIDER in staging or production silently selects this provider. A typo'd value at least falls to UnconfiguredProvider, which throws (:55-62) - only the unset case fails open. It additionally reports delivery as confirmed when no email was sent, so A1 returns verification_pending for a code nobody received.",
      "provenance": "server/src/config/index.ts:56 (optional('EMAIL_PROVIDER', 'console')); server/src/modules/notification/email-provider.ts:27, :55-62, :96-109",
      "fix_hint": "Make the default empty and resolve empty to UnconfiguredProvider (same shape the moderation gateway already uses at config/index.ts:76 - 'deliberately defaults to empty' - so this is consistency with an existing house pattern, not a new idea), or refuse to start with console when NODE_ENV is production."
    },
    {
      "id": "PRV-7",
      "severity": "high",
      "category": "leak_analytics",
      "location": "server/src/modules/analytics/analytics.routes.ts:13-33; mounted server/src/app.ts:33",
      "evidence": "A12 POST /events is mounted with NO requireSession - unlike every content route (content.routes.ts:92,121,153,177,189) - and its schema accepts metadata: z.record(z.unknown()), persisted verbatim by analytics.service.ts:19-30 into analytics_event.metadata. That table is declared append-only and NEVER DELETED (docs/05-schema.md section 6), and no retention clock exists (PRV-1). Net effect: any unauthenticated caller can write up to 256kb (app.ts:18 body limit) of arbitrary JSON - including real names, emails, or third-party PII - into a permanent store from which nothing can currently remove it. Note the server's own emitters are clean (see the leak_analytics check), so this is entirely an ingress-control gap, not an instrumentation-design gap.",
      "provenance": "server/src/modules/analytics/analytics.routes.ts:13-18,22; server/src/app.ts:18,33; server/src/modules/analytics/analytics.service.ts:19-30; docs/05-schema.md section 6 (analytics_event never deleted)",
      "fix_hint": "Put /events behind requireSession like every other write route, and constrain metadata to a known key/value shape (bounded keys, scalar values, size cap) rather than z.record(z.unknown()). Deriving actorProfileId from the session rather than the body closes PRV-10 at the same time."
    },
    {
      "id": "PRV-8",
      "severity": "high",
      "category": "breach_runbook",
      "location": "runbooks/dpdp-breach-notification.md:4,18,21,22,23",
      "evidence": "The runbook exists but is a placeholder: 5 [HUMAN: markers remain. Line 4 is '**Owner:** [HUMAN: name]  **Last reviewed:** [HUMAN: date]', so the two things the skill checks for by name - an owner and the notification clock - are both unfilled. The remaining markers are the key-rotation procedure (:18), counsel contact (:21), the Board notification form/portal (:22) and the student notification template (:23). Skill step 7 fixes this at high; PRR-27 makes it NO-GO at launch.",
      "provenance": "Executed grep '\\[HUMAN:' runbooks/dpdp-breach-notification.md - count 5, lines 4, 18, 21, 22, 23",
      "fix_hint": "Owned by T75 (M6), which the plan explicitly folds into T43's legal engagement rather than treating as a separate one. Nothing for engineering to fix; recorded so it is not discovered at the launch gate."
    },
    {
      "id": "PRV-9",
      "severity": "medium",
      "category": "leak_logs",
      "location": "server/src/modules/identity/identity.service.ts:108",
      "evidence": "logger.error({ err }, 'verification delivery unconfirmed - registration blocked') logs the provider error object verbatim. Executed probe (PROBE-B) confirms an Error's message and stack are not reachable by field-path redaction: '550 5.1.1 <student.2027@example-college.edu>: Recipient address rejected' appears unmodified in both fields. This is precisely the SMTP failure path - rejection messages routinely embed the recipient address - so the raw college email lands in structured logs on a path that is exercised whenever delivery fails. Same shape at email-provider.ts:129, which more carefully logs only { attempt, maxAttempts } and NOT the error - the safer pattern already exists one file away.",
      "provenance": "Executed node -e pino probe, PROBE-B output reproduced in section 2.5; server/src/modules/identity/identity.service.ts:104-115; contrast server/src/modules/notification/email-provider.ts:129",
      "fix_hint": "Log err.name plus a provider-supplied code rather than the whole error on this path, or add a pino errorSerializer that scrubs address-shaped substrings. Follow email-provider.ts:129's existing pattern."
    },
    {
      "id": "PRV-10",
      "severity": "medium",
      "category": "leak_analytics",
      "location": "server/src/modules/analytics/analytics.routes.ts:15",
      "evidence": "The unauthenticated A12 route accepts actorProfileId from the request body (z.string().uuid().optional().nullable()) and stores it as analytics_event.actor_profile_id. Any caller who knows or guesses a profile id can therefore attribute arbitrary behavioural events to that profile. Consequences are twofold: the six PRD metrics T46 derives (WAU, D30 cohorts, activation, answer liquidity) can be poisoned, and a pseudonymous user's behavioural record can be fabricated by a third party - a data-integrity problem with a privacy face.",
      "provenance": "server/src/modules/analytics/analytics.routes.ts:15,22; server/src/modules/analytics/analytics.service.ts:19-30; server/migrations/006_analytics.up.sql:9",
      "fix_hint": "Derive actorProfileId from the session (callerOf(req).id) once PRV-7's requireSession is in place, and ignore any body-supplied value."
    },
    {
      "id": "PRV-11",
      "severity": "medium",
      "category": "leak_responses",
      "location": "tests/nfr/identity-nondisclosure.test.ts:20-30, 88-140",
      "evidence": "The T55 identity-non-disclosure audit - the test that pins the product's core promise - asserts only against A1 and A2. The session endpoints (T12) and content endpoints (T15-T17) landed afterwards and have no non-disclosure assertions, and the FORBIDDEN_KEYS list (:20-30) omits the variants those surfaces would use (author_profile_id, authorProfileId). Manual review of the newer routes found NO leak - content.routes.ts:25-50 whitelists view fields, content.repo.ts:49-54's single AUTHOR_SELECT emits only {pseudonym, year_badge, reputation_score}, profile.repo.ts:31,56 project public columns - so this is an unpinned promise rather than a live leak: a future handler could regress it with nothing turning red.",
      "provenance": "tests/nfr/identity-nondisclosure.test.ts:17-45,88-140; server/src/modules/content/content.routes.ts:25-50; server/src/modules/content/content.repo.ts:49-54; server/src/modules/profile/profile.repo.ts:31,56. Suite not executed here - it truncates (OQ-PRV-3)",
      "fix_hint": "Extend the T55 suite's route table to every mounted route (session, content, topics, health, 404/error envelope) and add author_profile_id/authorProfileId/identityAccountId to FORBIDDEN_KEYS. Authored by test-writer-agent per QK-6, not by this agent."
    },
    {
      "id": "PRV-12",
      "severity": "medium",
      "category": "retention",
      "location": "server/src/modules/identity/identity.repo.ts:83-110",
      "evidence": "email_encrypted (direct-pii) is nulled on the verified path (markVerified, :94) - the code DOES match the documented decision in schema section 6. But markBlockedUnparseable (:101-110) clears the token fields and deliberately leaves email_encrypted in place (correct per schema section 6, which retains it while status is 'pending' or 'blocked_unparseable_year' for resend and manual-fallback review), and nothing ever revisits those rows. Abandoned pending registrations - a user who enters an email and never confirms - therefore retain the encrypted raw address indefinitely, as do blocked_unparseable_year rows after manual review completes. The stance is right; what is missing is the bound: schema section 6 says 'transiently' and never says how long, and no mechanism exists to act on an answer (PRV-1).",
      "provenance": "server/src/modules/identity/identity.repo.ts:92-98 (markVerified nulls it), :101-110 (markBlockedUnparseable does not); server/src/shared/email-encryption.ts:4-13; docs/05-schema.md section 6 DPDP minimization bullet",
      "fix_hint": "Needs the T43 duration (OQ-PRV-1/2), then a job that nulls email_encrypted for pending rows older than the bound and for blocked rows past manual review. Do not invent the number."
    },
    {
      "id": "PRV-13",
      "severity": "medium",
      "category": "erasure_vs_ban",
      "location": "server/migrations/002_content.up.sql:34,56; server/scripts/admin-delete-identity.ts:36",
      "evidence": "question.author_profile_id and answer.author_profile_id are NOT NULL REFERENCES pseudonymous_profile(id) with no ON DELETE clause, so the DELETE FROM pseudonymous_profile in the admin script raises a foreign-key violation for any author who has ever posted. The only erasure tooling in the repo therefore fails on exactly the users most likely to request erasure. There is also no erasure route of any kind (executed sweep D returned nothing), so there is no DSR path for a student to invoke at all.",
      "provenance": "server/migrations/002_content.up.sql:34,56; server/scripts/admin-delete-identity.ts:36-39; executed sweep D (no erasure/DSR route in server/src/modules). FK violation not asserted against a live DB - deferred to T70 per OQ-PRV-3",
      "fix_hint": "T70 scope. The soft-delete design in schema section 6 already answers this - tombstone the profile and detach attribution rather than deleting the row - which is also what preserves content integrity for other readers."
    },
    {
      "id": "PRV-14",
      "severity": "medium",
      "category": "retention",
      "location": "server/migrations/002_content.up.sql:85 (provider_raw_response jsonb)",
      "evidence": "moderation_case.provider_raw_response stores the third-party classifier's raw payload verbatim, and such payloads customarily echo the classified text back. schema section 6 declares moderation_case NEVER DELETED (it is R6's auditable 100%-coverage proof). So from the moment T14b binds a provider, every moderated item gains a second, uncontrolled copy of its UGC - including anything a student typed about themselves or a third party - in a table with no delete path, and an erasure request could not reach it. No rows exist today: config.moderationProvider defaults to '' -> hold-all adapter, so no provider call is ever made.",
      "provenance": "server/migrations/002_content.up.sql:85; docs/05-schema.md section 6 (moderation_case never deleted); server/src/config/index.ts:76; server/src/modules/moderation/moderation.types.ts:31-33 (raw: unknown, 'stored as-is on the case')",
      "fix_hint": "Decide before T14b whether the stored payload should be the verdict fields only (tier/label/score/case-ref) with raw kept for a bounded window. Raised now precisely because it is cheap before a provider is bound and expensive after."
    },
    {
      "id": "PRV-15",
      "severity": "medium",
      "category": "third_party_flows",
      "location": "decisions/ (no processor records)",
      "evidence": "Two processors already receive personal data and neither has a DPA, terms link or processor record anywhere in the repo: the SMTP/email provider (raw address + OTP; email-provider.ts:86-93) and Supabase, the managed Postgres host, which holds every column in the inventory above including email_encrypted ciphertext. decisions/ contains 5 files, none about processors. Skill step 6 fixes an unrecorded processor at medium. The AI moderation provider is correctly absent: none is bound (config default '' -> hold-all), and the port carries no identity fields by construction (ClassifyInput = { text, contentType }, moderation.types.ts:18-21).",
      "provenance": "Executed ls decisions/ (oq-14-session-mechanism.md, oq-3-write-model.md, quality-kit-qk-decisions.md, schema-agent-v2.md, t54-moderation-vendor.md); server/src/modules/notification/email-provider.ts:86-93; server/src/config/index.ts:34; server/src/modules/moderation/moderation.types.ts:18-21",
      "fix_hint": "Record each processor in decisions/ with what crosses and a terms/DPA link. T54's decision doc is the template that already exists for the moderation vendor; the other two need the same one-pager."
    },
    {
      "id": "PRV-16",
      "severity": "low",
      "category": "leak_logs",
      "location": "server/scripts/admin-delete-identity.ts:13,32,42",
      "evidence": "The admin script takes the raw email as process.argv[2] (so it lands in shell history and process listings) and prints it to stdout on both the not-found path (:32) and the success path (:42, alongside the deleted pseudonym - which also creates a written pseudonym-to-email linkage, the exact correlation the whole design exists to prevent).",
      "provenance": "server/scripts/admin-delete-identity.ts:11-21, 30-46",
      "fix_hint": "Read the address from stdin rather than argv, and print only the hash prefix and the affected row count - never the address next to the pseudonym."
    },
    {
      "id": "PRV-17",
      "severity": "low",
      "category": "config",
      "location": "server/src/config/index.ts:39; server/src/shared/email-encryption.ts:15-24",
      "evidence": "EMAIL_ENCRYPTION_KEY is optional('EMAIL_ENCRYPTION_KEY', ''), and encryptEmail returns null when unset, so email_encrypted is silently written as NULL. The privacy direction of this failure is safe (less PII stored, not more), which is why it is low rather than high - but it is silent, and it breaks the resend and manual-fallback review paths that schema section 6 names as the column's whole purpose. Contrast DATABASE_URL, EMAIL_HASH_PEPPER_ACTIVE and SESSION_SIGNING_KEY, which all use required() and fail fast.",
      "provenance": "server/src/config/index.ts:34,37,39,44; server/src/shared/email-encryption.ts:11-12 comment ('real environments MUST set EMAIL_ENCRYPTION_KEY'), :15-24",
      "fix_hint": "Require the key when NODE_ENV is production, so the 'MUST' in the comment is enforced by the same required() the neighbouring secrets already use."
    },
    {
      "id": "PRV-18",
      "severity": "low",
      "category": "client_storage",
      "location": "client/src/session.ts:13,53-60",
      "evidence": "The client persists { token, profile } under localStorage key 'murmur.session'. The stored profile is pseudonymous only (id, pseudonym, year_badge, reputation_score, status - profile.repo.ts:9-15) and carries no identity material, and the tradeoff is explicitly reasoned in decisions/oq-14-session-mechanism.md section 7 (two-origin deployment). Recorded for inventory completeness, NOT disputed: the residual is that a 30-day token in localStorage is XSS-readable, which is a security-stage concern (T60/T62) rather than a data-protection one.",
      "provenance": "client/src/session.ts:13,37-60; server/src/modules/profile/profile.repo.ts:9-15; decisions/oq-14-session-mechanism.md section 7",
      "fix_hint": "None proposed - the decision is on record and this agent does not re-litigate it. Flagged so the security agent's XSS analysis has the data-exposure half already inventoried."
    }
  ],
  "counts": { "critical": 0, "high": 8, "medium": 7, "low": 3 },
  "gate_rule": "pass requires counts.critical==0 and counts.high==0 (unwaived)"
}
```
