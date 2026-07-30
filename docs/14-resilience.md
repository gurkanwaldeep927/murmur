# Stage 14 — Resilience: Murmur

**Run:** T63 — `chaos-resilience-agent`, **first run, WARN-ONLY** (cadence.md §2, M2 row;
promotion mechanic §3: first run's exit-2 is disabled, second run T67/M4 is blocking).
**Date:** 2026-07-30
**Scope:** the T14a Moderation Gateway (`server/src/modules/moderation/`), plus the full
external-dependency map (moderation provider port, Email/OTP provider, PostgreSQL).
**Mandate:** this execution **is** the T56 outage drill, run independently of the code author
(`docs/07-plan.md` §4, T63 row: *"this execution **is** the T56 outage drill, run independently
by a separate agent"*).
**Verdict:** **fail** — 4 of 13 executed injections failed; 3 high findings, none waived. Warn-only
governs the *gate exit code*, not this verdict (cadence.md §3). None of this blocks M2 exit; all of
it must be closed before **T67 (M4, blocking)**.

---

## Phase 0 gate — record of disposition

| Precondition | State | Disposition |
|---|---|---|
| `docs/13-observability.md` handoff validates `status: pass` | **Does not exist** | Not a bypass. `quality-kit-additions/cadence.md` §2 (DECISION QK-4) schedules **resilience-agent's first run at M2 (T63)** and **observability-agent's first run at M5 (T71)** — the kit's generic stage ordering (13 → 14) is explicitly superseded by the milestone cadence. QK-4 is a recorded, in-repo decision. Recorded here and as **OQ-R2** so it is visible, not silent. |
| Fault injection only against `qk-chaos-*` instances this run started | **Held** | No container, no external service, no database was touched. Injection was in-process at the provider port with `server/src/db/pool.js` stubbed. Two disposable harness files (`tests/unit/qk-chaos-gateway-injection.test.ts`, `tests/unit/qk-chaos-retry-loop.test.ts`) were created, executed, and deleted — teardown proof in §6. |
| Skill `resilience-audit` readable | **Held** | `.claude/skills/resilience-audit/SKILL.md`, 6-step Method. Step 6 (restore drill) is out of scope for this run per DECISION QK-8 (*"first executed at the M4 resilience gate"*, cadence.md §5.3) — it lands at T67. |

**Material cost of running without stage 13.** Every "observed behavior" below is sourced from
captured process stdout (`pino` structured logs + harness `console.log`), not from a verified
log/metric/trace baseline. There is no evidence in this repo that a *deployed* Murmur emits the
signals an operator would need to notice any of the failure modes named here. `runbooks/moderation-provider-outage.md`
step 2 already assumes a queue-depth dashboard that does not exist yet (`[HUMAN: query or dashboard link]`).
Carried as **OQ-R2**.

**Environment constraint (stated, not worked around).** `DATABASE_URL` points at a live Supabase
instance holding real user data and is currently unreachable (IPv6-only host, IPv4 network). No
disposable Postgres exists. `npm test`, `tests/integration/*`, and `tests/nfr/*` were **not run** —
their harness (`tests/helpers/test-db.ts`) truncates. Consequence: the DB half of this stage
(kill test, pool exhaustion, DB-level toxiproxy injection, restore drill) is **deferred/unverified**
and escalated as **OQ-R1**, blocking on T67. Everything reported as *observed* below was actually
executed; nothing was simulated and reported as real.

---

## 1. Dependency map

Codebase scan: `grep -rn "fetch(\|axios\|node-fetch\|http.request\|https.request\|undici" server/src/`
returned **zero matches** — at M2 the server has no HTTP client of its own. The map is therefore
complete by construction: two TRD integrations plus the store.

| Dependency | Provenance | Timeout | Retry policy | Circuit breaker | Failure mode tested |
|---|---|---|---|---|---|
| **External AI Moderation API** (via the T14a port; no vendor bound until T14b/M6) | `TRD:integrations[External AI Moderation API]` | ✅ `config.moderationTimeoutMs` = **5000 ms**, enforced by `Promise.race` (`moderation.gateway.ts:44–68`). Observed firing at **309 ms** against a 300 ms override. | ⚠️ Bounded: `moderationMaxAttempts`=5, then auto-escalate. Backoff is **fixed 30 s** (`moderationRetryBackoffSeconds`), **not exponential, no jitter**. Worker tick 60 s (`moderationRetryIntervalSeconds`). → **RES-8** | ❌ **None** → **RES-9** | ✅ 13 injections, §3 |
| **Email / OTP Delivery Provider** (nodemailer 9.0.3 → SMTP) | `TRD:integrations[Email / OTP Delivery Provider]` | ❌ **None set.** `SmtpEmailProvider` (`email-provider.ts:78–83`) passes no `connectionTimeout` / `greetingTimeout` / `socketTimeout`; nodemailer library defaults (2 min / 30 s / 10 min) apply. → **RES-7** | ⚠️ 3 attempts, exponential 200 ms → 400 ms, **no jitter**; throws on exhaustion so A1 blocks registration (correct per TRD failure posture). → **RES-8** | ❌ None | ❌ Not tested (SMTP injection needs a `qk-chaos-` mail sink; deferred with OQ-R1) |
| **PostgreSQL** (pg 8.22.0 pool, `server/src/db/pool.ts`) | `TRD:stack.store`; `TRD:architecture_pattern` | ⚠️ **Partial.** `connectionTimeoutMillis: 10_000` bounds *acquisition*; there is **no** `statement_timeout`, `query_timeout`, or `idle_in_transaction_session_timeout`. The absent one is the one that bounds a *hung* (as opposed to down) dependency, so this row is recorded **false**. → **RES-5** | ❌ None at the application layer, and pg does not retry. `withTransaction` rolls back and rethrows. | ❌ None (`max: 10`; exhaustion surfaces as a 10 s connect timeout) | ❌ Deferred — no disposable DB (OQ-R1) |

---

## 2. The T14a claim, tested

> *"No verdict from the provider — timeout, outage, malformed response, or no provider configured
> at all — can ever result in published content. All four collapse to one `ProviderUnavailableError`
> with one handler, which holds the item `pending` and schedules a retry; past an attempt ceiling it
> auto-escalates to the human queue. It never publishes and never drops."*

Split into its four assertions:

| # | Assertion | Verdict | Basis |
|---|---|---|---|
| A | **Never publishes** on a missing verdict | **HOLDS** — not falsified by any of the 13 injections | Structural, and confirmed three ways: `TIER_TO_STATUS` has no failure branch; every content-mutating statement carries `AND moderation_status = 'pending'` (`gateway.ts:120`, `:127`); the content row is inserted `pending` in the *same transaction* as `openCase` (`content.service.ts:66–76`, `:154–163` — verified by reading both call sites, so the "insert succeeds, openCase fails" hole does not exist). |
| B | **Never drops** (the row survives) | **HOLDS** | Content is durable before any classification is attempted; a crash between the insert transaction and the verdict transaction leaves `decision='pending'`, `risk_tier IS NULL`, `attempts=0`, `lastAttemptAt IS NULL`, which is exactly `claimRetryableCases`' predicate (`moderation.repo.ts:183–197`). Statically verified; the crash itself is deferred (OQ-R1). |
| C | **All four failures collapse to one `ProviderUnavailableError`** | **FALSE** | Two of the four named failures do not. **Malformed response** surfaces as a Postgres `23502` (**RES-1**). **"No provider configured"** is true only for *unset*; a *misconfigured* name surfaces as a plain `Error` (**RES-2**). Timeout and outage do collapse correctly, as observed. |
| D | **Past an attempt ceiling it auto-escalates to the human queue** | **FALSE in the failure modes C exposes** | Because the ceiling is only advanced by `recordFailedAttempt`, which only runs on a `ProviderUnavailableError` (`gateway.ts:167–170`), any other error leaves `attempts` frozen. Observed: 8 consecutive retry passes, `attempts` never left 0, `risk_tier` never left NULL (**RES-3**). Under the correct `ProviderUnavailableError` path the ceiling works exactly as claimed. |

**Net:** the safety half of the claim (never publishes, never drops) survived every probe I could
throw at it without a database. The *liveness* half — "and a human eventually sees it" — does not.
There are reachable states in which content is held `pending` forever, retried forever, and is
**invisible to the S16 escalation queue**, whose index selects `WHERE risk_tier = 'escalate' AND
decision = 'pending'` (`migrations/002_content.up.sql:105–106`). That is not a publish-path breach
of R6, but it is a breach of R6 AC3's route to a human decision and of `TRD:integrations[…]
failure_posture` ("auto-escalated to human queue past a threshold").

---

## 3. Fault injection matrix (executed)

**Method.** In-process injection at the `ModerationProvider` port via the exported test seam
`setProvidersForTest` (`providers/index.ts:83`), with `server/src/db/pool.js` replaced by a
recorder that reproduces only migration 002's NOT NULL constraints
(`002_content.up.sql:38`, `:58`, `:81`). No network, no container, no Postgres.
**Runner:** `vitest@2.1.9` / `node v22.17.0` / win32-x64.
**Command:** `DATABASE_URL="postgres://qk-chaos:qk-chaos@127.0.0.1:1/qk_chaos_never_connected"
EMAIL_HASH_PEPPER_ACTIVE="v1:qk-chaos" SESSION_SIGNING_KEY="v1:qk-chaos" MODERATION_TIMEOUT_MS=300
MODERATION_MAX_ATTEMPTS=3 MODERATION_RETRY_BACKOFF_SECONDS=0 npx vitest run tests/unit/qk-chaos-*.test.ts`
(the unreachable `DATABASE_URL` is deliberate: it overrides `.env` so the real Supabase string
cannot be read even by accident.)

Expected-behavior column cites `TRD:integrations[External AI Moderation API].failure_posture`
("Fail-closed: content held pending, retried with backoff, auto-escalated to human queue past a
threshold; never auto-published or silently dropped on outage") and `UX`'s 202/`pendingReview`
contract (`content.routes.ts:54`, `:64`, `:68`).

| # | Fault | Target | Expected | **Observed (captured)** | Verdict |
|---|---|---|---|---|---|
| 1 | **DOWN** — no provider configured (`hold-all`) | `classifyAndApply` | Held `pending`, content row untouched | `outcome = {"caseId":"qk-chaos-case-1","status":"pending","riskTier":null,"held":true}` · `content-status writes = []` · log: `"moderation provider unavailable — content held pending, retry scheduled (fail-closed)"` | **pass** |
| 2 | **SLOW** — provider latency 4× timeout | `classifyWithTimeout` | Timeout fires at the configured value; fail fast; held | `configured timeout=300ms elapsed=309ms outcome={…"status":"pending"…}` · `content-status writes = []` | **pass** |
| 3 | **SLOW → late reject** — loser-promise probe | `Promise.race` | No double-apply, no unhandled rejection | `losing provider promise still ran to completion (no cancellation): true` · `content-status writes after late settle = []` · `unhandled= 0` | **pass** (with **RES-10**: no cancellation) |
| 4 | **FLAKY** — 50% resets over 6 calls | `classifyAndApply` | Failures hold; successes apply exactly once; no duplicate side-effects | `statuses = ["pending","published","pending","published","pending","published"]` · `content-status writes = ["published","published","published"]` | **pass** |
| 5 | **MALFORMED** — provider returns `tier:"OK"` | `TIER_TO_STATUS[verdict.tier]` | Per the claim: collapses to `ProviderUnavailableError`, held, retry scheduled | `threw = Error: null value in column "decision" of relation "moderation_case" violates not-null constraint \| code = 23502 \| isProviderUnavailableError = false \| returned = undefined` · `recordFailedAttempt calls = 0 \| escalateToHuman calls = 0` | **fail** → **RES-1** |
| 6 | **MISCONFIGURED** — `MODERATION_PROVIDER=openai` | `resolveProviders()` | Per the in-code comment: *"Fail at startup, loudly"* | `threw = Error: Unknown moderation provider "openai". Known: fixture \| isProviderUnavailableError = false \| returned = undefined` · `recordFailedAttempt calls = 0` — and it threw on the **first UGC write**, not at startup | **fail** → **RES-2** |
| 7 | **Attempt ceiling** — exhaustion under DOWN | `classifyAndApply` | Auto-escalate to human queue on the ceiling attempt | `maxAttempts=3 below={…"riskTier":null…} atCeiling={…"riskTier":"escalate","held":true} escalateToHuman calls=1` · log: `"moderation attempts exhausted — auto-escalated to the human queue (fail-closed)"` | **pass** |
| 8 | **Tier-2 DOWN** after tier-1 `escalate` | `classifyTiered` catch | Keep tier-1's `escalate`; hold | `outcome = {…"status":"pending","riskTier":"escalate","held":true}` · `content-status writes = []` | **pass** — the tier-2 fallback path *is* safe |
| 9 | **Tier-2 adapter bug** (`TypeError`, not a PUE) | `classifyTiered` catch | — | `outcome = {…"riskTier":"escalate","held":true}`, logged as `"tier-2 moderation provider unavailable — keeping tier-1 escalate verdict"` | **pass** (safe direction) — but see **RES-12** |
| 10 | **Tier-2 upgrade** — tier-1 `escalate`, tier-2 `auto_pass` | `classifyTiered` | Tier-2 is authoritative (TRD §8 tiering) | `outcome = {…"status":"published","riskTier":"auto_pass","held":false}` · `content-status writes = ["published"]` | **pass** (by design) — hand to T64, **RES-13** |
| 11 | **DB fault inside `applyVerdict`** (connect timeout) | `classifyAndApply` catch | — | `threw = Error: timeout exceeded when trying to connect \| isProviderUnavailableError = false` — escapes to A3, user gets a generic 500 envelope (`app.ts:52`) | **fail** → **RES-3** |
| 12 | **Retry worker, 5 passes under DOWN** | `runModerationRetryPass` | attempts advance 1→2→3, then escalate | `claimRetryable(max=3, attempts=0) -> 1` / `recordFailedAttempt(attempts:=1)` / … / `recordFailedAttempt(attempts:=3)` / `escalateToHuman` / then `claimRetryable(max=3, attempts=3) -> 0` · final `{"decision":"pending","risk_tier":"escalate","attempts":3,"moderation_status":"pending"}` | **pass** |
| 13 | **Retry worker, 8 passes under MALFORMED** | `runModerationRetryPass` | attempts advance, ceiling reached, escalated | `claimRetryable(max=3, attempts=0) -> 1` / `recordVerdict -> 23502 NOT NULL VIOLATION` — **repeated identically 8 times** · final `{"decision":"pending","risk_tier":null,"attempts":0,"moderation_status":"pending"}` · `passes=8 attempts=0 risk_tier=null` | **fail** → **RES-3** |

**Baseline (control):** `npx vitest run tests/unit` — **35 passed / 4 files**, including
`tests/unit/moderation-providers.test.ts`. Unchanged by this run.

---

## 4. Findings

All provenance is `manual review + vitest@2.1.9 in-process injection (T63 harness)` unless noted;
severity per `.claude/skills/resilience-audit/SKILL.md` Method step 1.

### RES-1 — high — malformed provider verdict is not validated at the port boundary
**Location:** `server/src/modules/moderation/moderation.gateway.ts:108` (`const status = TIER_TO_STATUS[verdict.tier]`)
**Evidence:** injection #5 — `Error: null value in column "decision" … violates not-null constraint | code = 23502 | isProviderUnavailableError = false`.
An out-of-vocabulary `tier` yields `status === undefined`, which node-pg binds as SQL NULL against
`moderation_case.decision NOT NULL` (`002_content.up.sql:81`). The whole verdict transaction rolls
back and the error escapes as a non-`ProviderUnavailableError`. The same applies to a non-numeric
`score` (`22P02`). Nothing anywhere validates a `ProviderVerdict` — the gateway trusts adapter
output completely, which is precisely the trust boundary T14b's vendor adapters will sit on.
**Fix hint:** validate at the port edge — if `verdict.tier` is not one of `auto_pass|auto_block|escalate`
(and `score`, when present, is a finite 0–1 number), throw `new ProviderUnavailableError(providerName,
"malformed verdict")`. One guard in `classifyWithTimeout` makes the documented claim true and makes it
impossible for a T14b adapter to get wrong.

### RES-2 — high — a misconfigured `MODERATION_PROVIDER` fails at first write, not at startup
**Location:** `server/src/modules/moderation/providers/index.ts:26–47` and `:58`; called only from `moderation.gateway.ts:81`
**Evidence:** injection #6 — `Error: Unknown moderation provider "openai". Known: fixture`, thrown on
the first UGC write, `isProviderUnavailableError = false`. `resolveProviders()` is lazy and memoized;
`grep -rn "resolveProviders" server/src/` shows **no boot-time call site**. The in-code comment claims
*"Fail at startup, loudly, rather than silently downgrade to hold-all"* — the intent is right, the
wiring is missing. `/health` (`app.ts:22–28`) probes only Postgres, so a deployment with a typo'd or
not-yet-implemented provider name reports **healthy** and then 500s every post.
**Fix hint:** call `resolveProviders()` once in `createApp()` and in the worker's `start()`, and add
its result to `/health`. This becomes a live risk the moment T14b introduces real provider names.

### RES-3 — high — any non-`ProviderUnavailableError` freezes the attempt counter, so the case never reaches the human queue
**Location:** `moderation.gateway.ts:167–170` (`if (!(err instanceof ProviderUnavailableError)) throw err;` — `recordFailedAttempt` is *inside* the PUE branch) + `moderation-retry.job.ts:67–72` (catch logs and continues without advancing any state)
**Evidence:** injection #13 — 8 retry passes, `claimRetryable(max=3, attempts=0) -> 1` and
`recordVerdict -> 23502 NOT NULL VIOLATION` repeated identically; final state
`{"decision":"pending","risk_tier":null,"attempts":0}`.
This is the amplifier that turns RES-1, RES-2, and any transient DB fault (injection #11) into a
**permanent, silent hold**. `claimRetryableCases` keeps selecting the case forever (`attempts < max`);
`claimExhaustedCases` never selects it (`attempts >= max`); the S16 escalation index
(`risk_tier = 'escalate'`) never sees it. The user is told 202/"pending review" and no human is ever
routed to it. It does not publish and it does not drop — but "never drops" is doing less work than the
claim implies once nobody can ever find the item.
**Fix hint:** move attempt bookkeeping out of the PUE branch — record a failed attempt for *any* error,
then rethrow non-PUE errors. A case that fails N times for *any* reason belongs to a human. Optionally
add a `pending`-age watchdog to `sync-reconciliation.job.ts`'s sibling slot (T32/M4).

### RES-4 — medium — `FOR UPDATE SKIP LOCKED` gives no mutual exclusion across the classify window
**Location:** `moderation.repo.ts:176–211` + `moderation-retry.job.ts:48–55` + `worker/index.ts:26–31`
**Evidence:** static (concurrency needs a real DB — deferred with OQ-R1). The claim transaction
commits *before* classification (`moderation-retry.job.ts:48`, deliberately, so no lock is held across
a network call — a good instinct), which releases the row locks; and nothing about the claimed row is
mutated at claim time (`attempts` and `lastAttemptAt` are only written *after* the attempt completes).
So a second reader re-satisfies the identical predicate. The worker schedules with `setInterval` and
**no overlap guard**: at `BATCH_LIMIT = 50` × `moderationTimeoutMs = 5000 ms` a single pass can take
~250 s against a 60 s tick, so overlapping passes are the expected steady state under a real provider
outage, in one process, before anyone runs two workers. Consequences: duplicated provider calls (paid,
RR-9) and lost updates on `_gateway.attempts` (`recordFailedAttempt` replaces the whole jsonb rather
than incrementing), so the ceiling under-counts. **Not** a publish risk — every mutating statement is
guarded by `WHERE … = 'pending'` and injection #4 confirmed exactly-once application.
**Fix hint:** stamp a lease inside the claim transaction (`lastAttemptAt := now()` and/or `attempts + 1`
in the same `UPDATE … RETURNING`), and guard the interval (`if (running) return;`).

### RES-5 — medium — no statement/query timeout on Postgres
**Location:** `server/src/db/pool.ts:8–13`
**Evidence:** `connectionTimeoutMillis: 10_000` present; `statement_timeout`, `query_timeout`, and
`idle_in_transaction_session_timeout` all absent. A hung (not down) database hangs every request and
`/health`'s `SELECT 1` (`app.ts:24`) indefinitely, so the platform probe cannot distinguish "slow" from
"wedged". Per skill Method step 1, an infinite/library-default timeout on a critical-path dependency is
a finding.
**Fix hint:** `statement_timeout` + `query_timeout` on the pool config; `idle_in_transaction_session_timeout`
on the connection, which also bounds the `withTransaction` window.

### RES-6 — medium — unguarded ROLLBACK masks the original error and can recycle a dirty client
**Location:** `server/src/db/pool.ts:33–38`
```ts
} catch (err) {
  await client.query("ROLLBACK");   // <- can itself reject; not wrapped
  throw err;
} finally {
  client.release();                 // <- never told the client is broken
}
```
**Evidence:** static read. The `finally` guarantees the client is released, so there is **no handle
leak** — the direct question asked. But if `ROLLBACK` rejects (the common case when the underlying
error *was* a connection failure), that rejection replaces `err` and the real cause is lost from logs;
and `release()` is never called as `release(err)`, so a client whose transaction state is indeterminate
goes back into the pool for the next borrower.
**Fix hint:** `try { await client.query("ROLLBACK"); } catch (rbErr) { rollbackFailed = rbErr; }` then
`client.release(rollbackFailed ? err : undefined)` and always rethrow the original `err`.

### RES-7 — medium — SMTP transport has no timeouts
**Location:** `server/src/modules/notification/email-provider.ts:78–83`
**Evidence:** `nodemailer.createTransport` is given host/port/secure/auth and nothing else; nodemailer
9.0.3 defaults are `connectionTimeout` 2 min, `greetingTimeout` 30 s, `socketTimeout` 10 min. Multiplied
by `RetryingEmailProvider`'s 3 attempts (`:114–135`), a black-holing SMTP server can hold a user's A1
request for tens of minutes. `TRD:integrations[Email / OTP Delivery Provider].failure_posture`
("retry with backoff; user-visible resend affordance; registration blocked … if delivery cannot be
confirmed") presupposes a *bounded* failure; unbounded, the user gets neither the block nor the resend.
**Fix hint:** set all three timeouts explicitly (e.g. 5 s / 5 s / 10 s) and keep `maxAttempts = 3`.

### RES-8 — medium — neither retry policy has jitter; the moderation backoff does not grow
**Location:** `email-provider.ts:130` (`sleep(this.baseDelayMs * 2 ** (attempt - 1))` — exponential, deterministic); `config/index.ts` `moderationRetryBackoffSeconds: 30` + `moderationRetryIntervalSeconds: 60` (flat)
**Evidence:** static read of both. Skill Method step 1: *"no backoff+jitter => medium"*. The moderation
case is the sharper one: every item held during an outage becomes due at the same fixed 30 s offset and
is swept by the same 60 s tick in the same 50-item batch, so a recovering provider is hit by a
synchronized herd — and with `hold-all` as the default through M2–M5, *every* item in the system is in
that state. Neither retry is on a non-idempotent write (moderation classify is a read-only
classification; the verdict write is guarded by `WHERE decision = 'pending'`), so the critical
"retrying non-idempotent writes" rule is **not** triggered.
**Fix hint:** full jitter on both (`random() * delay`), and grow the moderation backoff per attempt.

### RES-9 — high — no circuit breaker on the moderation provider, which the TRD names as the critical-path dependency
**Location:** `moderation.gateway.ts:78–98` (no breaker anywhere in `providers/` or the gateway)
**Evidence:** `TRD:architecture_pattern` §1 names AI moderation as *"the one component with a real
external dependency and failure mode of its own"*, and it sits inline in A3/A4's request path
(`content.service.ts:87`, `:182`). Skill Method step 1: *"circuit breaker where TRD marks critical-path
(absent => high)"*. **Exposure window:** not reachable today — `hold-all` rejects synchronously
(injection #1 returned in ~0 ms), so M2–M5 pay nothing. It becomes live the instant **T14b** binds a
network provider: every write then pays 5 s (or 10 s across both tiers) before returning 202, and the
retry worker serializes 50 × 5 s per pass. `RR-4` records that dual-provider fallback was deliberately
deferred, which means a breaker is the *only* remaining bound on outage cost.
**Fix hint:** an open-circuit state that short-circuits straight to `ProviderUnavailableError` (already
the safe path — no new failure semantics needed) after N consecutive failures, with a half-open probe.
Must land **with T14b, and before T67**.

### RES-10 — low — `Promise.race` timeout does not cancel the losing provider call
**Location:** `moderation.gateway.ts:44–68`; the port (`moderation.types.ts:62–65`) has no cancellation signal
**Evidence:** injection #3 — `losing provider promise still ran to completion (no cancellation): true`.
The good news is also observed: no double-apply (`content-status writes after late settle = []`) and no
unhandled rejection (`unhandled= 0`), because `Promise.race` keeps handlers attached. The cost is
resource, not correctness: with a real HTTP adapter every timed-out call leaks an in-flight request and
socket, precisely while the provider is already struggling.
**Fix hint:** add `signal?: AbortSignal` to `ClassifyInput` and abort it in the `finally` alongside
`clearTimeout`. One line now; a port-signature change after T14b.

### RES-11 — low — worker shutdown does not drain in-flight jobs
**Location:** `server/src/worker/index.ts:42–49` — clears intervals, then `closePool()` and `process.exit(0)` without awaiting a running pass
**Evidence:** static read. Fail-closed survives (an interrupted classify leaves the case `pending` and
claimable), but a transaction can be cut mid-statement and the run is another way `attempts` fails to
advance (see RES-3). The API process has the same shape but `server.close()` at least waits for
in-flight requests (`index.ts:14–19`).
**Fix hint:** track the in-flight promise per job and `await` it before `closePool()`.

### RES-12 — low — the tier-2 catch swallows non-provider errors
**Location:** `moderation.gateway.ts:91–97` — `catch (err)` with no type check
**Evidence:** injection #9 — a `TypeError` from a tier-2 adapter was logged as *"tier-2 moderation
provider unavailable — keeping tier-1 escalate verdict"* and became an `escalate`. The direction is
conservative and correct, so this is not a safety issue; the problem is that a genuine T14b adapter bug
will be indistinguishable from a vendor outage in the logs, and will silently inflate the human
escalation queue (RR-3, single-founder capacity).
**Fix hint:** keep the fallback, but log non-PUE errors at `error` with a distinct message.

### RES-13 — info — tier-2 can upgrade a tier-1 `escalate` into `published`
**Location:** `moderation.gateway.ts:88–90`
**Evidence:** injection #10 — `outcome = {…"status":"published","riskTier":"auto_pass","held":false}`.
Correct per TRD §8's tiering (tier 2 is the more accurate model), and recorded here only because it is
the exact surface DECISION QK-5 / **T64** must probe: an injection that makes tier 1 say `escalate` and
tier 2 say `auto_pass` publishes. Cadence.md §4 already says *"an injection that downgrades tier is a
finding even if the final verdict holds"*; this is the inverse and it publishes. Hand-off to T64/M6.

### RES-14 — medium — T56's outage drill leaves three of the four claimed failure modes uncovered
**Location:** `tests/nfr/moderation-coverage.test.ts`
**Evidence:** independent review per this run's mandate. The suite is good on what it covers
(coverage reconciliation, orphan-case check, zero-auto-publish, 202 contract, ceiling escalation,
feed invisibility). What it never exercises: **SLOW** — `[[moderation:timeout]]` in `fixture.provider.ts:36`
rejects *synchronously*, so it is an outage, not a timeout, and `classifyWithTimeout`'s race branch
(`gateway.ts:50–64`) has **zero coverage in the repo suite**; **FLAKY**; and **MALFORMED**, whose
absence is exactly why RES-1 shipped. `withUnavailableProvider` only ever swaps in `hold-all`, i.e. it
re-tests the default the app already runs in.
**Fix hint:** for **test-writer-agent** (QK-6 — authorship is not this agent's role): add a
latency-injecting stub, an alternating-failure stub, and an out-of-vocabulary-verdict stub to
`tests/nfr/moderation-coverage.test.ts`, plus `SECREG-RES-1`, `SECREG-RES-2`, `SECREG-RES-3` pinning
tests once those are fixed (write-tests skill rule 5). The T63 harness in §3 is a working reference
implementation of all three.

**Counts:** critical 0 · high 3 (RES-1, RES-2, RES-3; RES-9 high but not yet reachable) · medium 5 ·
low 3 · info 1. **No waivers exist** (`.pipeline/waivers/` — none cited, none created; only a human
may create one).

---

## 5. Deferred / unverified (no disposable database)

Stated plainly so nobody mistakes absence for a pass. Each needs a throwaway Postgres named `*test*`,
reachable via Supabase's IPv4 pooler host or a free Neon database — **not** the current `DATABASE_URL`.

| Skill step | Check | Status | What it would take |
|---|---|---|---|
| 4 | **Kill test** — SIGKILL mid-write, restart, assert no half-committed state | **Deferred.** Static reading is favorable (insert+`openCase` share one transaction; the verdict is a second transaction; `claimRetryableCases` re-picks anything in between) but *unobserved*. | Disposable DB + a supervised process; kill between the two transactions and after `recordFailedAttempt` but before `escalateToHuman` (`gateway.ts:170` → `:175` — two non-atomic statements on `pool`; pass 1 of the worker is designed to heal it, and that healing is also unobserved). |
| 3 | **Postgres DOWN / SLOW / FLAKY** via toxiproxy | **Deferred.** | `qk-chaos-pg` container + `qk-chaos-toxiproxy`; would confirm RES-5 and RES-6 empirically. |
| 1 | **Pool exhaustion** at `max: 10` | **Deferred.** | Concurrent A3 load against a disposable DB. |
| 1 | **Concurrent double-classification** (RES-4) | **Deferred.** | Two worker processes against one disposable DB. |
| 3 | **SMTP DOWN / SLOW** (RES-7) | **Deferred.** | A `qk-chaos-smtp` sink (e.g. MailHog) — does not need a DB, but does need A1, which does. |
| 6 | **Restore drill** (RPO/RTO) | **Out of scope by decision**, not by constraint — DECISION QK-8 places it at the M4 gate (T67). | T49 staging DB; never production. |

---

## 6. Teardown proof

Two harness files were created under `tests/unit/`, executed, and removed:
`qk-chaos-gateway-injection.test.ts`, `qk-chaos-retry-loop.test.ts`.

```
$ find . -name "qk-chaos*" -not -path "./node_modules/*"
(no output)
$ docker ps -a --format "{{.Names}}" | grep qk-chaos
(no docker containers / none matching)
```

No container, VM, database, queue, or external account was created. The only `qk-chaos-` string
that ever reached a network stack was the deliberately unroutable
`postgres://qk-chaos:qk-chaos@127.0.0.1:1/qk_chaos_never_connected`, which no code path dialed
(`db/pool.js` was module-mocked). `.env` was not read, modified, or logged. No test that truncates
was run: `npm test`, `tests/integration/*`, and `tests/nfr/*` were never invoked; only
`tests/unit` (35 passed) and the two deleted harness files.

---

## 7. What must be fixed before T67 (M4, blocking)

Ordered by leverage, not severity:

1. **RES-3** — record a failed attempt for *any* error, not only `ProviderUnavailableError`. One
   change; it closes the permanent-invisible-hold class for every present and future trigger.
2. **RES-1** — validate `ProviderVerdict` at the port boundary. Makes the documented claim true, and
   makes it un-get-wrong-able for T14b's adapters.
3. **RES-2** — resolve providers at boot and surface it on `/health`.
4. **RES-9** + **RES-10** — circuit breaker and `AbortSignal`; both are cheap now and become port
   changes after T14b. Must ship *with* T14b.
5. **RES-4** — stamp a lease in the claim transaction and guard the `setInterval`, before any paid
   provider is bound (RR-9) and before T67 injects latency on the sync path.
6. **RES-5 / RES-6 / RES-7 / RES-8** — the dependency-configuration set: statement timeouts, safe
   rollback, SMTP timeouts, jitter.
7. **OQ-R1** — procure the disposable database. Without it, T67 (M4, **blocking**) cannot run at all:
   its scope is kill-mid-batch, latency/partition injection, and the restore drill, none of which have
   a DB-free form. This has procurement lead time and is the single item most likely to stall M4 exit.

---

## 8. Open Questions

| ID | Question | Owner | Blocking |
|---|---|---|---|
| **OQ-R1** | No disposable test database exists anywhere in this project. `DATABASE_URL` points at a live Supabase instance holding real user data, and `tests/helpers/test-db.ts` truncates, so the entire database half of stage 14 — kill test, pool exhaustion, DB-level fault injection, concurrent-worker double-classification, and the QK-8 restore drill — is unexecuted and unverifiable. This does **not** block M2 exit (T63 is warn-only per cadence.md §3), but **T67 at M4 is blocking and has no DB-free form**: its entire scope is kill-mid-batch, latency/partition injection on the sync path, and a restore drill with recorded RPO/RTO. A throwaway Postgres named `*test*` — via Supabase's IPv4 pooler host or a free Neon database — must exist before M4 exit is attemptable. | human | **true** |
| **OQ-R2** | `docs/13-observability.md` does not exist, because DECISION QK-4 schedules observability-agent's first run at M5 (T71) and resilience-agent's first run at M2 (T63) — the stage-14 skill's own Phase 0 gate ("chaos without observability produces unreadable experiments") is therefore structurally unsatisfiable at M2 and will remain so until T71. Every observation in this document comes from harness stdout, not from a deployed telemetry stack; there is no evidence Murmur emits the signals an operator needs to notice RES-3's silent-hold state, and `runbooks/moderation-provider-outage.md` step 2 already presumes a queue-depth dashboard that does not exist. Should T71 be pulled earlier, or is the cadence's ordering accepted with this cost recorded? | human | false |
| **OQ-R3** | `RR-4` records that dual-provider fallback was *"deliberately deferred `[ASSUMPTION]`"*. Combined with RES-9 (no circuit breaker), a T14b provider outage means every UGC write pays the full 5 s (or 10 s two-tier) timeout inline and the entire campus's content routes to a single-founder escalation queue (RR-3). `runbooks/moderation-provider-outage.md` step 5 already concedes the switch is *"a DEPLOY, not a toggle"*. Is that accepted for launch, or does T14b need a second adapter? | human | false |

---

## 9. JSON Handoff

`inputs_consumed[].handoff_sha256` is the SHA-256 of the whole source document (there is no separately
addressable handoff blob in these files); computed with `sha256sum` on 2026-07-30.

```json
{
  "stage": "resilience",
  "schema_version": "1.0",
  "inputs_consumed": [
    { "stage": "trd", "handoff_sha256": "a3c530ee274aa17ff2afc669d215e0369a8b8b9630e9e99e040f648655377724" },
    { "stage": "ux", "handoff_sha256": "541a40586ae3ce43d051e4ee0c26077ddc5f9d8c468bc0aa52aabee69ddd54a4" },
    { "stage": "plan", "handoff_sha256": "42a3280189af8afbd5dad1e904ace0182097b2ba6dcbd1dd33936929ac69f128" },
    { "stage": "cadence", "handoff_sha256": "7b4908525595df37d64a5a47c19e684b1e9ac0a22c36bd8fde695e22a8faa432" }
  ],
  "status": "fail",
  "open_questions": [
    {
      "id": "OQ-R1",
      "text": "No disposable test database exists anywhere in this project. DATABASE_URL points at a live Supabase instance holding real user data, and tests/helpers/test-db.ts truncates, so the entire database half of stage 14 — kill test, pool exhaustion, DB-level fault injection, concurrent-worker double-classification, and the QK-8 restore drill — is unexecuted and unverifiable. This does not block M2 exit (T63 is warn-only per cadence.md §3), but T67 at M4 is blocking and has no DB-free form: its entire scope is kill-mid-batch, latency/partition injection on the sync path, and a restore drill with recorded RPO/RTO. A throwaway Postgres named *test* — via Supabase's IPv4 pooler host or a free Neon database — must exist before M4 exit is attemptable.",
      "owner": "human",
      "blocking": true
    },
    {
      "id": "OQ-R2",
      "text": "docs/13-observability.md does not exist, because DECISION QK-4 schedules observability-agent's first run at M5 (T71) and resilience-agent's first run at M2 (T63) — the stage-14 skill's own Phase 0 gate ('chaos without observability produces unreadable experiments') is therefore structurally unsatisfiable at M2 and will remain so until T71. Every observation in this document comes from harness stdout, not from a deployed telemetry stack; there is no evidence Murmur emits the signals an operator needs to notice RES-3's silent-hold state, and runbooks/moderation-provider-outage.md step 2 already presumes a queue-depth dashboard that does not exist. Should T71 be pulled earlier, or is the cadence's ordering accepted with this cost recorded?",
      "owner": "human",
      "blocking": false
    },
    {
      "id": "OQ-R3",
      "text": "RR-4 records that dual-provider fallback was deliberately deferred [ASSUMPTION]. Combined with RES-9 (no circuit breaker), a T14b provider outage means every UGC write pays the full 5s (or 10s two-tier) timeout inline and the entire campus's content routes to a single-founder escalation queue (RR-3). runbooks/moderation-provider-outage.md step 5 already concedes the switch is 'a DEPLOY, not a toggle'. Is that accepted for launch, or does T14b need a second adapter?",
      "owner": "human",
      "blocking": false
    }
  ],
  "waivers_cited": [],
  "dependency_map": [
    {
      "dependency": "External AI Moderation API (T14a port; no vendor bound until T14b/M6)",
      "timeout_configured": true,
      "retry_policy": "bounded: moderationMaxAttempts=5, fixed 30s backoff (moderationRetryBackoffSeconds), 60s worker tick, no exponential growth, no jitter; auto-escalate to human queue past the ceiling",
      "circuit_breaker": false,
      "failure_mode_tested": true
    },
    {
      "dependency": "Email / OTP Delivery Provider (nodemailer@9.0.3 SMTP)",
      "timeout_configured": false,
      "retry_policy": "3 attempts, exponential 200ms/400ms, no jitter; throws on exhaustion so A1 blocks registration",
      "circuit_breaker": false,
      "failure_mode_tested": false
    },
    {
      "dependency": "PostgreSQL (pg@8.22.0 pool, server/src/db/pool.ts)",
      "timeout_configured": false,
      "retry_policy": "none at the application layer; withTransaction rolls back and rethrows",
      "circuit_breaker": false,
      "failure_mode_tested": false
    }
  ],
  "fault_injections": [
    { "fault": "DOWN — no provider configured (hold-all)", "target": "moderation provider port / classifyAndApply", "expected_behavior": "TRD:integrations[External AI Moderation API].failure_posture — content held pending, never auto-published or dropped", "observed_behavior": "outcome = {\"caseId\":\"qk-chaos-case-1\",\"status\":\"pending\",\"riskTier\":null,\"held\":true}; content-status writes = []; log: 'moderation provider unavailable — content held pending, retry scheduled (fail-closed)'", "verdict": "pass" },
    { "fault": "SLOW — provider latency 4x the configured timeout", "target": "classifyWithTimeout (Promise.race)", "expected_behavior": "timeout fires at config.moderationTimeoutMs, request fails fast, item held", "observed_behavior": "configured timeout=300ms elapsed=309ms outcome={...\"status\":\"pending\",\"held\":true}; content-status writes = []", "verdict": "pass" },
    { "fault": "SLOW then late REJECT — losing-promise probe", "target": "Promise.race in classifyWithTimeout", "expected_behavior": "no double-apply of a late verdict, no unhandled rejection", "observed_behavior": "losing provider promise still ran to completion (no cancellation): true; content-status writes after late settle = []; unhandled= 0", "verdict": "pass" },
    { "fault": "FLAKY — 50% resets over 6 calls", "target": "classifyAndApply", "expected_behavior": "failures hold; successes apply exactly once; no duplicated side-effects", "observed_behavior": "statuses = [\"pending\",\"published\",\"pending\",\"published\",\"pending\",\"published\"]; content-status writes = [\"published\",\"published\",\"published\"]", "verdict": "pass" },
    { "fault": "MALFORMED — provider returns an out-of-vocabulary tier (\"OK\")", "target": "TIER_TO_STATUS[verdict.tier] -> recordVerdict", "expected_behavior": "per the T14a claim, collapses to ProviderUnavailableError, item held, retry scheduled", "observed_behavior": "threw = Error: null value in column \"decision\" of relation \"moderation_case\" violates not-null constraint | code = 23502 | isProviderUnavailableError = false | returned = undefined; recordFailedAttempt calls = 0 | escalateToHuman calls = 0", "verdict": "fail" },
    { "fault": "MISCONFIGURED — MODERATION_PROVIDER=openai (unknown name)", "target": "resolveProviders()", "expected_behavior": "per the in-code comment, 'fail at startup, loudly'", "observed_behavior": "threw = Error: Unknown moderation provider \"openai\". Known: fixture | isProviderUnavailableError = false | returned = undefined; recordFailedAttempt calls = 0; thrown on the first UGC write, not at startup", "verdict": "fail" },
    { "fault": "ATTEMPT CEILING — exhaustion under sustained DOWN", "target": "classifyAndApply ceiling branch", "expected_behavior": "auto-escalate to the Human Escalation Queue on the ceiling attempt; never publish", "observed_behavior": "maxAttempts=3 below={...\"riskTier\":null...} atCeiling={...\"riskTier\":\"escalate\",\"held\":true} escalateToHuman calls=1; log: 'moderation attempts exhausted — auto-escalated to the human queue (fail-closed)'", "verdict": "pass" },
    { "fault": "TIER-2 DOWN after a tier-1 escalate verdict", "target": "classifyTiered fallback", "expected_behavior": "keep tier-1's escalate (strictly more conservative than retrying); hold content", "observed_behavior": "outcome = {...\"status\":\"pending\",\"riskTier\":\"escalate\",\"held\":true}; content-status writes = []", "verdict": "pass" },
    { "fault": "TIER-2 adapter bug (TypeError, not a ProviderUnavailableError)", "target": "classifyTiered catch", "expected_behavior": "no publish; safe direction", "observed_behavior": "outcome = {...\"riskTier\":\"escalate\",\"held\":true}, logged as 'tier-2 moderation provider unavailable — keeping tier-1 escalate verdict' — a code bug is indistinguishable from a vendor outage in the logs (RES-12)", "verdict": "pass" },
    { "fault": "TIER-2 UPGRADE — tier-1 escalate, tier-2 auto_pass", "target": "classifyTiered", "expected_behavior": "tier-2 is authoritative per TRD section 8 tiering", "observed_behavior": "outcome = {...\"status\":\"published\",\"riskTier\":\"auto_pass\",\"held\":false}; content-status writes = [\"published\"] — the exact surface QK-5/T64 must probe adversarially (RES-13)", "verdict": "pass" },
    { "fault": "DB FAULT — connection timeout inside applyVerdict's transaction", "target": "classifyAndApply catch", "expected_behavior": "hold the item and count the attempt, per the single-handler claim", "observed_behavior": "threw = Error: timeout exceeded when trying to connect | isProviderUnavailableError = false — escapes to A3 as a generic 500 envelope (app.ts:52) with the attempt uncounted", "verdict": "fail" },
    { "fault": "RETRY WORKER — 5 passes under sustained DOWN", "target": "runModerationRetryPass", "expected_behavior": "attempts advance to the ceiling, then the case is escalated and stops being retried", "observed_behavior": "claimRetryable(max=3, attempts=0) -> 1 / recordFailedAttempt(attempts:=1) / ... / recordFailedAttempt(attempts:=3) / escalateToHuman / then claimRetryable(max=3, attempts=3) -> 0; final {\"decision\":\"pending\",\"risk_tier\":\"escalate\",\"attempts\":3,\"moderation_status\":\"pending\"}", "verdict": "pass" },
    { "fault": "RETRY WORKER — 8 passes under MALFORMED provider response", "target": "runModerationRetryPass + moderation-retry.job.ts catch", "expected_behavior": "attempts advance, ceiling reached, case auto-escalated to the human queue", "observed_behavior": "claimRetryable(max=3, attempts=0) -> 1 / recordVerdict -> 23502 NOT NULL VIOLATION, repeated identically 8 times; final {\"decision\":\"pending\",\"risk_tier\":null,\"attempts\":0,\"moderation_status\":\"pending\"}; passes=8 attempts=0 risk_tier=null — held forever, never counted, never visible to the S16 escalation queue", "verdict": "fail" }
  ],
  "findings": [
    { "id": "RES-1", "severity": "high", "category": "input-validation / fail-closed", "location": "server/src/modules/moderation/moderation.gateway.ts:108", "evidence": "Injection 5: threw Error 'null value in column \"decision\" of relation \"moderation_case\" violates not-null constraint', code 23502, isProviderUnavailableError = false, recordFailedAttempt calls = 0. An out-of-vocabulary verdict.tier yields status === undefined, bound as SQL NULL against moderation_case.decision NOT NULL (migrations/002_content.up.sql:81). No ProviderVerdict validation exists anywhere.", "provenance": "vitest@2.1.9 T63 in-process port injection + manual review", "fix_hint": "Validate verdict.tier against auto_pass|auto_block|escalate (and score as a finite 0-1) inside classifyWithTimeout; throw ProviderUnavailableError otherwise. Makes the documented claim true and un-get-wrong-able for T14b adapters." },
    { "id": "RES-2", "severity": "high", "category": "configuration / fail-closed", "location": "server/src/modules/moderation/providers/index.ts:26-47,58", "evidence": "Injection 6: threw Error 'Unknown moderation provider \"openai\". Known: fixture' on the first UGC write, isProviderUnavailableError = false. grep -rn resolveProviders server/src/ shows no boot-time call site; the function is lazy and memoized, contradicting its own comment 'Fail at startup, loudly'. /health (app.ts:22-28) probes only Postgres, so such a deployment reports healthy and 500s every post.", "provenance": "vitest@2.1.9 T63 in-process port injection + grep -rn", "fix_hint": "Call resolveProviders() once in createApp() and in the worker start(); include provider resolution in /health." },
    { "id": "RES-3", "severity": "high", "category": "liveness / escalation", "location": "server/src/modules/moderation/moderation.gateway.ts:167-170; server/src/modules/moderation/moderation-retry.job.ts:67-72", "evidence": "Injection 13: 8 retry passes produced 'claimRetryable(max=3, attempts=0) -> 1' and 'recordVerdict -> 23502 NOT NULL VIOLATION' identically each time; final state {decision: pending, risk_tier: null, attempts: 0}. recordFailedAttempt sits inside the ProviderUnavailableError branch, so any other error freezes the counter: claimRetryableCases selects the case forever (attempts < max), claimExhaustedCases never does (attempts >= max), and the S16 escalation index (risk_tier = 'escalate', migrations/002_content.up.sql:105-106) never sees it.", "provenance": "vitest@2.1.9 T63 retry-loop simulation + manual review", "fix_hint": "Record a failed attempt for ANY error before rethrowing non-ProviderUnavailableError. A case that fails N times for any reason belongs to a human. Optionally add a pending-age watchdog job." },
    { "id": "RES-4", "severity": "medium", "category": "concurrency", "location": "server/src/modules/moderation/moderation.repo.ts:176-211; moderation-retry.job.ts:48-55; server/src/worker/index.ts:26-31", "evidence": "Static: the claim transaction commits before classification, releasing the FOR UPDATE SKIP LOCKED row locks, and nothing about the claimed row is mutated at claim time (attempts and lastAttemptAt are written only after the attempt completes), so a second reader re-satisfies the identical predicate. setInterval has no overlap guard; BATCH_LIMIT=50 x moderationTimeoutMs=5000 gives a ~250s pass against a 60s tick. Consequences: duplicated paid provider calls (RR-9) and lost updates on _gateway.attempts (recordFailedAttempt replaces the whole jsonb rather than incrementing). Not a publish risk — every mutating statement is guarded by WHERE ... = 'pending' and injection 4 confirmed exactly-once application.", "provenance": "manual review (concurrency test deferred — OQ-R1)", "fix_hint": "Stamp a lease inside the claim transaction (UPDATE ... SET lastAttemptAt = now(), attempts = attempts + 1 ... RETURNING) and guard the interval with an in-flight flag." },
    { "id": "RES-5", "severity": "medium", "category": "timeout", "location": "server/src/db/pool.ts:8-13", "evidence": "connectionTimeoutMillis: 10_000 is set; statement_timeout, query_timeout and idle_in_transaction_session_timeout are all absent. A hung (not down) database hangs every request and /health's SELECT 1 (app.ts:24) indefinitely.", "provenance": "manual review; resilience-audit SKILL.md Method step 1 (library-default/infinite timeout on a critical-path dependency)", "fix_hint": "Set statement_timeout and query_timeout on the pool, and idle_in_transaction_session_timeout on the connection." },
    { "id": "RES-6", "severity": "medium", "category": "resource handling / diagnosability", "location": "server/src/db/pool.ts:33-38", "evidence": "catch { await client.query('ROLLBACK'); throw err; } finally { client.release(); } — the ROLLBACK is unwrapped, so if it rejects (the common case when the original error WAS a connection failure) its rejection replaces err and the real cause is lost; release() is never called as release(err), so a client with indeterminate transaction state returns to the pool. The finally does guarantee release, so there is no handle leak.", "provenance": "manual review", "fix_hint": "Wrap the ROLLBACK in try/catch, always rethrow the original err, and pass the error to release() when the connection itself failed." },
    { "id": "RES-7", "severity": "medium", "category": "timeout", "location": "server/src/modules/notification/email-provider.ts:78-83", "evidence": "nodemailer.createTransport receives host/port/secure/auth only; nodemailer@9.0.3 defaults connectionTimeout 2min, greetingTimeout 30s, socketTimeout 10min apply. Multiplied by RetryingEmailProvider's 3 attempts (:114-135), a black-holing SMTP server can hold a user's A1 request for tens of minutes, which defeats TRD:integrations[Email / OTP Delivery Provider].failure_posture's bounded 'block or resend'.", "provenance": "manual review; resilience-audit SKILL.md Method step 1", "fix_hint": "Set connectionTimeout / greetingTimeout / socketTimeout explicitly (e.g. 5s / 5s / 10s)." },
    { "id": "RES-8", "severity": "medium", "category": "retry policy", "location": "server/src/modules/notification/email-provider.ts:130; server/src/config/index.ts (moderationRetryBackoffSeconds, moderationRetryIntervalSeconds)", "evidence": "Email backoff is deterministic exponential (200ms/400ms) with no jitter. Moderation backoff is a flat 30s with a 60s sweep and no growth, so every item held during an outage becomes due at the same offset and is swept in the same 50-item batch — a synchronized herd on a recovering provider, and with hold-all as the default every item in the system is in that state through M2-M5. Neither retry targets a non-idempotent write, so the skill's critical rule is not triggered.", "provenance": "manual review; resilience-audit SKILL.md Method step 1 (no backoff+jitter => medium)", "fix_hint": "Apply full jitter to both, and grow the moderation backoff per attempt." },
    { "id": "RES-9", "severity": "high", "category": "circuit breaker", "location": "server/src/modules/moderation/moderation.gateway.ts:78-98 (absent throughout providers/ and the gateway)", "evidence": "TRD section 1 names AI moderation as 'the one component with a real external dependency and failure mode of its own', and it is inline in A3/A4's request path (content.service.ts:87,182). No breaker exists. Not reachable today — hold-all rejects synchronously (injection 1 returned in ~0ms) — but live the instant T14b binds a network provider: every write then pays 5s (10s across both tiers) before returning 202, and the retry worker serializes 50 x 5s per pass. RR-4 records that dual-provider fallback was deliberately deferred, leaving a breaker as the only remaining bound on outage cost.", "provenance": "manual review; resilience-audit SKILL.md Method step 1 (circuit breaker absent on TRD critical path => high)", "fix_hint": "Open-circuit short-circuit straight to ProviderUnavailableError (already the safe path) after N consecutive failures, with a half-open probe. Must ship with T14b and before T67." },
    { "id": "RES-10", "severity": "low", "category": "resource leak", "location": "server/src/modules/moderation/moderation.gateway.ts:44-68; port definition moderation.types.ts:62-65", "evidence": "Injection 3: 'losing provider promise still ran to completion (no cancellation): true'. No double-apply and no unhandled rejection were observed, so this is a resource cost, not a correctness bug — but with a real HTTP adapter every timed-out call leaks an in-flight request and socket exactly when the provider is already struggling.", "provenance": "vitest@2.1.9 T63 in-process port injection", "fix_hint": "Add signal?: AbortSignal to ClassifyInput and abort it in the finally alongside clearTimeout — one line now, a port-signature change after T14b." },
    { "id": "RES-11", "severity": "low", "category": "graceful shutdown", "location": "server/src/worker/index.ts:42-49", "evidence": "shutdown() clears the intervals then calls closePool() and process.exit(0) without awaiting a running pass, so a transaction can be cut mid-statement. Fail-closed survives (an interrupted classify leaves the case pending and claimable) but it is another route to an un-advanced attempt counter (RES-3). The API process at least awaits in-flight requests via server.close() (index.ts:14-19).", "provenance": "manual review", "fix_hint": "Track the in-flight promise per job and await it before closePool()." },
    { "id": "RES-12", "severity": "low", "category": "diagnosability", "location": "server/src/modules/moderation/moderation.gateway.ts:91-97", "evidence": "Injection 9: a TypeError thrown by a tier-2 adapter was logged as 'tier-2 moderation provider unavailable — keeping tier-1 escalate verdict' and converted to escalate. The direction is conservative and correct; the cost is that a genuine T14b adapter bug is indistinguishable from a vendor outage and silently inflates the human escalation queue (RR-3).", "provenance": "vitest@2.1.9 T63 in-process port injection", "fix_hint": "Keep the fallback but log non-ProviderUnavailableError causes at error level with a distinct message." },
    { "id": "RES-13", "severity": "info", "category": "design surface for T64", "location": "server/src/modules/moderation/moderation.gateway.ts:88-90", "evidence": "Injection 10: tier-1 escalate + tier-2 auto_pass produced {\"status\":\"published\",\"riskTier\":\"auto_pass\",\"held\":false}. Correct per TRD section 8 tiering, recorded because it is the exact surface DECISION QK-5 / T64 must probe: cadence.md section 4 flags a tier DOWNgrade as a finding; this is the inverse, and it publishes.", "provenance": "vitest@2.1.9 T63 in-process port injection", "fix_hint": "Hand to T64/M6 as a required adversarial case: craft input that makes tier 1 escalate and tier 2 pass." },
    { "id": "RES-14", "severity": "medium", "category": "test coverage", "location": "tests/nfr/moderation-coverage.test.ts", "evidence": "Independent review per this run's mandate (plan section 4, T63). The T56 suite covers reconciliation, orphan cases, zero-auto-publish, the 202 contract, ceiling escalation and feed invisibility — but never SLOW (fixture.provider.ts:36 rejects synchronously, so [[moderation:timeout]] is an outage, not a timeout, leaving classifyWithTimeout's race branch at gateway.ts:50-64 with zero coverage in the repo suite), never FLAKY, and never MALFORMED — whose absence is why RES-1 shipped. withUnavailableProvider only ever swaps in hold-all, i.e. re-tests the default the app already runs in.", "provenance": "manual review of tests/nfr/moderation-coverage.test.ts + vitest@2.1.9 T63 harness as counter-example", "fix_hint": "For test-writer-agent (QK-6 — authorship is not this agent's role): add latency-injecting, alternating-failure, and out-of-vocabulary-verdict stubs, plus SECREG-RES-1/2/3 pinning tests once fixed. The T63 harness in section 3 is a working reference implementation." }
  ]
}
```
