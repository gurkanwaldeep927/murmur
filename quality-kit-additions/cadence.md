# Quality Kit — Cadence (when each gate fires)

**Date:** 2026-07-20
**Companion to:** `README.md` (what each agent is, how it's wired). This document governs
*when* each part of the kit runs, *what triggers it*, and *what a failure blocks*.
**Applies to:** the Murmur build (`docs/07-plan.md`, 59 tasks, M1–M6; `architecture.md`
module map). Milestone/task/RR references below trace to those documents.

---

## DECISION QK-4: Cadence supersedes stage-sequence

**Original README framing:** stages 08–15 run post-build, enabled in Waves 1/2/3.
**Amendment:** the wave model is replaced by a three-layer cadence — continuous signals
in CI, targeted audits at the milestone that creates the risk, and one independent
GO/NO-GO at the end. Rationale: a quality signal decays in value the further it runs
from the code that created the risk; a first security audit after M6 finds M1 bugs
under five milestones of dependencies. The stage *numbering* (08–15), handoff schemas,
and doc outputs are unchanged — only execution timing moves. Each stage doc is now
written/updated incrementally at the runs named below and finalized at M6.

Wave 1/2/3 in the README is void. The warn-only-first rule survives (see §3
promotion mechanic). DECISIONS QK-1 (verification Bash), QK-2 (PRR = production-test),
QK-3 (generator/critic split) all stand.

Record this decision in the repo decisions folder alongside QK-1..3.

---

## 1. Layer 1 — Continuous (every push, inside T3's CI)

The cheap automated half of `security-audit` moves out of "stage 08" into the CI
pipeline built at **T3 (M1)**. These run on every push from the moment T3 lands:

| Check | Tool | Pass signal | On red |
|---|---|---|---|
| Secrets | gitleaks | exit 0 | Push blocked. No warn-only period — a committed secret is never a warning |
| SAST | semgrep `--config auto` | 0 critical/high after triage | Blocking from first run; medium/low logged, not blocking |
| SCA | osv-scanner (per lockfile) | 0 critical/high vulns | Blocking; triage per security-audit skill rule 4 (file:line evidence for any false-positive) |
| Test loop | test-writer → test-verifier | verifier pass per task | Task does not close (see §5.2 — one suite, merged with T55–T59) |

**Explicit rule:** nothing else in the kit runs per-task or per-push. The manual-check
classes, perf, resilience, observability, and AI-security audits are Layer 2/3 only.
Running heavy audits per-task produces findings churn, not signal.

CI-loop iteration cap: 3 consecutive automated fix attempts per failure, then escalate
to human (same cap as `07-plan.md` §5's external-signal rule).

---

## 2. Layer 2 — Milestone gates

One row per milestone. "Run" = the agent executes its full skill against the codebase
as it stands at milestone exit; findings land in the stage doc (08–14) as an
incremental, dated section. Every audit scope traces to the risk register (RR-n) or
task IDs in `docs/07-plan.md`.

| Milestone | Agents run | New risk surface (provenance) | Mode | Red blocks |
|---|---|---|---|---|
| **M1** | security-agent (full: scanners + manual checks) · privacy-agent (first run — QK-7) | Identity spine: A1/A2 rate limits + attempt counters (T7), OTP flow (T5), HMAC pepper handling (T50, RR-7, RR-13), session-bootstrap token (T8), independent re-check of the T55 identity-non-disclosure claim. Privacy: PII inventory over migration 001 + leakage baseline (responses/logs/analytics), RR-10 | warn-only (first runs) | — (findings become M2-entry fix list; criticals escalate immediately per §6) |
| **M2** | security-agent (authz focus: A3/A4/A5, session T12) · resilience-agent (first run) · **ai-security-agent (first run — see QK-5)** | UGC write path + moderation gate: fail-closed posture under provider timeout/outage (T14, RR-4 — the toxiproxy fault-injection **is** the T56 outage drill, executed independently); ban/suspend guards on write routes | security: blocking · resilience/ai-security: warn-only | M2 exit (security); others produce M3-entry fix list |
| **M3** | security-agent (ban path: T21–T24, RR-7 re-verified adversarially) · perf-agent (first run) | First EXPLAIN-worthy surface: tsvector search (T20), reputation aggregates + triggers (T21); ban durability delete→re-register attempt replayed with normalization variants (case/aliasing/plus-addressing) | security: blocking · perf: warn-only | M3 exit (security) |
| **M4** | resilience-agent (blocking) · perf-agent (blocking) | Offline sync: kill mid-batch, inject latency/partition, assert every `sync_queue_item` reaches a terminal state and every synced item re-enters A7 (T29, T32, RR-5, RR-6, T58); batch-sync load shape (A10 bursts) | both blocking (second runs) | M4 exit |
| **M5** | security-agent (heaviest run) · privacy-agent (blocking) · observability-agent (first run) | Operator authz on A9 + the T36 decide route (the classic missed-authz surface, RR-11); grievance PII with legal exposure (T33–T35, RR-2, RR-10); anonymous-report flag handling; SLA-timer worker (T38) log/metric presence. Privacy full audit: retention enforcement executed, consent presence (T43 copy), erasure-vs-ban, third-party flows | security + privacy: blocking · observability: warn-only | M5 exit (security, privacy) |
| **M6** | privacy-agent (finalize `docs/16-privacy.md`), then **production-test-agent, once** — merged with T47/T48 | Launch gate: re-executes ALL prior signals from scratch (security, suite+coverage, load, resilience spot-check incl. restore-drill recency ≤30d), PRR checklist incl. PRR-26..29 (privacy pass, runbooks complete, restore RPO/RTO, retention enforcement), GO/NO-GO | blocking, terminal | **Launch** |

### Promotion mechanic (warn-only → blocking)

An agent's **first-ever run** is warn-only: schema registered, findings recorded,
exit-2 disabled. Its **second run** (next scheduled milestone) is blocking. Exception:
a **critical** finding is never warn-only — it escalates per §6 regardless of mode.

### What "blocking" means

A blocking red result stops **milestone exit**: the next milestone's tasks do not
start until the finding is fixed or a human waives it via
`.pipeline/waivers/<finding-id>.json`. It does not stop parallel human tracks
(Claude Design rounds T18/T25/T30/T39, legal T42/T43), which per `07-plan.md` §2
run independently of engineering gates.

---

## 3. Layer 3 — Event triggers (any milestone)

Scoped runs — the named check classes only, not the agent's full audit. Fires on the
task that matches, before that task closes.

| Event | Trigger examples (plan tasks) | Run | Scope |
|---|---|---|---|
| Task touches `server/src/shared/` | T50 (email-identity), T12 (session), T37 (operator-authz), rate-limit changes | security manual checks | The touched utility + every route importing it — one bug in `shared/` is a bug everywhere (`architecture.md` §4) |
| New external integration lands | T5 (Email/OTP), T14 (AI Moderation API) | security manual checks + resilience | Credential handling, webhook/callback signature verification, timeout/retry/fail-posture of the new dependency |
| Dependency added/updated | any lockfile change | SCA re-scan (already in Layer 1; named here for completeness) | New/changed packages |
| New list/feed endpoint | T17 (A5 browse), T20 (A5 search), S5 feed queries | perf query-count check | N+1 detection + EXPLAIN on the new query paths — N+1s are born here, not found later |
| Migration lands (001–006) | T4, T13, T21, T27, T33, T44 | perf EXPLAIN pass + security storage-rules check | New tables' indexes vs. the routes that query them; no table publicly readable/writable outside its owning module |
| Migration adds a PII-classified column | T4 (email fields), T33 (grievance PII) | privacy inventory update + leakage re-sweep | New column classified in the stage-16 PII inventory (purpose/retention/deletion/legal-basis) before the milestone gate; responses/logs/analytics re-swept for the new field |
| Backup mechanism or provider changes | any infra change to T49/T48 backup config | restore drill (resilience-audit step 6) | Fresh drill against the new mechanism; RPO/RTO re-recorded |
| Auth-adjacent change | any change to session lifetime, token issuance, role checks | security manual checks | AuthZ (ownership/role, not just logged-in) on every state-changing route |

---

## 4. DECISION QK-5: ai-security-audit re-gated to M2

**Original README gating:** "CONDITIONAL: only if product embeds an LLM," deferred to
Wave 3. **Amendment:** Murmur's moderation gate (A7, T14) **is** an LLM classifier
sitting in the publish path of all UGC — and UGC is attacker-controlled input to that
classifier. A prompt-injection that forces auto-pass is a direct bypass of the R6
legal shield (`PRD:p0[R6]`, `TRD:nfrs[moderation coverage]`). The condition is met;
the audit runs at **M2 exit**, warn-only first per §3's mechanic, blocking from its
next run (M4, alongside sync re-entry through A7 — T29's re-entry path is a second
injection surface: content crafted offline, replayed at sync).

Scope at M2: adversarial classify-call suite (promptfoo/garak per the skill) against
T14's chosen provider + the tiered cheap-classifier-first routing — an injection that
downgrades tier is a finding even if the final verdict holds.

---

## 5. Corrections to the kit (recorded, not silent)

### 5.1 Stage docs become incremental

Stages 08–14 docs are living documents: each Layer-2 run appends a dated section;
the M6 production-test run finalizes them and validates the complete handoff JSON
against `schemas/*.json`. The handoff block is only required to validate at M6 —
intermediate sections need dates, scopes, and finding counts, not full handoff shape.

### 5.2 DECISION QK-6: One test suite (test-writer absorbs T55–T59)

`docs/07-plan.md` already authors NFR tests incrementally (T55 M1, T56 M2, T57 M3,
T58 M4, T59 M5) and the kit's stage 10 authors tests from acceptance criteria.
Running both independently yields two overlapping suites with different traceability
schemes. **Merge:** test-writer-agent is the *author* of T55–T59 (and all per-task
tests), using the write-tests skill's criterion-ID naming
(`test_R1AC2_unparseable_year_blocked_never_guessed`), which is stricter than the
plan's own convention. test-verifier-agent is the independent scorer (executes,
coverage, mutation-samples). The writer never runs its own tests; the verifier never
edits tests; findings flow back as a structured fix list, cap 3 rounds (QK-3
unchanged). T47 (M6 regression pass) becomes the verifier's final full execution,
consumed by production-test's suite-reverify.

Security regression seeds (write-tests skill rule 5) apply from the first fixed
finding: every fixed critical/high gets a pinning test `SECREG-<finding-id>` in the
same suite.

### 5.3 Additions drop (2026-07-20): DECISIONS QK-7 and QK-8

The `quality-kit-additions/` drop adds: **stage 16 privacy-agent** (QK-7 — runs
before stage 15 in execution order; M1 warn-only, M5 blocking, M6 finalized and
consumed by production-test), the **restore drill** as resilience-audit Method
step 6 (first executed at the M4 resilience gate), four **runbooks** gated by
existence checks (PRR-27), and **PRR-26..29** on the stage-15 checklist (QK-8).
See `quality-kit-additions/README-additions.md` for wiring and plan hooks.

---

## 6. Invariants (never change, regardless of cadence)

1. **production-test runs exactly once**, at M6, merged with T47/T48. Never earlier,
   never repeated on a whim — its value is independence and finality. A NO-GO is
   fixed and then production-test re-runs *in full from scratch* (a re-run after
   fixes is the one sanctioned repeat).
2. **Only a human waives.** A critical finding is never "designed around" or waived
   by an agent — waiver file `.pipeline/waivers/<finding-id>.json`, per README
   non-negotiables. Blocking findings become Open Questions escalated verbatim.
3. **Iteration caps everywhere,** default 3, then human escalation.
4. **Critical findings escalate immediately** — same-day, out-of-band of any
   milestone gate, even during a warn-only period. Warn-only governs *gate exit
   codes*, not human notification.
5. **Provenance or `[ASSUMPTION]`** on every claim in every stage doc, same as
   stages 01–07.
6. **Boring tech wins ties:** semgrep, gitleaks, osv-scanner, k6, toxiproxy,
   pytest/jest, promptfoo — swap only with a decisions-folder entry.

---

## Quick lookup

- **Finished a task?** → Layer 1 already ran in CI. Check §3: does the task match an
  event trigger? Run the scoped check named there.
- **Finished a milestone?** → §2 table, your milestone's row. Run the named agents,
  append findings to the stage docs, apply the promotion mechanic.
- **About to launch?** → §2 M6 row. production-test, once, GO/NO-GO.
- **Found a critical anywhere?** → §6.4. Escalate now; gates don't matter.
