# 08 — Security

**Task:** T62 · **Milestone:** M2 · **Run:** 2 of the security-agent (T60 was run 1, warn-only)
**Mode:** BLOCKING — `docs/07-plan.md` line 472, M2 `exit_criterion`: *"Quality gate: T62
security-agent authz run is BLOCKING for this milestone's exit (cadence.md M2 row)"*
**Commit:** `80b1b57` · **Branch:** `task/T62-authz-security-gate` · **Date:** 2026-08-13
**Gate rule:** pass requires `counts.critical == 0` and `counts.high == 0`, unwaived.

## Result: FAIL

| severity | count |
|---|---|
| critical | **0** |
| high | **3** |
| medium | 6 |
| low | 4 |
| info | 1 |
| **total** | **14** |

Waivers applied: **none**. `.pipeline/waivers/` does not exist, so no waiver could be valid
even if one were cited. This agent granted none and is not permitted to.

M2 cannot exit until `SEC-002`, `SEC-019` and `SEC-021` are closed or a human waives them.

The one-line summary of this run: **every high finding is a configuration residual of a T60
finding whose code remedy did land.** The application code has held up well under a
deliberately adversarial re-read. The environment it runs in has not.

---

## 1. Phase 0 gate

| check | result | evidence |
|---|---|---|
| `docs/07-plan.md` exists | pass | file present, 103,007 bytes |
| plan handoff validates against plan schema | pass | `jsonschema 4.25.1` `Draft7Validator` against `.claude/schemas/handoff-plan.json`, 0 errors |
| plan handoff sha256 | — | `78cb9575…5997` (identical to the value T60 recorded, so the plan has not moved under us) |
| plan `status` is not `blocked` | pass | the handoff carries no `status` field at all; nothing sets it to `blocked` |
| no blocking OQs open in the plan handoff | pass | `open_questions` contains 0 entries with `blocking: true` |
| codebase exists at repo root | pass | `[ASSUMPTION: repo root = cwd]` — the plan handoff names no `repo_root` field (same assumption T60 recorded) |
| skill `security-audit` readable | pass | `.claude/skills/security-audit/SKILL.md` |
| stage doc writable | pass | `.pipeline/unlock` contains `08 09 10 11 12 13`, written by the human 2026-08-11; the freeze that stopped T60 writing this file is lifted |

Disposition: **pass** — the run proceeded.

---

## 2. Tool runs

| class | mandated | what actually ran | version | exit | report |
|---|---|---|---|---|---|
| SAST | `semgrep scan --config auto --json` | **as mandated** | 1.172.0 | 0 | `.pipeline/sec/semgrep-T62.json` |
| Secrets | `gitleaks detect --report-format json` | **substituted** — `detect-secrets scan --all-files` | 1.5.0 | 0 | `.pipeline/sec/detect-secrets-T62.json` |
| Secrets (supplement) | — | direct git-history search across all refs | git 2.x | 0 | `.pipeline/sec/history-secret-search-T62.txt` |
| Secrets (mandated tool, remote) | `gitleaks` | **ran in CI**, not locally | `gitleaks-action@v2` | success | GH Actions run `31521354238` |
| SCA | `osv-scanner --lockfile <lf> --json` | **substituted** — `npm audit --json`, both lockfiles, full tree and `--omit=dev` | npm 10.9.2 | 1 | 4 reports under `.pipeline/sec/` |

### SAST ran as mandated, with two honest notes

The semgrep registry was reachable, so `--config auto` resolved **503 rules across 273
files** and returned 19 findings. T60's fallback to 10 self-authored local rules in
`.pipeline/sec/local-rules.yaml` was **not** used.

Two things about the invocation are worth writing down so the next run does not lose an hour:

1. `python -m semgrep` **exits 2 silently** on this machine — no diagnostic on stdout, none on
   stderr, no output file. The working entrypoint is the console script at
   `C:/Users/Gurka/AppData/Local/Programs/Python/Python312/Scripts/semgrep.exe`.
2. The first attempt added `--metrics=off`, which is incompatible with `--config auto`
   (auto-config resolution is what the metrics flag disables). It was dropped.

Coverage gaps: the scan is limited to git-tracked files (semgrep's default), 47 files were
skipped by `.semgrepignore`, and one rule
(`javascript.express.security.express-insecure-template-usage`) **timed out** on
`client/src/components/support.js`. That last one is recorded inside `SEC-018`.

### Secrets was substituted — what that costs

`gitleaks`, `osv-scanner` and `trivy` are all absent from this machine and binary downloads
have failed in this environment before. Per the boring-tech rule, this run did not go
shopping for exotic tooling mid-gate.

**The substitution is not equivalent, and this is the gap:** `detect-secrets` scans the
**working tree**. It does not read git history — which is the single specific thing gitleaks
is mandated for, because a secret deleted in the next commit is still a leaked secret.

Two things partly compensate, and neither is a substitute for the real thing:

- **The mandated tool did run — remotely.** The CI job `secrets-scan` runs the real
  `gitleaks/gitleaks-action@v2` and **concluded `success` on run `31521354238`, against commit
  `80b1b57` — exactly this run's HEAD.** What is *not* established from here is whether that
  action scanned full history or only the pushed commit range. Carried as non-blocking
  `OQ-SEC-04`.
- **This run searched history directly.** No `.env` has ever been committed on any ref, and
  each live secret was searched across all history by value with `git log --all -S`. All
  negative. Details in §5.

### SCA was substituted — and T60's lockfile gap is closed

`npm audit` resolves only against the npm advisory database; `osv.dev` aggregates more
sources and would likely return a superset. Ecosystem coverage is otherwise identical, since
both lockfiles are npm.

T60 left `client/package-lock.json` unscanned. **Both lockfiles were scanned this run**, full
tree and production-only. Note there is **no `server/package.json`** — the server *is* the
root package, so `package-lock.json` at the repo root is the server lockfile.

---

## 3. The point of this run: authorization

Three separate questions were asked of **every** route registered in `server/src/app.ts` —
not one blended "is it secure" question. Scope is repo-wide rather than the A3/A4/A5/T12
surface named in the task, because the gate rule is repo-wide.

1. **Session?** Is it behind `requireSession` (`server/src/shared/require-session.ts`)?
2. **Ownership?** Where it acts on a row that could belong to someone else, does it check
   *ownership* — not merely that a session exists?
3. **Attribution?** Can the caller influence *whose identity the write is attributed to*?

**18 routes enumerated, 18 examined, 0 left unexamined.**

---

## 4. Authz table

Routers are mounted at `app.ts:68-80`. `Y` = yes, `n/a` = the question does not apply to this
route.

| # | Route | Module / line | 1. `requireSession`? | 2. Ownership checked? | 3. Caller can influence attribution? | Verdict |
|---|---|---|---|---|---|---|
| 1 | `GET /health` | `app.ts:58` | **No** — deliberate | n/a — reads no user row | n/a — writes nothing | **OK.** Returns only `{status}` / `{status,detail}`; a DB failure yields `503 degraded` with no error text from the driver. Discloses reachability, nothing more. |
| 2 | `POST /verification/initiate` (A1) | `identity.routes.ts:22` | **No** — pre-session by definition | n/a | n/a — the email *is* the subject | **Finding SEC-008** (medium): 409 vs 202 discloses membership. Rate-limited via `rateLimit(initiateLimiter)`. |
| 3 | `POST /verification/confirm` (A2) | `identity.routes.ts:42` | **No** — pre-session by definition | Y — the OTP is bound to the account row; guesses are burned at `identity.service.ts:199` against `verificationMaxConfirmAttempts` | No | **OK.** T60's SEC-004 is closed. |
| 4 | `POST /events` (A12) | `analytics.routes.ts:56` | **NO** | n/a | **No** — `actorProfileId` is refused outright by `z.undefined()` at `:39-41`; the actor is derived at `:50-54` from a signature-verified session token | **Finding SEC-009** (medium — *re-assessed down*, see §6). |
| 5 | `POST /session/exchange` | `session.routes.ts:29` | **No** — a bootstrap token is the credential instead | Y — the profile is re-read live at `:38-41`, so a ban landing between A2 and the exchange refuses the credential | No — `issueSessionToken(profile.id)` takes the id from the re-read row, never from the request | **Finding SEC-023** (low): no rate limiter. Type confusion is closed: `verifyToken(raw, "bootstrap")` at `:34`. |
| 6 | `GET /session` | `session.routes.ts:59` | **Y** | Y — returns `callerOf(req)` only, i.e. self | n/a | **OK.** |
| 7 | `POST /session/logout` | `session.routes.ts:76` | **No** | n/a | n/a | **OK.** Changes no server state — returns 204 and the client discards. Stateless tokens die at `exp`; the handler comment says so rather than implying revocation. |
| 8 | `POST /questions` (**A3**) | `content.routes.ts:92` | **Y** | n/a — creation | **NO.** `authorProfileId: callerOf(req).id` at `:99` is the only author source | **OK — tested, not assumed.** See §4.1. |
| 9 | `POST /questions/:id/answers` (**A4**) | `content.routes.ts:121` | **Y** | Y — parent must be *published*: `findPublishedQuestionId` at `content.service.ts:150-151`, so a held or blocked question cannot be answered (which would leak that it exists) | **NO.** `authorProfileId: callerOf(req).id` at `:132` | **OK — tested, not assumed.** See §4.1. |
| 10 | `GET /questions` (**A5** browse) | `content.routes.ts:153` | **Y** | Y — `listPublishedQuestions` filters `moderation_status = 'published' AND deleted_at IS NULL` (`content.repo.ts:161-162`) | n/a | **OK.** Held/blocked content never crosses. See §4.2. |
| 11 | `GET /questions/:id` (**A5** thread) | `content.routes.ts:177` | **Y** | Y — viewer-scoped in SQL: `(q.moderation_status = 'published' OR q.author_profile_id = $2)` at `content.repo.ts:127`, and the same shape for answers at `:236` | n/a | **OK.** The viewer id comes from `callerOf(req).id` at `:181`, never from the query string. |
| 12 | `GET /topics` (**A5**) | `content.routes.ts:189` | **Y** | Y — `is_active = true` only (`content.repo.ts:69`) | n/a | **OK.** |
| 13 | `POST /answers/:id/vote` (A6) | `reputation.routes.ts:33` | **Y** | **Y — three separate ownership rules**: published-only (`reputation.service.ts:92`), self-vote refused (`:94`), duplicate refused (`:97`) | **NO.** `actorProfileId: callerOf(req).id` at `:38` | **OK.** Self-vote is enforced *twice* — in the service and by a database trigger (`003_reputation.up.sql:110-124`). |
| 14 | `POST /answers/:id/accept` (A6) | `reputation.routes.ts:47` | **Y** | **Y — the strongest ownership check in the codebase**: only the *question* author may accept (`reputation.service.ts:146`), checked **before** the already-accepted case so a stranger cannot learn from the error whether a question is resolved | **NO.** `actorProfileId: callerOf(req).id` at `:52` | **OK.** Backed by `uniq_answer_accepted_per_question` in the schema. |
| 15 | `POST /reports` (A8) | `grievance.routes.ts:63` | **Y** + `rateLimitByProfile` at `:66` | Y — exactly one target enforced at `:76-78` and by `chk_grievance_report_one_target` in the schema | **NO.** `reporterProfileId: callerOf(req).id` at `:82` | **OK.** `isAnonymous` means "store no reporter", not "accept from nobody" — the route comment at `:15-18` states this. Limiter runs *after* `requireSession` and throws if not. |
| 16 | `GET /reports/reasons` | `grievance.routes.ts:104` | **Y** | n/a — a static vocabulary | n/a | **OK.** |
| 17 | `POST /sync/batch` (A10) | `sync.routes.ts:34` | **Y** | Y — every item is scoped to the session: `resolveLocalId(pool, ownerProfileId, local)` at `sync.service.ts:224` | **NO.** `ownerProfileId` is threaded from `callerOf(req).id` (`sync.routes.ts:59`) into every write — `authorProfileId` at `sync.service.ts:246` and `:263`, `actorProfileId` at `:277-278`, `reporterProfileId` at `:292`. The client payload never supplies an author | **OK.** A banned caller's whole batch is refused at the shared gate rather than per item; the deviation from the TRD is documented at `sync.routes.ts:10-21`. |
| 18 | 404 fallback | `app.ts:83` | n/a | n/a | n/a | **OK.** Uniform error envelope; the central handler at `:87-95` maps unknown errors to `errors.internal()` rather than leaking a stack. |

### 4.1 A3/A4 — can a client-supplied author field override `callerOf(req).id`?

Tested rather than assumed, and the answer is **no**, for two independent reasons:

1. **The author is never read from the body.** `createQuestion` is called with
   `authorProfileId: callerOf(req).id` (`content.routes.ts:99`) and `createAnswer` with the
   same (`:132`). No other assignment to `authorProfileId` exists on either path.
2. **The body could not carry one anyway.** `createQuestionSchema`
   (`content.routes.ts:83-90`) and `createAnswerSchema` (`:116-119`) are plain `z.object`s
   with no `.passthrough()`, so zod **strips unknown keys**. A request sending
   `authorProfileId`, `author_profile_id` or `author` reaches the service with those keys
   already gone.

The interesting attribution path is not the body — it is **idempotency-key replay**, and it
is closed. `replayQuestion` refuses a key belonging to another profile
(`content.service.ts:108-111`), and the answer path does the same twice: on the pre-check
(`:135-137`) and again on the `23505` race path (`:168`). Without that, replaying a stranger's
key would have disclosed their content.

### 4.2 A5 — do held/blocked content or `author_profile_id` cross the response boundary?

**No, and it is structurally prevented rather than remembered per query.**

- **`author_profile_id` never leaves the database.** Every content read shares one projection,
  `AUTHOR_SELECT` (`content.repo.ts:49-54`), which builds a `jsonb_build_object` of exactly
  `pseudonym`, `year_badge`, `reputation_score`. The comment at `:47-48` states the intent:
  written once so no query can accidentally select an identity column. Both view functions
  (`content.routes.ts:25-50`) also whitelist fields rather than spreading the row.
- **Held/blocked content is filtered in SQL, not in the handler.** The feed is
  `published`-only (`content.repo.ts:161`). The thread and single-item reads widen visibility
  to the viewer's *own* held item and no one else's (`:127`, `:217`, `:236`) — which is what
  S6 needs to show a submitter their pending post.
- **Vote/accept refuse non-published targets with `answer_not_found`** rather than a distinct
  code (`reputation.service.ts:92`, `:141`), so an ID-guessing caller cannot confirm a held
  row exists. The comment at `:89-91` names this reasoning.

### 4.3 T12 session — the two properties the task asked to be tested

**A bootstrap token is refused where a session token is required — confirmed.**
`verifyToken(token, expected)` takes the expected type as a **required** parameter and
rejects on `payload.typ !== expected` (`session.ts:115`). The comment at `:94-98` explains
why it is required rather than optional. Use sites: `require-session.ts:39` demands
`"session"`; `session.routes.ts:34` demands `"bootstrap"`; `analytics.routes.ts:53` demands
`"session"`. The type is inside the signed payload, so it cannot be edited without breaking
the HMAC. Signature comparison is constant-time and does not short-circuit across key
versions (`session.ts:65-75`).

**A session issued before a ban fails on the very next request — confirmed.**
`require-session.ts:44` loads the profile **live** from the database on every authenticated
request, then refuses `banned` (`:55`) and `suspended` (`:56`). Because the token carries only
`sub` and never a cached status, there is no stale copy to trust. A deleted or soft-deleted
profile is treated as an expired session (`:51`) rather than a 500. Ban is a **403
`account_banned`**, not a 401, deliberately — a 401 would send a banned user back through
registration, which A11 exists to refuse.

The one property the code does **not** have, and correctly does not claim in the middleware:
`POST /session/logout` cannot invalidate an outstanding token. The handler comment at
`session.routes.ts:70-75` is honest about it. Related: `SEC-015`.

---

## 5. Manual check classes

| class | result | summary |
|---|---|---|
| Secrets outside git history | **pass** | see below |
| AuthZ, not just authN | **pass** | §4 — 18/18 routes, 0 attribution holes, 0 missing ownership checks |
| Storage / DB rules | **pass** (source) | see below |
| Webhook signature verification | **n/a** | No webhook surface exists. A case-insensitive grep across `server/src` for `webhook`, `x-hub-signature`, `stripe`, `razorpay`, `signature` returns no handler; the TRD has no payment or messaging integration. Nothing to verify. |
| Rate limiting on auth paths | **finding** | A1/A2 covered (`identity.routes.ts:22`, `:42`); A8 per-profile; A12 per-address. Gap: `POST /session/exchange` → `SEC-023`. `TRUST_PROXY` unset weakens every address-keyed limiter behind a proxy → folded into `SEC-009`. |
| Input validation at trust boundaries | **pass** | Every body and route param is zod-parsed before use, across all seven routers. Body capped at 256kb (`app.ts:54`), sync batches capped at `MAX_BATCH_ITEMS`. Unknown-key stripping is the second line of defence described in §4.1. |

**Secrets outside git history.** No `.env` has ever been committed on any ref
(`git log --all --diff-filter=A` over `*.env`, `.env`, `server/.env`, `client/.env` returns
nothing). The live `EMAIL_HASH_PEPPER_ACTIVE`, `SESSION_SIGNING_KEY` and the `DATABASE_URL`
password were each searched across all history by value with `git log --all -S` and appear in
**zero commits** and zero tracked worktree files. `.gitignore:3-4` covers `.env` and
`.env.local`. The tracked `detect-secrets` hits are all fixtures or the documented sample —
`.env.example:12`, `ci.yml:33`/`:40`, `.claude/agents/security-agent.md:32`, and ten
`tests/unit/*.test.ts` "Basic Auth Credentials" hits that are Bearer-token literals in test
setup. The one real placeholder-derived exposure is tracked separately as **`SEC-019`**.

**Storage / DB rules.** The specific worry — *migration 008 sweeps only tables that existed
when it ran* — was checked directly and does **not** hold. The later tables carry their own
protection:

| migration | tables created | hardened at |
|---|---|---|
| 003 reputation | `ban_record`, `reputation_event` | `003_reputation.up.sql:141-142` |
| 004 offline queue | `sync_queue_item`, `content_draft` | `004_offline_queue.up.sql:130` |
| 005 grievance | `grievance_report`, `grievance_audit_log`, `grievance_officer_contact` | `005_grievance.up.sql:125` |

Each does `ENABLE ROW LEVEL SECURITY` plus a role-guarded `REVOKE ALL` from `anon` and
`authenticated`. Migration 008 itself sweeps `pg_tables` (`:55-59`), revokes the standing
grants (`:70-72`) and — the part that does the real work — revokes the Supabase **default
privileges** that were silently re-issuing them on every new table (`:76-81`). All 14 tables
created across 001–006 are covered; 007, 009 and 010 create no tables. The deliberate
`ENABLE`-without-`FORCE` choice is argued at `008:20-37` and is correct: `FORCE` would apply
RLS to the owner the app connects as, and with zero policies defined every query would return
zero rows while `/health` still answered "ok".

> **`[ASSUMPTION]` — verified against migration SOURCE only.** This run did **not** query the
> live database to confirm the migrations are applied there. See §7.

---

## 6. Findings

Full records with evidence and provenance: `.pipeline/sec/handoff-08-security-T62.json`.

### High (3) — all block the gate

| id | summary | location |
|---|---|---|
| **SEC-002** | Live `.env` sets `DATABASE_SSL=require` → `{rejectUnauthorized:false}` to a remote Supabase host with no CA pinned. Encrypted, but the peer is never authenticated: an active machine-in-the-middle gets the DB password and every row. | `server/src/db/pool.ts:28`; `.env DATABASE_SSL` |
| **SEC-019** | `EMAIL_HASH_PEPPER_RETIRED` is still `v1:change-me-in-every-real-environment`, byte-identical to tracked `.env.example:41`, and `config/index.ts:188` loads it through `optional()` with **no** placeholder guard. Every `email_hash` row still stored as `v1$…` was computed under a pepper published in this repository → membership-confirmation oracle against low-entropy campus addresses. | `.env`; `.env.example:41`; `email-identity.ts:85-92,121-124`; `config/index.ts:188` |
| **SEC-021** | Live `.env` sets `EMAIL_PROVIDER=console` with `NODE_ENV=development` against the live database, so `email-provider.ts:66` `console.log`s the raw recipient address and the raw OTP. The OTP is a live account-takeover credential; the address is the one identifier the product exists to hide. | `email-provider.ts:59-73`; `.env` |

### Medium (6)

`SEC-008` user enumeration on A1 · `SEC-009` unauthenticated write on `POST /events`
(**re-assessed**, see below) · `SEC-012` dev-only dependency vulnerabilities ·
`SEC-013` no CSP on `client/index.html` · `SEC-020` `email_encrypted` written NULL on live
data · `SEC-022` seven CI actions pinned to mutable tags.

### Low (4)

`SEC-015` bootstrap token replay · `SEC-016` raw email in the admin script ·
`SEC-017` residual name-substring branch in the destructive test guard ·
`SEC-023` no rate limit on `POST /session/exchange`.

### Info (1)

`SEC-018` `new Function` ×2 in the vendored, unreferenced `client/src/components/support.js`.

### SEC-009 — assessed independently, and the rating changed

The task asked for an independent severity judgement rather than a copy of T60's. Here it is.

**T60's evidence text no longer matches the file.** It reads: *"eventSchema accepts
`actorProfileId` (uuid, optional) and `metadata` (arbitrary record) from any anonymous
caller."* Neither clause is true at `80b1b57`:

- `actorProfileId` is declared **`z.undefined()`** (`analytics.routes.ts:39-41`) with a custom
  message — a client still sending it gets a **400**, so the field is refused outright rather
  than silently ignored.
- The actor is derived by `actorFrom()` (`:50-54`), which requires a **signature-valid session
  token**.
- `eventType` is allowlisted (`:64`) and `metadata` is sanitized to bounded flat primitives
  with email-shaped strings refused (`:72`).

So the forgeable-attribution harm — the thing that made this finding serious — **is fixed**.

**What genuinely remains**, and what the finding now records: the route is registered with
`rateLimit(eventsLimiter)` but **without `requireSession`**, so any internet caller can write
rows into `analytics_event`, which is append-only and never deleted from (PRV-1). Two
aggravators worth naming:

- `config.trustProxy` is **unset** in the live `.env`, so behind a proxy every caller shares
  one bucket — both a limiter bypass and a campus-wide lockout risk. `app.ts:24-33` documents
  this exact failure.
- `actorFrom()` verifies the signature but does **not** load the live profile, so a banned
  user's unexpired token still attributes events — contrast `require-session.ts:44`, where the
  live load is the revocation authority.

**Rating: medium, not high.** The endpoint being unauthenticated is a deliberate, documented
design requirement — the registration funnel it measures happens before anyone has a session
(PRD R8, stated at `analytics.routes.ts:11-13`). What is left is residual risk on an accepted
design — metric pollution and unbounded table growth — not a missing guard. Raising it to high
would be treating a documented product constraint as a defect.

### Triaged false positives

Marked false-positive only with `file:line` evidence, per the skill's triage rule.

| id | rule | location | why |
|---|---|---|---|
| FP-1 | `gcm-no-tag-length` (native **ERROR**) | `email-encryption.ts:45` | The auth tag is not caller-influenced in length: it is a **fixed-offset 16-byte slice**, `blob.subarray(12, 28)` at `:43`, from a layout this module itself wrote at `:36`. A truncated tag cannot be presented, so `setAuthTag` at `:46` always receives exactly 16 bytes. |
| FP-2 | `raw-html-format` ×2 (native WARNING) | `question-feed.ts:62`; `question-thread.ts:175` | Every interpolation passes through `esc()` (`dom.ts:21-27`). Checked the surrounding templates (`question-feed.ts:52-71`, `question-thread.ts:165-177`): every author, title, body, topic and badge value is wrapped, and each lands in a text node or a **double**-quoted attribute. **Noted rather than dismissed:** `esc()` does not escape the single quote, so this becomes real the day someone interpolates into a single-quoted attribute. |

---

## 7. What this run could NOT determine

Stated plainly rather than left as an implied pass.

**Whether the RLS migrations are actually applied to the live database.** Source-level
verification is complete and passes (§5). Applied-state verification is not done: the
environment constraint forbids the integration suite, and this agent chose not to issue
ad-hoc queries against a live database holding real data. A human with read access should
confirm `rowsecurity = true` across `pg_tables` and that `anon`/`authenticated` hold no
grants in `public`.

**Whether the CI gitleaks job scans full history or only the pushed commit range.** It ran and
passed on this exact commit; its scope is not established from here. Non-blocking
`OQ-SEC-04`.

**Whether `osv.dev` would report vulnerabilities `npm audit` does not.** `npm audit` resolves
only the npm advisory database. Both production trees are clean under it; that result is
narrower than the mandated tool would give.

---

## 8. Open questions

Escalated verbatim, owner human, never designed around and never self-waived.

| id | blocking | owner | question |
|---|---|---|---|
| **OQ-SEC-02** | **yes** | gurkanwaldeep | `SEC-019` — the retired pepper is the published placeholder, so every `v1$` `email_hash` row was computed under a secret any reader of this repo knows. Those rows **cannot be re-hashed**: `email_encrypted` is NULL for them (`SEC-020`) and HMAC is one-way. Choose, and both options cost something real: **(a)** delete or quarantine every `v1$` `identity_account` row — this destroys real accounts and those students must re-register; or **(b)** accept the membership-confirmation exposure in writing, on the record, with a named owner. This agent cannot choose, cannot waive it, and has not. |
| **OQ-SEC-03** | **yes** | gurkanwaldeep | `SEC-002` + `SEC-021` — the single environment that talks to the live Supabase instance is configured as a *development* environment: `DATABASE_SSL=require`, `EMAIL_PROVIDER=console`, `EMAIL_ENCRYPTION_KEY` empty, `NODE_ENV=development`. That last variable is precisely what disarms the boot guards written for T60's SEC-006 and SEC-011. Every code remedy landed; every one is bypassed by configuration. Decide whether to fix the configuration or to split dev and production environments. |
| OQ-SEC-04 | no | gurkanwaldeep | Tool substitution — gitleaks, osv-scanner and trivy are all absent locally. Confirm whether the CI gitleaks job scans full history, and whether this machine should carry these binaries before T48 re-executes every signal from scratch. |

---

## 9. Ranked fix order

1. **`SEC-002`** — cheapest of the three highs, largest blast radius. One CA file plus one
   variable. Today it exposes the database password and every row to an active
   machine-in-the-middle.
2. **`SEC-021`** — two-variable change. Until then every real OTP and raw campus address is
   printed to stdout.
3. **`SEC-019`** — third only because it needs a human *decision*, not an edit, and the
   decision destroys data either way. Blocking `OQ-SEC-02`.
4. **`SEC-020`** — one variable. Do it alongside `SEC-019`; it is the reason `SEC-019` cannot
   be fixed by re-hashing.
5. `SEC-013` — highest-value medium: the unenforced premise behind keeping the session token
   in `localStorage`.
6. `SEC-009` — set `TRUST_PROXY`; add `analytics_event` retention. The second only gets more
   expensive with time.
7. `SEC-023` — three lines; removes the last unlimited credential-handling endpoint.
8. `SEC-022` — mechanical SHA pinning across seven `ci.yml` lines.
9. `SEC-012` — `npm update` in both trees. No production exposure; can wait.
10. `SEC-008` — needs a product decision on the single-campus threat model first.
11. `SEC-015` / `SEC-016` / `SEC-017` / `SEC-018` — batch when those files are open anyway.

---

## 10. T60 disposition — re-verified, not carried on trust

Prior artifacts in this repo have recorded findings as unfixed that were fixed days earlier,
so **every** T60 finding was re-read against the code at `80b1b57`.

**Genuinely closed (6):** `SEC-001` (pepper rotated to `v2`; `requiredSecret()` refuses
placeholders at `config/index.ts:32-46`) · `SEC-004` (confirm-attempt budget enforced,
`identity.service.ts:188`, burn at `:199`) · `SEC-005` (`REDACT_PATHS` now covers
`authorization`, both casings of `x-session-refresh`, cookies, `req.remoteAddress`) ·
`SEC-007` (`shared/rate-limit.ts` exists and is wired at `identity.routes.ts:22`/`:42`) ·
`SEC-010` (`app.ts:51-52` disables `x-powered-by`, installs `helmet()` before all routes) ·
`SEC-014` (**the blocking CI control has now executed** — run `31521354238` on `80b1b57`,
all four jobs `success`; a git remote also now exists, which it did not at T60).

**Closed in code, open in configuration (3):** `SEC-002` → re-recorded high ·
`SEC-006` → `SEC-021`, high · `SEC-011` → `SEC-020`, medium. This is the shape of the whole
run: the fixes are real, the environment does not apply them.

**Still open, unchanged (5):** `SEC-008`, `SEC-013` (the code says so itself at
`app.ts:42-45`), `SEC-015`, `SEC-016`, `SEC-018`.

**Severity materially changed (3):** `SEC-009` re-assessed **down** to medium (§6) ·
`SEC-012` held at medium, both lockfiles now scanned, production trees clean ·
`SEC-017` materially improved (blanket opt-out replaced by an exact host/database fingerprint
pin) but held at low for the residual `db.includes("test")` branch at
`tests/helpers/test-db.ts:47`.

**Could not determine (1):** `SEC-003` applied state — see §7.

**New in T62 (5):** `SEC-019`, `SEC-020`, `SEC-021`, `SEC-022`, `SEC-023`.

---

## 11. Constraints honoured

- **No application code changed.** Nothing under `server/src`, `client/src` or `tests/` was
  written. This run created only `docs/08-security.md`, `docs/gates/security-gate-M2.json`
  and files under `.pipeline/sec/`.
- **No waiver written.** `.pipeline/waivers/` was never written to and does not exist.
- `.pipeline/unlock` read only. The human-only gate record under `docs/gates/` untouched.
  `docs/01-…` through `docs/07-…` not edited (`07-plan.md` read for Phase 0 only).
- **Integration and NFR suites not run**; the live database was **not** queried.
- **No git operations** — no commit, no merge, no push.
- **No secret value was printed.** `.env` was inspected by sha256 digest, placeholder-marker
  matching, version-prefix extraction and enum comparison. No secret appears in any artifact
  this run produced.
- T60's artifacts were not overwritten: this run's files are suffixed `-T62`.
- Handoff validated **first attempt, 0 correction rounds used of the 3 permitted**.

---

```json
{
  "stage": "security",
  "schema_version": "1.0",
  "inputs_consumed": [
    { "stage": "plan", "handoff_sha256": "78cb95758b9dacd9f30c491fba071772d5b8ce7f93d37aa57c16bbd2ea645997" },
    { "stage": "security-M1-T60", "handoff_sha256": "e950bb39a0fa0a6f7af8d1e34acb19ee68864a3b63f0b38247da1c8269e65bcc" }
  ],
  "status": "fail",
  "open_questions": [
    {
      "id": "OQ-SEC-02",
      "text": "SEC-019 - EMAIL_HASH_PEPPER_RETIRED is still the published placeholder 'v1:change-me-in-every-real-environment' (identical to tracked .env.example:41), so every identity_account.email_hash row stored with the 'v1$' prefix was computed under a pepper any reader of this repository knows. Those rows CANNOT be re-hashed, because email_encrypted is NULL for them (SEC-020) and HMAC is one-way. A human must decide between two options, both of which have a real cost: (a) delete or quarantine every v1$ identity_account row - this destroys real accounts and those students must re-register; or (b) accept the membership-confirmation exposure in writing, on the record, with a named owner. This agent cannot choose, cannot waive it, and has not.",
      "owner": "gurkanwaldeep",
      "blocking": true
    },
    {
      "id": "OQ-SEC-03",
      "text": "SEC-002 and SEC-021 - the single environment that talks to the live Supabase instance is configured as a development environment: DATABASE_SSL=require (unauthenticated TLS, no CA pinned), EMAIL_PROVIDER=console (real OTPs and raw addresses to stdout), EMAIL_ENCRYPTION_KEY empty and NODE_ENV=development (which is what disarms the boot guards written for T60's SEC-006 and SEC-011). Each code remedy from T60 landed and each is bypassed by configuration. A human must decide whether to fix the configuration or to split dev and production environments; the M2 gate cannot pass while a live database is reached this way.",
      "owner": "gurkanwaldeep",
      "blocking": true
    },
    {
      "id": "OQ-SEC-04",
      "text": "Tool substitution - gitleaks, osv-scanner and trivy are all absent from this machine and binary downloads have failed here before, so the mandated secret and SCA scanners could not be run locally. detect-secrets@1.5.0 (worktree only, NOT git history) and npm@10.9.2 audit (npm advisory database only) were substituted. This is partly compensated: the CI secrets-scan job runs the real gitleaks/gitleaks-action@v2 and succeeded on commit 80b1b57, which is this run's HEAD. Confirm whether that job scans full history or only the pushed commit range, and whether the environment should carry these binaries before T48 re-executes every signal from scratch.",
      "owner": "gurkanwaldeep",
      "blocking": false
    }
  ],
  "waivers_cited": [],
  "tool_runs": [
    {
      "tool": "semgrep",
      "version": "1.172.0",
      "exit_code": 0,
      "invocation": "semgrep.exe scan --config auto --json --output .pipeline/sec/semgrep-T62.json .",
      "report_path": ".pipeline/sec/semgrep-T62.json"
    },
    {
      "tool": "detect-secrets (SUBSTITUTE for gitleaks - absent)",
      "version": "1.5.0",
      "exit_code": 0,
      "invocation": "python -m detect_secrets scan --all-files > .pipeline/sec/detect-secrets-T62.json",
      "report_path": ".pipeline/sec/detect-secrets-T62.json"
    },
    {
      "tool": "git history secret search (SUPPLEMENT - detect-secrets does not read history)",
      "version": "git 2.x",
      "exit_code": 0,
      "invocation": "git log --all --diff-filter=A -- '*.env' .env server/.env client/.env; git log --all -S<live-secret> for EMAIL_HASH_PEPPER_ACTIVE, SESSION_SIGNING_KEY, DATABASE_URL password",
      "report_path": ".pipeline/sec/history-secret-search-T62.txt"
    },
    {
      "tool": "gitleaks via CI (MANDATED TOOL - ran remotely, not locally)",
      "version": "gitleaks-action@v2",
      "exit_code": 0,
      "invocation": "GitHub Actions job 'secrets-scan' on run 31521354238, commit 80b1b57 (this run's HEAD), conclusion=success",
      "report_path": "https://github.com/gurkanwaldeep927/murmur/actions/runs/31521354238"
    },
    {
      "tool": "npm audit (SUBSTITUTE for osv-scanner - absent; trivy also absent)",
      "version": "10.9.2",
      "exit_code": 1,
      "invocation": "npm audit --json (root/server lockfile) and (cd client && npm audit --json), plus --omit=dev re-runs of both",
      "report_path": ".pipeline/sec/npm-audit-server-T62.json, .pipeline/sec/npm-audit-client-T62.json, .pipeline/sec/npm-audit-server-prod-T62.json, .pipeline/sec/npm-audit-client-prod-T62.json"
    }
  ],
  "findings": "see .pipeline/sec/handoff-08-security-T62.json - 14 findings, full evidence and provenance per finding; reproduced there rather than duplicated here to keep one source of truth",
  "counts": { "critical": 0, "high": 3, "medium": 6, "low": 4 },
  "gate_rule": "pass requires counts.critical==0 and counts.high==0 (unwaived)"
}
```

> **Note on the block above.** It is the human-readable mirror of the machine handoff. The
> authoritative, schema-validated artifact is
> **`.pipeline/sec/handoff-08-security-T62.json`**, which carries the full `findings` array;
> `jsonschema 4.25.1 Draft7Validator` reports **0 errors** against
> `.claude/schemas/handoff-security.schema.json`. `counts` there was recomputed from the
> findings array and matches exactly: `{critical: 0, high: 3, medium: 6, low: 4}`, plus 1
> `info` finding which the schema's `counts` object does not carry.

---

## 12. Post-run remediation — added 2026-08-13, after the run

**This section exists so the report above does not become a lie.** Everything in §1–§11 records
what was true at commit `80b1b57` and must not be edited: a gate report whose findings get
quietly rewritten cannot be compared against its own re-run. But this repository has already been
burned the other way — on 2026-08-04 a gate file listed a finding as unfixed that had been fixed
days earlier, and a session was spent re-diagnosing it. So fixes are recorded here, dated, with
the branch that carries them, and §1–§11 are left exactly as the run wrote them.

Fixed on branch `sec/t62-fixlist-code-half`. **None of this changes the gate verdict**: the
verdict is `critical == 0 && high == 0`, all three highs are `.env` values, and nothing below
touches them. This is the medium/low tail — the part in Claude Code's lane.

| Finding | Severity | State | What changed |
|---|---|---|---|
| **SEC-023** | low | **closed** | `POST /session/exchange` now runs behind `rateLimit(exchangeLimiter)`, bucketed by address like A1/A2. New `RATE_LIMIT_EXCHANGE_PER_HOUR` (default 60). 5 tests in `tests/unit/session-exchange-rate-limit.test.ts`. |
| **SEC-022** | medium | **closed** | All 7 `uses:` in `ci.yml` pinned to full commit SHAs, version in a trailing comment. |
| **SEC-017** | low | **closed** | The destructive-test guard's route 1 now requires a loopback host **as well as** a `test`-shaped database name. 6 tests in `tests/unit/test-db-guard.test.ts`. |
| **SEC-016** | low | **closed** | `admin-delete-identity.ts` reads the address from stdin instead of `argv`, and identifies the account by `email_hash` prefix instead of echoing the address. |
| **SEC-015** | low | **closed as documented** | The comment claiming a bootstrap token is "exchangeable once" is corrected — it never was. |
| **SEC-012** | medium | **closed** | Two passes. First the non-breaking half; then `vitest` 2 → 4 and `vite` 5 → 8 on branch `chore/sec-012-major-devdep-bumps`. **Both trees now report `found 0 vulnerabilities`.** |
| **SEC-013** | medium | **open, deliberately not guessed** | Blocked on T49. See below. |
| **SEC-009** | medium | **open** | Its three parts have three different owners. See below. |

### SEC-023 — what the limiter is and is not for

Worth stating because the obvious reading is wrong. It does **not** exist to stop bootstrap-token
guessing: the signature is HMAC-SHA256 and guessing it is infeasible, so a ceiling was never what
stood between an attacker and a forged token. It exists because every allowed call performs an
unauthenticated database read (`findProfileById`), and an unbounded route that reads Postgres for
free is an amplifier — the same reasoning that gave A12 a ceiling.

The budget is deliberately looser than initiate's 10/hr. An allowed call sends no email, and a
student on a flaky connection retrying a failed exchange must not be locked out of their own
account. `TRUST_PROXY` being unset weakens this limiter exactly as it weakens the other three.

**Watched failing before it was trusted.** The middleware was removed on purpose and 4 of the 5
tests went red; then it was put back. An all-clear from a check nobody has seen fail is not
evidence — sixth application of that rule in this project.

### SEC-015 — the comment was the finding, so the comment is the fix

The module header said a bootstrap token was *"exchangeable once for a session"*. It is not, and
nothing ever made it so: there is no `jti`, no used-token set, no state anywhere. The same
bootstrap token can be presented to the exchange any number of times inside its 15-minute window,
and each presentation mints a fresh 30-day session token.

The fix hint offered two options — build single-use, or correct the comment. Correcting it was
chosen, and the reasoning now lives in `server/src/shared/session.ts` rather than only here:
single-use needs server-side state outliving a request, which
`decisions/oq-14-session-mechanism.md` §1 explicitly rules out. An in-process set would be *worse*
than the honest window, because at more than one instance the token would be single-use per
instance and replayable across them — enforced-looking and not enforced.

**The residual, stated:** whoever holds a bootstrap token holds it for 15 minutes, not for one
use, and it cannot be revoked. Bounded by the TTL and now by SEC-023's ceiling. Blast radius is
one account, whose own mailbox already received the code, which is why it stays low.

### SEC-012 — the fix hint understates it, and the scope is now measured

The hint reads *"npm update vitest vite in both trees at the next convenient point"*. That is not
what closing it takes. `npm audit fix` without `--force` closed brace-expansion, js-yaml, nanoid
and postcss. **Everything remaining resolves only through a semver-major bump: `vitest` 2 → 4
(two majors) in the root tree, `vite` 5 → 8 (three majors) in the client.** That is a
test-framework and build-tool replacement, not an update.

**Done in a second pass, immediately after — and the deferral reason is worth keeping, because it
expired rather than being overruled.** The reason for not doing it in the same change was
*attribution*: bumping the test framework while also editing security-relevant code means a red
suite cannot be blamed on either. Once the fix-list above was merged and green on `main`, a branch
containing nothing but two version numbers had exactly one possible cause of failure. So it was
done then, on `chore/sec-012-major-devdep-bumps`:

- root `vitest` `^2.0.5` → `^4.1.10` (two majors) — closes the `critical`-labelled vitest
  advisory plus `@vitest/mocker`, `esbuild`, `vite`, `vite-node`
- client `vite` `^5.4.10` → `^8.2.1` (three majors) — closes `vite` (high) and `esbuild`

**Both trees now report `found 0 vulnerabilities`, at every severity, dev included.**

**Nothing else needed changing, and that is the part that could not be known without trying.**
`vitest.config.ts` uses only options that survived both majors (`environment`, `include`,
`testTimeout`, `hookTimeout`, `setupFiles`, `fileParallelism`); the suite's entire `vi.*` surface
is `resetModules` / `fn` / `spyOn` / `mock` / `useFakeTimers` / `advanceTimersByTime` /
`useRealTimers` / `restoreAllMocks`, all still present in v4; and `client/vite.config.ts` uses
`publicDir`, `build.outDir`/`emptyOutDir`, `server.port` and `server.proxy`, unchanged in v8.
**No test file and no source file was edited** — worth stating, because a dependency bump that
quietly rewrites assertions is how a suite stops testing what it used to.

Verified rather than inferred: 226 unit tests green across 28 files under vitest 4; typecheck,
typecheck:client and lint clean; `sql:check` 39/39; the client production build succeeds on vite 8
(29 modules, 86.69 kB); and the vite 8 **dev server** boots with its API proxy still *engaging*
rather than falling through — `/health` returns 502 with no API running, which is precisely the
distinction the config comment records from the 2026-08-02 incident, where a missing proxy prefix
served HTML to a JSON parser. CI green on the pushed branch, all four jobs, `build-test` included.

**The `critical` label never reached a user, and that is why the rating was right.** Every
advisory here was on a devDependency; both `--omit=dev` trees already returned zero. T62 rated it
medium on exactly that reasoning, and closing it does not retro-justify a higher rating.

**Found and closed alongside it:** the CI `sca` job only ever scanned the root lockfile. T62
recorded that the client tree had never been through SCA at all — and the client is the tree
carrying the `vite` advisories. `ci.yml` now scans both lockfiles.

### SEC-013 — not fixed, because fixing it here would mean guessing

The finding asks for a CSP header from whatever fronts `client/index.html` in production, plus a
matching `<meta>` tag for dev. **The first half has no answer yet: nothing fronts it. There is no
deploy config, because that is T49, a human task.**

Adding only the dev `<meta>` tag was considered and rejected. In production the client talks to
the API on a *different origin* (`VITE_API_BASE`), whose host nobody knows yet. A policy written
today would have to guess that host or use `connect-src 'self'` — and `connect-src 'self'`
**breaks every API call the client makes**. A CSP that works in dev and silently breaks production
is worse than no CSP, because it looks done.

Open, with its blocker named: **SEC-013 needs T49's API host before it can be written.**

### SEC-009 — one third is human, one third is a decision nobody has made

The fix hint has three parts belonging to three different owners:

1. **`TRUST_PROXY` set to match the deployment** — an `.env`/deployment value that cannot even be
   chosen until T49 exists, because the correct value is the number of proxy hops in front of the
   app. Human, blocked on T49.
2. **A retention/rollup job for `analytics_event`** — the table is append-only and nothing ever
   deletes from it (PRV-1). How long analytics data may be kept is a **retention question the
   lawyer answers at T43**, and the privacy gate (T70) is the stage that *executes* retention
   rather than reading it. Inventing a window here means picking a number no document sets and
   wiring it into a job that then deletes real data.
3. **`actorFrom()` dropping attribution for a banned or missing profile** — the hint says
   "consider", and considering it yields a trade rather than a fix. It means loading the live
   profile on the app's only unauthenticated route: a database read added to the highest-volume
   write the server has. That is the same cost SEC-023 exists to bound, arriving from the other
   direction, and nothing upstream decides whether it is worth it.

The route remains unauthenticated by documented design (PRD R8), so what is left is residual risk
on an accepted design — exactly how the run rated it after re-assessing it downward.
