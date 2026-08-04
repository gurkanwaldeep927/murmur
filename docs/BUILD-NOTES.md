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
- **Project:** "Murmur email entry form" — record the **full** UUID, never a truncated one:
  `ecb9e3e6-a250-49f3-9b7a-f356994a9f54` (owner: rishi, edit access granted).
  URL: https://claude.ai/design/p/ecb9e3e6-a250-49f3-9b7a-f356994a9f54
  **Its `type` is `PROJECT_TYPE_PROJECT`, not `PROJECT_TYPE_DESIGN_SYSTEM`** — so DesignSync
  `list_projects` (which filters to design-system projects) does **not** return it. It is
  reachable only by passing this UUID directly to `get_project` / `get_file`. A truncated
  UUID plus that invisibility cost a full session of "the design project is gone"; it is
  not gone, and re-verified present on 2026-08-01 with all 17 screens.
  Note: the project also holds an `uploads/nit/` snapshot of this repo (source + pipeline
  docs, no `.env`). If the share link is "anyone with the link", that snapshot is public.
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
- **T11** tracer demo (needs T49) — the only M1 task still open.
- **~~T60/T61~~ — run 2026-07-30.** `docs/gates/` now holds `security-gate-M1.json`,
  `privacy-gate-m1.json` and `14-resilience-T63.gate.json`; findings are in the M2 section.
- **T10 was completed but never recorded here.** `client/src/screens/` holds the ported
  S1–S4 flow (`email-entry.ts`, `verification-pending.ts`, `token-confirm.ts`,
  `registration-outcome.ts`, `verification-flow.ts`), each carrying the designer's markup and
  copy verbatim with real handlers substituted for the mock `DCLogic`. That is the pattern
  T19 follows.

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

### Quality gates T60/T61/T63 — run 2026-07-30, and the critical they found

Run as independent agents per the plan (security-agent, privacy-agent, resilience-agent),
deliberately *not* by the author of the code under audit — DECISION QK-3's separation.
Reports: `docs/16-privacy.md`, `docs/14-resilience.md`, gate records in `docs/gates/`.
**`docs/08-security.md` was not written** — see OQ-SEC-06 below.

**CRITICAL, fixed (OQ-SEC-01).** `EMAIL_HASH_PEPPER_ACTIVE` was running as the literal
`.env.example` placeholder `v1:change-me-in-every-real-environment` — a value published in
git. Every `identity_account.email_hash` was therefore keyed with a pepper any reader of the
repo knows, and since campus addresses are low-entropy (`first.last.YY@nitj.ac.in`) that
reduces the HMAC to a confirmation oracle against the product's core anonymity promise.
Three changes:

1. **Rotated** to a fresh `v2` pepper; the exposed value moved to
   `EMAIL_HASH_PEPPER_RETIRED` so existing `v1$…` hashes still match during the dual-hash
   window (RR-13).
2. **Made lookups rotation-safe first — this was a prerequisite, not a nicety.**
   `ban-check.ts` already used `candidateHashes` (active + retired), but the A1/A2 duplicate
   check used `hashNormalizedEmail` (**active only**). Rotating without fixing that would have
   made A1 compute `v2$…` against rows holding `v1$…`, silently stop recognising every
   existing account, and let registered students register again — RR-7's failure mode reached
   through the rotation RR-13 mandates. New `findByAnyEmailHash` widens reads; writes still
   use the active pepper so the rollout converges. Pinned by
   `tests/unit/pepper-rotation-lookup.test.ts` (`SECREG-RR13-LOOKUP`).
3. **Added a boot guard** (`config/index.ts` `requiredSecret`): the service now refuses to
   start if a keying secret still contains a `.env.example` placeholder marker. A comment
   saying "change me in every real environment" demonstrably did not prevent this; refusing to
   boot does. Exempt under `NODE_ENV=test`. Verified to fire in dev and not false-positive.

**Not yet fixed** — carried forward for the next batch: RES-1 (unvalidated `ProviderVerdict`
→ NOT NULL violation), RES-3 (non-provider errors freeze the attempt counter, so held content
can never escalate to a human — breaks R6 AC3), RES-2 (lazy provider resolution defeats the
"fail at startup" comment), PRV-5 (`authorization` header not in the pino redact list — live
session tokens in logs), PRV-6 (`EMAIL_PROVIDER` defaults to `console`, which logs raw address
+ OTP), PRV-7 (A12 `POST /events` unauthenticated), PRV-2 (`admin-delete-identity.ts`
hard-deletes and currently defeats the ban).

**OQ-SEC-06 — stage-08 doc frozen, my sequencing error.** T60/T61/T63 were spawned in
parallel; T61 and T63 finished first and created `docs/16-privacy.md` and
`docs/14-resilience.md`, which tripped the guardrail rule freezing `docs/0N-*.md` once a
higher-numbered stage doc exists. Stage 08 was frozen out by stages it should have preceded.
The agent correctly refused to self-grant `.pipeline/unlock`. Findings are intact in
`.pipeline/sec/handoff-08-security.json`. **Lesson: run stage gates in stage order, not in
parallel.**

**~~OQ-SEC-02~~ — RESOLVED 2026-08-01.** Was: "the Layer-1 toolchain has never produced a
signal." The diagnosis was half wrong — the tools never needed local installation, because the
workflow provisions all three itself (gitleaks action, semgrep container, `npx osv-scanner`).
The only real blocker was the missing git remote. With the repo pushed, all three ran and
passed, and **T62 now has real evidence to judge**.

**~~OQ-R1~~ — DOWNGRADED 2026-08-01.** Was: "no disposable Postgres; half of stage 14 is
unexecuted." A disposable Postgres now exists and the full suite is green, so the
integration/NFR half is executable. **T67 at M4 is still blocking**: kill-mid-batch and
latency injection work against this instance, but the restore drill (RPO/RTO) needs a
database whose backups can be destroyed and restored. Still the longest-lead item.

### Verification status of the 2026-07-30 session — **SUPERSEDED 2026-08-01**

> Everything below this heading was true on 2026-07-30 and is **no longer true**. A reachable
> disposable Postgres now exists and the full suite runs green. Kept verbatim because the
> reasoning that follows is what a future session will otherwise re-derive from scratch — the
> "there is no way to run them" conclusion was correct then and wrong now. See the
> 2026-08-01 section below before acting on any claim in this one.

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

### 2026-08-01 — first green full-suite run, and the five bugs it took to get there

**Result: 86/86 green** across 9 files (content 23, session 12, identity-nondisclosure 5,
moderation-coverage 7, unit 39) against real Postgres. `sql:check` 25/25. This is the first
time in the project's history that the DB-backed suites have executed at all.

**Connectivity (the thing that unblocked everything).** `DATABASE_URL` now uses Supabase's
**session pooler** — `aws-0-ap-southeast-2.pooler.supabase.com:5432`, user
`postgres.<project-ref>`, `sslmode=no-verify`. The direct `db.<ref>.supabase.co` host has no
A record and is unreachable on an IPv4-only network; the pooler publishes IPv4. This was
never a code problem. *Partial* SEC-002: traffic is encrypted but the certificate is not
verified (Supabase chains to its own CA and node-postgres treats `sslmode=require` as
`verify-full`). Full fix = pin Supabase's CA via `sslrootcert`.

**The database is disposable, established by evidence not assumption.** `npm run db:inventory`
showed all 10 `identity_account` rows created inside a 2h20m window on 2026-07-22 — one dev
session, not organic traffic — with 0 questions and 0 answers. The app has never been
deployed (T49 outstanding), so no external user could have reached it. Those rows are now
gone; the suites truncated them.

**Two product defects, both fatal on every call, both on the publish path:**
- `moderation.repo.ts` `recordVerdict` — `$7` assigned to a `moderation_status_enum` column
  *and* compared to a bare `'pending'` literal. Postgres deduces two types for one parameter
  and refuses to parse. Never ran, not once.
- `moderation.gateway.ts` publish-question — the same defect on `$2`. The publish-answer
  UPDATE beside it was fine because it uses `$2` once.

Both fixed by casting every use (`$n::moderation_status_enum`). Both now confirmed
*behaviourally*, not just syntactically: `test_R6_auto_blocked_question_is_not_published`,
`test_R6_author_can_see_their_own_held_question_but_the_feed_cannot` and
`test_R4_feed_excludes_pending_and_blocked_content` all pass.

**Three defects in the verification layer — which is why the two above survived:**
- `sql:check` ran every statement in one transaction, so the first failure aborted it and
  Postgres rejected the remaining 23 with "current transaction is aborted". It reported 1 bug
  as 23 *and hid the second real bug behind the first*. Now one SAVEPOINT per statement.
- `.env` was never loaded into the test process: each DB suite checks `DATABASE_URL` in
  `beforeAll` *before* the dynamic import that pulls in `config` (the only importer of
  `dotenv/config`). The suites were unrunnable locally no matter what database existed.
  Fixed with `setupFiles: ["dotenv/config"]`.
- Test files ran in parallel against one shared database while each truncated it in
  `beforeEach` — 26 failures, every one false. Fixed with `fileParallelism: false`. **This
  would have hit CI identically** and presented as an intermittent race.

**Lesson worth carrying:** all three of the second group are in the machinery meant to catch
defects. The product bugs survived because nothing above them could see. Prefer fixing the
observer before trusting its report — a green suite that cannot run is worth less than a red
one that can.

**SEC-017 closed.** `tests/helpers/test-db.ts` no longer accepts a blanket
`MURMUR_TEST_DB_CONFIRM`; it requires `MURMUR_TEST_DB_ALLOW=<host>/<database>` matching the
live connection, so a stale variable stops matching the moment `DATABASE_URL` moves. Supabase
names every database `postgres`, so the name heuristic can never pass there — this is the
route that makes managed Postgres usable without disarming the guard entirely.

**OQ-R1 downgraded, not closed.** A disposable Postgres now exists, so the integration/NFR
half of stage 14 is executable. **T67 still needs more**: kill-mid-batch and latency injection
are fine against this instance, but the restore drill (RPO/RTO) needs a database whose backups
can be destroyed and restored — plan for that before M4.

**Run the suite with:**
```
MURMUR_TEST_DB_ALLOW="aws-0-ap-southeast-2.pooler.supabase.com/postgres" npm test
```
Expect ~5 minutes: files are serialised and every query is a round trip to Sydney.

### 2026-08-01 (later) — repo pushed, CI green on its first run, T18 landed

**The repo has a remote: https://github.com/gurkanwaldeep927/murmur (private).** T3's CI
pipeline, written 2026-07-21, **executed for the first time** and all four jobs passed:

| Job | Result |
|---|---|
| `build-test` | green — typecheck, lint, migrate up/down/up, **sql:check 25/25**, **86/86 tests** |
| `secrets-scan` (gitleaks, **blocking**) | green — full history, no findings |
| `sast` (semgrep) | green |
| `sca` (osv-scanner) | green |

**86/86 in 6.8 seconds**, against 298 s locally. The entire difference is round-trip latency:
CI's Postgres is on localhost, the local run talks to Sydney. Use CI as the fast feedback
loop and the local run as the pre-push check.

**SEC-014 closed** — "designated blocking control has never executed" no longer holds. gitleaks
independently confirms the `detect-secrets` history result (0 findings). **T62 is unblocked**:
it now has three tools' output to judge instead of nothing.

**The scanner-installation problem was never real.** `gitleaks`, `semgrep` and `osv-scanner`
are all provisioned *by the workflow* (an action, a container, and `npx` respectively). They
never needed to exist on this machine. The single blocker was the missing remote.

**`npm run verify`** = `typecheck && lint && sql:check && test` — the ladder as one command,
and CI mirrors it step-for-step. When local and CI check different things, the gap is where
defects live: `fileParallelism` would have been a mystery intermittent red build otherwise.
`sql:check` is now a CI step for the same reason — it is the only rung that reads inside a SQL
string, and it earned the slot the first time it ran.

Also added: a `concurrency` group per ref with `cancel-in-progress`, so consecutive pushes stop
queueing full runs that contend for one Postgres service.

**T18 done — and it was a copy job, not a design session.** `S5 QuestionFeedCard`,
`S6 AskComposer`, `S7 QuestionThread`, `S8 AnswerComposer` pulled verbatim from the design
project into `client/src/components/`. Unlike S1–S4 (ported at T10, sources discarded) the
`.dc.html` files are **kept** — the source is the only reference for a re-port.
`client/src/components/README.md` carries six integration notes found while porting; the two
that change T19's scope:

- **S6 and S8 tell the user a held post "usually takes a few minutes."** Under `hold-all`
  nothing publishes at all, so the truthful answer is indefinite. RR-5 forbids rendering held
  content as live and this copy does not claim that — but the promise is still false in the
  posture that actually ships. T19 must not use the sentence as-is before T14b.
- **S7 renders vote counts, reputation scores and an accepted badge.** A6 and the reputation
  ledger are **T21/T22 in M3**. Render read-only or hidden at M2 — a vote button that silently
  does nothing is worse than no button.

Plus: "Report quietly" targets S13 (M5); S6's topic chips are labels (`Placements`) while A3
expects seeded slugs (`placements`, map via `GET /topics`, never by lowercasing); S5's field
names already match `QuestionRow`; and S7's blocked-state wording matches
`test_R6_author_can_see_their_own_held_question_but_the_feed_cannot` — keep it.

**M2 now:** T19 (size L, the last feature task) → T51 → **T62** (blocking gate, runnable).

### 2026-08-02 — T19 landed, and the client was outside every gate until it did

**The client had never been checked by anything.** Root `tsconfig.json` excludes `client/`,
`.eslintrc.cjs` ignored it, `vitest.config.ts` covers only `tests/**` and `server/src/**`,
and the CI workflow never ran `client/`'s own typecheck. S1–S4 shipped at T10 with *nothing*
verifying them, and T19 was about to add four more screens on the same terms.

This is the same shape as 1 August: not a bug in the product, a hole in what watches it.
Fixed first, as its own commit, so the new screens were checked from their first line —
`npm run typecheck:client` in the ladder and in CI, eslint extended over `client/src` with a
browser env, and `npm ci --prefix client` in the workflow (its deps are not in the root
lockfile).

**It paid for itself on the first run.** `tsc` caught that a separate `isOutcome` boolean
does not narrow a union, so both composers were passing the phase `"form"` into a function
typed for `ModerationStatus`. Under the old arrangement that would have shipped.

**What landed.** S5–S8 ported into `client/src/screens/` on the T10 pattern, wired to
A3/A4/A5-browse through a new `app-shell.ts` controller. `main.ts` mounts the real shell and
`signed-in-stub.ts` is deleted. `client/src/lib/` holds the pure logic — deliberately
import-free and DOM-free, which is the only reason the root suite can execute it; 22 unit
tests cover the R6-critical mappings (a held item never maps to a published view state; only
a published question is answerable) plus time/badge/avatar formatting.

**Affordances the backend cannot honour are absent, not inert** — a control that looks live
and does nothing is worse than no control. Vote/reputation (A6 is T21/T22), "Report quietly"
(S13 is M5) and the Search/Profile nav (M3) sit behind `FEATURES` flags with the designer's
markup kept in the tree, so each unblocking task flips one boolean. The accepted badge and
reputation chip are *not* flagged: they render off real fields that are false/zero until M3,
so they self-activate and there is nothing to remember to remove.

**Two design gaps went to Claude Design round 3** rather than being papered over here
(`docs/design-prompts/T19-round-3.md`): the pending card's "usually takes a few minutes",
which is untrue under `hold-all` where the real wait is indefinite; and the fact that no
`blocked` outcome card was ever drawn, though A3/A4 can return one. Both interims render the
**server's own message** in the paragraph slot — the headings, layout and colour stay the
designer's, and no copy was invented by Claude Code. Three smaller items are in the same
document: the "My Posts" CTA (S12 is M4/M5), real pseudonym shape, and the year badge.

**Two findings worth keeping:**
- Real pseudonyms are `quiet-otter-4821` — lowercase `adjective-noun-NNNN`, about double the
  mock's length, and the noun list is mostly *not* animals. The mocks' pseudonym→emoji
  dictionary could never have worked against real data.
- `year_badge` is stored bare (`"2026"`) while every design chip reads `'26 batch`.
  `formatYearBadge()` is now the one place that closes the gap — **including for S4, which
  had been rendering the raw year since T10.**

> **⚠️ The ui-critique-rubric pass (plan §5's visual-QA loop) was NOT EXECUTED.**
> Its signal is a rubric score against the `docs/06-ui.md` §3.5–3.8 briefs from
> *screenshots of the rendered app*, and there is no deployed app to render — T49 is still
> open and the local stack needs the API, a database and a browser driver running together.
> Recorded as not run rather than substituted with a code-read review and called a pass.
> **T19 is therefore complete on integration and open on visual QA.** Close it when T49
> lands, or run it locally per §7 of the plan.

### 2026-08-02 (later) — the M3-entry fix list: PRV-5, PRV-6, RES-1, RES-2, RES-3

Five gate findings closed, each with a `SECREG-` regression test, and each test verified by
reverting the fix and watching it fail. 108 → **136 tests**.

**PRV-5 — live session tokens in the logs.** `pino-http` serializes `req.headers` and
`res.headers` wholesale, and the redact list covered only application fields. So every
authenticated request wrote a working `Bearer` token to stdout, and every sliding refresh
wrote a **newly minted** one back in `x-session-refresh` — that second one leaks even on
requests that arrived with no credential. Client IP went out with both. **Confirmed by
reading a real dev log during the T19 smoke test**, not by re-reading the gate report.
`REDACT_PATHS` is now exported so the test pins the real list rather than a copy of it;
two of its cases assert that ordinary fields (method, URL, status) still survive, because
redaction that swallows everything is how redaction gets removed.

**PRV-6 — raw email + live OTP to stdout, by default.** `EMAIL_PROVIDER` defaults to
`console`, whose adapter prints the student's address and their one-time code, bypassing
pino entirely. A production deploy that merely *forgot the variable* would have published
every student's identity and login code to its log aggregator. Both non-delivering
adapters (`console`, `memory`) now refuse to construct outside `development`/`test`, and
because the module builds its provider at import, that refusal stops the boot. Allowlist,
not `!== "production"` — staging is not development. Same remedy as OQ-SEC-01: a comment
saying "never do this in prod" did not work; refusing to start did.

**RES-3 — held content with no route to a human.** The gateway rethrew any error that was
not a `ProviderUnavailableError` *without recording the attempt*, so for those failures the
counter never advanced, `attempts >= moderationMaxAttempts` was never reached, and the
retry worker re-ran the same failure forever. The item stayed held, invisible, undecidable
— breaking **R6 AC3**, and invisible by construction: no user sees it and nothing alerts on
it. Every failure now advances the counter, so the ceiling is reachable by every route into
the catch. Bookkeeping failure (database down) is handled separately and still reports held,
because no path here may publish.

**RES-1 — a malformed verdict became a 500.** `ModerationProvider` is a port; from M6 its
implementations translate vendor JSON, which TypeScript cannot check at runtime. A verdict
with an absent or unrecognised `tier` flowed into `TIER_TO_STATUS[...]` → `undefined` →
NOT NULL violation inside `recordVerdict`. Now validated at the boundary and converted to
`ProviderUnavailableError`: **an unusable verdict is no verdict**, which is a state that
already has a correct handler. Worth fixing before T14b, not during it.

**RES-2 — "fails at startup" was not true.** `resolve()` throws a deliberate error for an
unknown or test-only provider and its comment claimed startup, but resolution was lazy
inside `classifyTiered` — so a deployment naming a provider that does not exist booted
green, passed health checks, and broke on the first student's post. `initModerationProviders()`
is now called by both process entrypoints before either accepts work. The regression test is
structural (does the entrypoint call it), because the defect was structural: the logic was
already right, it just was not reachable from where it mattered.

**Still open from the gate lists:** PRV-7 (`POST /events` unauthenticated, arbitrary
metadata into a never-deleted table) and PRV-2 (`admin-delete-identity.ts` hard-deletes and
defeats the ban) — PRV-2 is properly **T24**'s job, since the ban record it must survive
does not exist until M3.

### 2026-08-02 (later still) — the identity surface: SEC-004, SEC-007, PRV-7/SEC-009

**A correction worth recording first.** The previous entry called RES-1/2/3 + PRV-5/6 "the
M3-entry fix list", which read as if it were the outstanding work. It was one triaged slice.
The three gates produced **40 findings** (18 SEC, 8 PRV, 14 RES); this batch takes the total
fixed to **11**. The rest were never triaged, which is exactly how a backlog becomes
invisible. Full status is in the gate JSONs plus `.pipeline/sec/handoff-08-security.json` —
`docs/08-security.md` still cannot be written (OQ-SEC-06).

**SEC-004 — unlimited OTP guessing (HIGH, and the worst of the three).** A2 counted
nothing. `verification_attempt_count` exists but counts *sends* — A1's resend path
increments it — so a 6-digit code accepted unlimited guesses and was exhaustible in
minutes. That defeats email verification, which is the gate every other control in the
product assumes held. Migration **007** adds a separate `verification_confirm_attempt_count`
(deliberately not reusing the send counter: they bound different attacks, have different
ceilings, and reset at different moments — conflating them would let a resend silently
restore guesses).

The subtle half is *where* the increment happens. A2's invalid-token throw rolls its
transaction back, so a counter incremented inside it would be discarded and the cap would
never engage — the same shape as RES-3's frozen counter, one day apart. Credential checking
now happens before the transaction opens and records failures on the pool. At the ceiling
the **token** is burned, not the account: the student can still request a fresh code, but
the value being ground against stops existing. Every rejection returns the same
`token_invalid_or_expired`, so lockout is not observable — a distinct "too many attempts"
reply would confirm the address is registered (the SEC-008 oracle) and tell an attacker
exactly when to rotate.

**SEC-007 — nothing bounded a caller cycling addresses.** The per-email cooldown bounds one
*address*; it is blind to one caller working through thousands of fresh ones, each looking
like a first-time signup. That path sends unbounded mail on the project's own SMTP
credentials. `shared/rate-limit.ts` adds per-caller hourly ceilings on initiate, confirm and
`/events`. Buckets are keyed by a truncated HMAC of the address under a per-process salt —
client IP is personal data and a deanonymisation vector, the same reasoning that put
`req.remoteAddress` in the redact list. Expired windows are swept, because a limiter keyed
by attacker-controlled input that never evicts is itself a denial-of-service tool.

> **`TRUST_PROXY` must be set correctly at deploy time (T49).** The limiters bucket by
> `req.ip`. Behind a load balancer with Express's `trust proxy` unset, every request reports
> the *proxy's* address, all callers share one bucket, and the limiter locks out the entire
> campus at once. Left unset by default because trusting a forwarded header no proxy
> rewrites is the opposite failure — a caller spoofs `X-Forwarded-For` and gets a fresh
> bucket per request.

**Known limitation, written down rather than left implicit:** the limiter is in-process. At
N instances the effective ceiling is N × the configured value. A shared store is the
textbook answer and the TRD admits no second datastore at v1 scale; per-instance is
strictly better than the current zero. Revisit when the deployment stops being
single-instance.

**PRV-7 / SEC-009 — the event ingest was worse than "unauthenticated".** It accepted a
client-supplied **`actorProfileId`**, so any anonymous caller could attribute events to any
profile: every per-user metric was forgeable by anyone who could reach the endpoint. It also
took any `eventType` string and an open `Record<string, unknown>` of metadata — into a table
nothing deletes from (PRV-1), making it an indefinite store for whatever a caller sent,
including the raw email addresses this product exists to keep out of the database.
Attribution is now *derived* from a session token (the body field is refused outright, so an
old client finds out rather than silently losing attribution), event names are an allowlist,
and metadata is flat primitives, bounded in count and length, with email-shaped strings
refused. It stays public by necessity: the registration funnel it measures happens before
anyone has a session (R8).

**The rate limiter broke 14 of 23 content tests, and that was correct.** Every supertest
request arrives from one caller, so a suite signing in a few students exhausts an hour's
signup budget. Fixed by resetting the limiters in `truncateAll()` rather than relaxing the
ceilings under `NODE_ENV=test` — the suite now runs against the **production** numbers, so a
real flow that outgrows one fails a test instead of surprising a student. Verified by
disabling the reset: 14 failures return.

**One diagnostic note.** A full run mid-batch showed 9 failures that moved between runs and
did not reproduce when the same files ran alone; a connection probe showed the Supabase
pooler dropping connections under repeated full-suite load ("Connection terminated
unexpectedly"), not a defect. Worth knowing before chasing a phantom: **failures that move
between runs against remote Postgres are the pooler, not the code** — but confirm by
re-running the files in isolation before believing it.

### 2026-08-04 — the storage surface was open, and the gate JSONs are stale

**Read this first: the gate JSONs are no longer ground truth.** Spot-checking before starting
found `SEC-017` recorded open while `tests/helpers/test-db.ts:20-56` already carries its fix.
So the "40 findings, 11 fixed, the rest never triaged" figure in the entry above is not a
count anyone should act on — some unknown number of the remaining 29 are already closed, and
nobody knows which. Every finding below was re-verified against the code or the live database
before being worked on, and that is now the required standard: **do not act on a gate JSON
without re-checking it.** T62's run re-establishes ground truth for the SEC set.

**Session shape.** M2 cannot exit without T62, and T62 is an authz-focused run. Three open
findings sat in exactly the class it audits, so they were fixed first — otherwise the gate
spends its run re-reporting what we already knew.

**SEC-003 — this was the real one, and it was worse than the gate said.** The gate reported
"0 matches for RLS/GRANT/REVOKE across migrations", which is a statement about our SQL. What
it did not say is what the database actually looked like. Measured on 2026-08-04: **every
table in `public` carried `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` for
both `anon` and `authenticated`.** Those are the roles behind Supabase's PostgREST API, and
the `anon` key that assumes the first is *published in client-side code by design*. So the
reachable-without-authenticating surface included reading `identity_account` (`email_hash`,
`email_encrypted`, `verification_token_hash`), inserting rows straight into `question` /
`answer` past the T14a gateway, rewriting `moderation_case` verdicts, and `TRUNCATE` on
everything. The anonymity promise (RR-7 / RR-13) and the fail-closed moderation posture (R6)
were both bypassable by anyone who read the client bundle.

Nobody wrote those grants. `pg_default_acl` shows Supabase ships default privileges granting
ALL on tables, sequences and functions in `public` to `anon`, `authenticated` and
`service_role` — so **every table any migration creates is auto-granted on creation**. That is
why migration `008` revokes the *default* privileges too: without it, 009+ silently re-opens
the hole and the next party to notice is an attacker.

**We deliberately did not follow the gate's own fix_hint.** It says "ENABLE **+ FORCE** ROW
LEVEL SECURITY". `FORCE` applies RLS to the table owner as well; the app connects as the
owner and this schema defines **zero policies**, so under FORCE every query returns zero rows
— every feed empty, every signup unable to find its own account — while `/health` still
answers `ok`. A total silent outage that reads as a data problem. Taking the fix_hint
literally would have shipped it. Checked before writing the migration, not assumed: the
connecting role is `postgres`, it owns all eight tables, and it has `rolbypassrls = true`.
Two independent reasons `ENABLE` alone cannot lock the app out.

The **down migration is deliberately asymmetric**: it disables RLS but does not restore the
grants. A faithful reversal would mean the `migrate:down && migrate` step CI runs on every
push briefly re-opens the database to a published key — the rollback would *be* the
vulnerability. Proven locally: after `migrate:down`, RLS-enabled tables went 8 → 0 and grants
to anon/authenticated stayed at 0.

**SEC-002 — and the probe that lied.** The DSN had moved to the pooler host since the gate ran
and picked up `sslmode=no-verify`, so the connection was encrypted but the certificate was
never checked — a machine-in-the-middle still worked. Now controlled by `DATABASE_SSL`
(`disable` | `require` | `verify-full`), defaulted from the DSN host so a remote database gets
verified TLS with nobody remembering to set anything and CI's local postgres stays green.

Two things worth carrying forward:

- **A `sslmode=` in the DSN silently overrides the `ssl` option `pool.ts` passes** — pg merges
  the parsed connection string on top of the explicit config. The first TLS probe in this
  session reported `verify-full -> OK` while actually exercising `no-verify`, because the DSN
  won. Config now refuses to boot rather than let two settings disagree with the invisible one
  winning. Verified against pg 8.22.0, not assumed.
- **Supabase runs a private CA** (`*.pooler.supabase.com` ← `Supabase Intermediate 2021 CA` ←
  `Supabase Root 2021 CA`), so `verify-full` fails with `SELF_SIGNED_CERT_IN_CHAIN` until
  `prod-ca-2021.crt` is downloaded from the dashboard into `server/certs/`. It is deliberately
  **not** auto-fetched: a root taken from the endpoint you are authenticating proves nothing,
  because a machine-in-the-middle simply presents its own. **Still open** — the local env sits
  on `require` until that file lands, which is no worse than the `sslmode=no-verify` it
  replaced. See `runbooks/staging-deploy-T49.md` §2.

**SEC-010 — headers.** helmet plus an explicit `x-powered-by` disable. Scoped honestly: it
does **not** close **SEC-013**, which wants a CSP on the client *document*. A CSP riding on
JSON API responses protects nothing, and claiming otherwise would be exactly the false green
this project keeps paying for.

**The DB-backed suites had been silently dead on this machine.** All 53 of them failed on
`MURMUR_TEST_DB_ALLOW` being unset — and it was absent *before* this session's changes too.
When SEC-017's fix replaced `MURMUR_TEST_DB_CONFIRM=i-am-disposable` with the host+database
pin, `.env` was never updated, so every DB-backed suite has been refusing to run locally ever
since. CI was unaffected (its database is named `murmur_test`, which passes the guard by
name), which is precisely why nobody noticed. **Fourth instance of the same lesson:** the
thing that watches has to be working before its silence means anything. Authorised with the
human's consent after showing what would be destroyed (7 rows).

**Verified, not asserted:** 159/159 tests across 18/18 files green *with RLS enabled*;
`migrate down` + `up` clean with grants staying revoked; all 8 tables `relrowsecurity = true`
and `relforcerowsecurity = false`; 0 grants remaining to anon/authenticated; the `postgres`
default ACL for future tables reduced to `{postgres, service_role}`; `/health` 200 carrying
HSTS, nosniff and CSP with `x-powered-by` absent.

### Next
- **~~T19~~ — integration done 2026-08-02.** Two follow-ons: **T19b** (swap in round 3's
  pending/blocked cards when they come back) and the **rubric pass** above.
- **T62 needs `.pipeline/unlock` containing `08` before it runs.** The guardrail freezes
  `docs/0N-*.md` once a higher-numbered stage doc exists, and `docs/14-*` + `docs/16-*`
  already do. T60 hit this exact wall (OQ-SEC-06) and correctly refused to self-grant the
  unlock; T62 will hit it identically. A human must create the file.
- **~~T18~~ — done 2026-08-01.** **T25/T30/T39 remain copy jobs, not design sessions**: all 17
  `S1`–`S17` `.dc.html` files exist in the design project above. Pull the files a milestone
  needs at integration time and port them into `client/src/screens/` the way S1–S4 were —
  do **not** re-run a design round.
- **T62** (security-agent authz run) — **blocking for M2 exit**, and now runnable: the repo
  has a remote and gitleaks/semgrep/osv-scanner have all produced real output. **Corrected
  2026-08-04:** `.pipeline/unlock` now exists but is **empty (0 bytes)**, which
  `unlocked_prefixes()` (`.claude/hooks/guardrail.py:45-49`) reads as an empty set — so T62 is
  blocked exactly as if the file were absent. It needs the literal text `08`. Creating the
  file was not the same as unlocking it, and the difference is invisible from a directory
  listing. A human must write that line; Claude Code declining to do so is the same call T60
  made (OQ-SEC-06), for the same reason.
- **SEC-003 / SEC-010 fixed 2026-08-04, SEC-002 partly** — see the 2026-08-04 entry. The
  remaining half of SEC-002 is one dashboard download (`prod-ca-2021.crt`), documented in
  `runbooks/staging-deploy-T49.md` §2.
- **The SEC/PRV/RES backlog needs re-triage against the code, not against the JSONs.** The
  JSONs are demonstrably stale (SEC-017 recorded open, fixed days earlier; SEC-002's evidence
  describes a DSN that has since changed host). Sequence this *after* T62 so its fresh run
  does the SEC half for us.
- **T14b** Moderation provider binding — **M6** now (needs **T54**). Until it lands the app
  holds every question and answer and publishes nothing outside the test suite. That is R6's
  fail-closed posture behaving correctly, not a defect (plan RR-21).
- **T51** finish the M2 event hooks (WAU session-ping, answer-liquidity) — **now unblocked**:
  T19 landed, and `app-shell.ts` already emits `client.content.question_submitted` /
  `answer_submitted` with the moderation outcome, which is part of what T51 needs.
- **The gate fix lists** (RES-1/2/3, and the SEC/PRV findings above) are formally **M3-entry**
  work, not M2 blockers — T63's own gate record says so (`blocks_milestone_exit: false`,
  "findings become the M3-entry fix list"). **RES-3 is worth pulling forward anyway**: held
  content that can never escalate to a human breaks R6 AC3, and the fix is small.

**Corrected 2026-08-02:** removed "`signed-in-stub.ts` is scaffolding: delete it when S5
lands" — T19 deleted it. Also corrected the T18 note above that said "S5's field names
already match `QuestionRow`": the wire shape is the **route serializer**, not the repo row,
and it renames most fields to camelCase while leaving the author projection snake_case.

**Corrected 2026-08-01:** this list previously said "T60/T61 — still not run". They **were**
run on 2026-07-30; `docs/gates/` holds `security-gate-M1.json`, `privacy-gate-m1.json` and
`14-resilience-T63.gate.json`, and their findings are the fix lists above. The stale line
survived because the section recording the runs was added without pruning this one — worth
noticing, since a "not yet run" note is exactly the kind of thing a later session acts on.

### Config a real environment must set (see `.env.example`)
`DATABASE_URL`, `EMAIL_HASH_PEPPER_ACTIVE` (real secret, `v1:...`), `EMAIL_ENCRYPTION_KEY`
(base64 32-byte), `CAMPUS_EMAIL_DOMAINS` (launch campus), `EMAIL_PROVIDER` (+ real adapter).
