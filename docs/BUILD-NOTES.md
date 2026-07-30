# Build Notes

Running record of implementation against `docs/07-plan.md`. This file is the mutable
build log; the frozen pipeline docs (01–07) are never edited here.

> **Human-owned work lives in [`HUMAN-TASKS.md`](./HUMAN-TASKS.md)** — every task Claude Code
> cannot do, ordered by what it unblocks, with step-by-step instructions.

---

## Milestone 1 — Tracer bullet (in progress)

**Scope reminder:** Claude Code builds backend + integration only. Visual components are
Claude Design's (rounds T9/T18/T25/T30/T39), per the stage-6 decision (plan `deviations[0]`).

### Done (Claude Code)
| Task | What landed |
|---|---|
| **T1** | `src/ui/app.css` was already absent (delete = no-op); `src/ui/mock-data.js` relocated to `client/src/mock-data.js` as fixture data; old `src/` removed. |
| **T2** | Node/TS modular-monolith scaffold: `server/src/{app,index}.ts`, module folders (`identity/`, `profile/`, `analytics/`, `notification/`), `worker/` skeleton (2-process shape), `shared/` cross-cutting layer, PWA client shell (`client/` manifest + service worker + typed `api.ts`), local dev env (`.env.example`, tsconfig, eslint). |
| **T3** | CI pipeline `.github/workflows/ci.yml`: lint, typecheck, migration apply+rollback, unit/integration/NFR tests against a Postgres service, + Layer-1 quality gates (gitleaks **blocking**, semgrep, osv-scanner). `.ci/README.md` maps the 3-layer cadence. |
| **T4** | Managed-Postgres migration framework (`server/src/db/migrate.ts`, forward+rollback, `schema_migrations`); **migration 001** (`identity_account`, `pseudonymous_profile` + enums + `set_updated_at`) — verbatim from schema §3.2/§3.3. |
| **T5** | Email/OTP Delivery Provider (`notification/email-provider.ts`): retry+backoff, resend, **registration blocked (never defaulted) if delivery unconfirmed**. `console` (dev) + `memory` (test) adapters; real adapter is an explicit stub that throws until configured. |
| **T7** | **A1** `POST /verification/initiate`: campus-domain allowlist, duplicate refusal via T50 hash, malformed rejection, resend cooldown + rate window on the schema's own columns. |
| **T8** | **A2** `POST /verification/confirm`: token validation/expiry (constant-time), A11 ban check, year derivation (**block-or-fallback, never guessed**), pseudonym + profile creation, returns short-lived session-bootstrap token (shape ready for T12). |
| **T44** | **Migration 006** (`analytics_event` + indexes) and **A12** `POST /events` — fire-and-forget, never blocks the primary action. |
| **T45** *(partial)* | Registration/activation funnel events emitted across A1/A2 (`registration-events.ts`). Full metric derivation is T46 (M6). |
| **T50** | Shared email-normalization + **versioned keyed-HMAC** utility (`shared/email-identity.ts`) — the one procedure A1 dup-check, A2 write, and A11 lookup all call. Versioned pepper (`v<n>:secret`) + `candidateHashes` for rotation-safe matching (RR-13). App-layer AES-256-GCM for `email_encrypted`. |
| **T55** | Identity-non-disclosure NFR test (`tests/nfr/identity-nondisclosure.test.ts`, criterion-ID named per QK-6): audits A1/A2 across success/blocked/refused/invalid branches for any raw-email / `email_hash` / `identity_account_id` / token leak. Plus DB-free T50 unit tests (`tests/unit/email-identity.test.ts`, RR-7/RR-13). |

### Verified locally
- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm test` (unit subset, no DB) — 7/7 green.
- Server boots; `/health` honestly reports `degraded` without a DB; A1 `email_malformed` and `email_domain_refused` branches return the correct uniform error envelope.
- **Not run locally:** integration/NFR suite + migrations — no local Postgres. These run in CI (Postgres service) and against the T49 staging DB. **Nothing that requires a DB has been claimed as passing.**

### Claude Design import (2026-07-21, via DesignSync MCP)
- **Project:** "Murmur email entry form" (`ecb9e3e6-…`, owner: rishi, edit access granted).
- **Artifacts present (ahead of the plan's per-round schedule):** all 17 screen components
  `S1`–`S17` as `.dc.html`, **plus** a `Landing Page.dc.html` and the shared `support.js`
  design runtime (`<x-dc>` template + `DCLogic` class React-preview format).
- **T9 (Claude Design round 1) — effectively delivered:** S1–S4 components exist in the design
  project. Per the human decision, screens are pulled into `client/src/components/` **at each
  integration milestone** (S1–S4 when T10 starts), not bulk-copied. `support.js` + the trimmed
  `Landing Page.dc.html` are already in `client/src/components/`.
- **Landing-page scope-trim (this session):** the designer's landing page marketed four
  features; three were **out of frozen v1 scope** and were removed to reconform to the
  senior-advice wedge — *Campus discussions*, *Roommates* (**P2-A**, deferred), *Find your
  people*. Replaced with in-scope Q&A pillars: *Ask seniors anonymously* (R3), *Answers you can
  trust* (R2+R6), *Search every batch* (R4); nav "Campus life" link removed. Hero/safety/
  how-it-works/CTA were already on-message and kept. Trimmed version **synced back** to the
  design project. Note: no landing *screen* exists in the frozen 04-ux/06-ui — it's a
  designer-added marketing surface, pre-S1, outside the S1–S17 inventory.

### Blocked on human / external inputs (not startable by Claude Code)
- **~~T6 (human)~~ — delivered.** `identity/year-parser.ts` now carries the founder-documented `nitj.ac.in` rule (trailing 2-digit admission segment, e.g. `…s.mc.24` → 2024) with `plausibleYear()` bounds; the `example-college.edu` placeholder is gone. Null-on-ambiguity contract intact.
- **~~T9 (Claude Design round 1)~~ — delivered** (see above); S1–S4 ready for T10 integration.
- **T49 (human/infra):** minimal staging deployment (managed app platform + managed Postgres) for the T11 real-phone demo.
- **T54 (human/eng):** AI-moderation vendor shortlist + quotes (parallel track; feeds T14/M2).

### Next Claude Code steps once inputs arrive
- **T11** tracer demo (needs T49).
- **T60/T61** M1 security-agent + privacy-agent runs (warn-only) — runnable now, not yet run
  (`docs/gates/` holds only `taste-gate.json`).

---

## Milestone 2 — Q&A core (in progress)

### Done (Claude Code)
| Task | What landed |
|---|---|
| **T13** | **Migration 002** (`topic_tag`, `question`, `answer`, `moderation_case`) verbatim from schema §4, the §5 indexes, `updated_at` triggers, and the fixed 5-topic seed (placements/internships/professors/courses/advice). Each migration introduces only the enums its own tables use; reputation/sync/grievance/draft enums land with 003–005. |
| **T14a** | **Moderation Gateway, provider-agnostic** (`modules/moderation/`). The A7 port (`ModerationProvider`), tiered cheap-first routing, `moderation_case` lifecycle, **fail-closed hold**, retry/backoff worker job, auto-escalation past the attempt ceiling. Split out of T14 by the plan's fourth revision so it needs no vendor. **Default with `MODERATION_PROVIDER` unset: `hold-all`** — an adapter that returns no verdict for any input, so every item holds `pending` and nothing publishes. Outage and no-provider are literally the same code path (one `ProviderUnavailableError`, one handler), which is why the T56 outage drill exercises the posture the app actually runs in until T14b/M6. A **test-only** `fixture` adapter (marker-driven: `[[moderation:pass\|block\|escalate\|timeout]]`) makes the verdict branches testable; `resolveProviders()` refuses to construct it unless `NODE_ENV=test`. |
| **T15** | **A3** `POST /questions`: idempotency-key replay (pre-check *and* unique-constraint race handling), topic validation against the seeded set, ban/suspend guard via `requireSession`, moderation gate before publish. Held content returns **202**, not 201 — "accepted, not published" is the literal truth and S6/S12 must not render it as live (RR-5). |
| **T16** | **A4** `POST /questions/:id/answers`: threading under a **published** parent only (answering a held question would disclose it exists), parent-not-found → `parent_question_not_found`, same idempotency/moderation shape as A3. Increments the parent's cached `answer_count` on publish — provisional; full aggregate maintenance is T21/M3. |
| **T17** | **A5 browse half** `GET /questions`: recent-published feed for S5, published-only, topic filter, keyset pagination on `published_at`. Empty feed returns an **explicit inviting empty state, not an error** (R4 AC2). Plus `GET /questions/:id` (S7 thread) and `GET /topics`. Full keyword/cohort search is T20/M3. |
| **T51** *(partial)* | M2 event hooks for the Q&A core (`content-events.ts`): question/answer submitted + a `moderation.outcome` event bucketed `auto_passed`/`auto_blocked`/`escalated`/`held_unavailable`. The last bucket is kept distinct from `escalated` on purpose — while no provider is bound, collapsing them would hide the difference between "a human should look" and "the provider never answered". WAU/session-ping hooks still to come with T19. |
| **T56** | Moderation-coverage + failure-posture NFR tests (`tests/nfr/moderation-coverage.test.ts`), criterion-ID named per QK-6: reconciliation (published count == cleared-case count), orphan-case check, published-without-cleared-case check, outage drill (0 auto-publishes), held-not-dropped, auto-escalation past threshold, and held-content-invisible-to-others. |
| **T12** | **Session mechanism — resolves UX OQ-14** (`decisions/oq-14-session-mechanism.md`). Stateless signed tokens, **no session table** (schema stays frozen); A2's token is re-specified as a 15-min **bootstrap** credential traded at `POST /session/exchange` for a 30-day **session** token; `typ` is signed and checked, so the two are not interchangeable. Sliding refresh via `X-Session-Refresh`. Revocation without a session table: `requireSession` reads `pseudonymous_profile.status` live, so a ban lands on the next request. Dedicated versioned `SESSION_SIGNING_KEY` retires M1's reuse of the email-hash pepper. Client: `client/src/session.ts` persistence + boot-time restore in `main.ts` (no re-verification on re-open). |

### Verified against a real Postgres (this session)
The M1 note below that "nothing DB-backed has been verified" no longer holds — `DATABASE_URL`
points at a live Postgres with migrations 001/006 already applied.
- **T13:** apply → rollback → re-apply cycle leaves an identical schema (4 tables, 3 enums,
  16 indexes, 5 seed rows); 001/006 tables untouched.
- **T12:** 14/14 endpoint checks green — exchange, `typ` separation in both directions,
  missing/garbage credentials, ban/suspend/soft-delete revocation, sliding refresh, and no
  identity material in any session response.
- Both runs were **scoped**: they created and then deleted only their own rows (row counts
  returned to 10/2/21 exactly). The truncating suites in `tests/integration` + `tests/nfr`
  were **not** pointed at this database — they need a disposable one, and CI provides it.
- Local: `typecheck`, `lint`, client `tsc`, and `vitest run tests/unit` (22/22) all clean.
  Bare `npm test` still fails locally on the two DB-backed suites, which throw rather than
  skip when `DATABASE_URL` is unset — by design (plan §5).

### Fixed along the way (pre-existing, found by this work)
- **Migration runner rollback targeted the wrong migration.** `migrate.ts down()` picked the
  highest-*version* applied migration, not the most recently *applied* one. Since 006 was
  applied ahead of 002, `npm run migrate:down` would have dropped `analytics_event`. It now
  reads `schema_migrations.applied_at`.
- **T55 NFR fixture was stale after T6 landed.** `identity-nondisclosure.test.ts` still
  expected `2023cs1234@example-college.edu` to verify as year 2023; with the real `nitj.ac.in`
  rule that address has no rule at all and returns 422, so `test_R1_identity_nondisclosure_A2_verified_success`
  was failing in CI. Fixtures updated to the shipped format and re-verified (year 2024 derived;
  `principal@nitj.ac.in` still blocks). CI now also sets `SESSION_SIGNING_KEY` — without it the
  new config key would have failed every job at import.

### Verification status of this session's work — read this before trusting it

**Verified:** `npm run typecheck` clean · `npm run lint` clean · `npx vitest run tests/unit`
**35/35 green**, including the new DB-free suites (`moderation-providers.test.ts` 6,
`content-routes-smoke.test.ts` 7). The smoke suite proves the content routes are mounted and
every one sits behind `requireSession` (401, not 404), and that an unconfigured provider
resolves to `hold-all`. The startup warning fires as designed.

**NOT verified — stated plainly:** the DB-backed suites (`tests/integration/content.test.ts`,
`tests/nfr/moderation-coverage.test.ts`) **have not been executed**, and neither has any of the
~24 raw SQL statements T14a/T15/T16/T17 introduce. There is currently no way to run them:

- no Docker and no local Postgres on this machine;
- **no git remote**, so the T3 CI pipeline has never run at all — "it runs in CI" is not a real
  verification path today;
- the only configured database is the live Supabase instance holding **real data**, which these
  suites truncate. Its direct host `db.<ref>.supabase.co` is also **IPv6-only** and unreachable
  from this IPv4 network (`ENOTFOUND`), so even the read-only EXPLAIN check could not run.

Two things were added in response rather than papering over it:

1. **A truncation guard** in `tests/helpers/test-db.ts`. `truncateAll()` now refuses to run
   unless the database name contains `test` or `MURMUR_TEST_DB_CONFIRM=i-am-disposable` is set.
   Previously the only thing between the real database and `TRUNCATE` was whichever
   `DATABASE_URL` happened to be exported.
2. **`npm run sql:check`** (`scripts/sql-explain-check.ts`) — runs `EXPLAIN` (plan only, never
   `ANALYZE`, inside a rolled-back transaction, so nothing executes) over every new statement.
   It catches wrong columns, bad jsonb operators, and parameter type-inference failures that
   `tsc` cannot see. **Written but never run**, for the connectivity reason above.

**To close this gap** (in order of value): point `DATABASE_URL` at a disposable Postgres whose
name contains `test` — a free Neon database or a second Supabase project — then
`npm run migrate && npm test`. On an IPv4-only network use Supabase's **pooler** host, not the
direct one. Failing that, `npm run sql:check` against any reachable copy of the schema is a
cheap partial signal.

### Next
- **T14b** Moderation provider binding — **M6** now (needs **T54**). Until it lands the app
  holds every question and answer and publishes nothing outside the test suite. That is R6's
  fail-closed posture behaving correctly, not a defect (plan RR-21).
- **T18** Claude Design round 2 (human) — QuestionFeedCard, AskComposer, QuestionThread, AnswerComposer.
- **T19** Integrate S5–S8 — blocked on T18 only; T15/T16/T17 are done.
- **T60/T61** M1 security-agent + privacy-agent runs (warn-only) — still not run.
- `client/src/screens/signed-in-stub.ts` is scaffolding: delete it when S5 lands.

### Config a real environment must set (see `.env.example`)
`DATABASE_URL`, `EMAIL_HASH_PEPPER_ACTIVE` (real secret, `v1:...`), `EMAIL_ENCRYPTION_KEY`
(base64 32-byte), `CAMPUS_EMAIL_DOMAINS` (launch campus), `EMAIL_PROVIDER` (+ real adapter).
