# Build Notes

Running record of implementation against `docs/07-plan.md`. This file is the mutable
build log; the frozen pipeline docs (01–07) are never edited here.

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

### Next
- **T14** Moderation Gateway + A7 (needs **T54**, the vendor shortlist — still human-blocked).
- **T15/T16** A3/A4 create question/answer — unblocked by T12/T13; their ban/suspend guard is
  already satisfied by `requireSession`.
- **T17** A5 browse feed — unblocked by T13.
- **T18** Claude Design round 2 (human) — QuestionFeedCard, AskComposer, QuestionThread, AnswerComposer.
- `client/src/screens/signed-in-stub.ts` is scaffolding: delete it when S5 lands.

### Config a real environment must set (see `.env.example`)
`DATABASE_URL`, `EMAIL_HASH_PEPPER_ACTIVE` (real secret, `v1:...`), `EMAIL_ENCRYPTION_KEY`
(base64 32-byte), `CAMPUS_EMAIL_DOMAINS` (launch campus), `EMAIL_PROVIDER` (+ real adapter).
