---
name: resilience-audit
description: Method for stage-14 — dependency mapping, timeout/retry/circuit-breaker verification, and scoped toxiproxy fault injection with namespaced sandboxes. Used by chaos-resilience-agent.
---
# resilience-audit

## Method
1. **Dependency map:** union of TRD integrations and codebase scan for
   network clients (http clients, DB drivers, SDKs). Per dependency record:
   explicit timeout (library-default/infinite => finding, high on
   critical path); retry policy (retrying non-idempotent writes => critical;
   no backoff+jitter => medium); circuit breaker where TRD marks
   critical-path (absent => high).
2. **Sandbox rule (absolute):** injections only against instances this run
   started, named `qk-chaos-*`, with dependencies stubbed or containerized
   locally. Anything shared/remote is out of bounds — static finding + OQ
   instead.
3. **Injection matrix** via toxiproxy between app and each dependency:
   - DOWN (connection refused): expect the UX handoff's error state, not a
     hang or a 500 stack trace to the user.
   - SLOW (latency 2x the configured timeout): expect timeout firing at the
     configured value, request failing fast.
   - FLAKY (50% resets): expect idempotent retries succeeding, writes not
     duplicated (verify by counting rows/side-effects).
   Each: fault, target, expected (with UX/TRD provenance), observed
   (captured output), verdict.
4. **Kill test:** SIGKILL mid-write transaction against the test DB; restart;
   assert no partial state and (if a queue exists) no lost accepted work.
5. **Teardown proof:** list `qk-chaos-*` resources before exit; all removed.
6. **Restore drill (backups are hypotheses until restored).** Scope: the
   staging DB, never production. (a) Record backup configuration (mechanism,
   schedule, retention) with provenance — absent/undocumented => critical.
   (b) Note a known data state: row counts + checksums on the legally-weighted
   tables (`ban_record`, `grievance_audit_log`) plus one content table.
   (c) Restore the most recent backup into a fresh `qk-chaos-restore-*`
   instance (sandbox rule applies — never restore over a live instance).
   (d) Run the NFR suite against the restored copy; assert counts/checksums
   match expectations for the backup's timestamp. (e) Record RPO (now minus
   backup timestamp) and RTO (wall-clock of c–d) as a fault_injections row
   with fault type `restore-drill`. Restore fails => critical; suite red on
   restored copy => critical (backup captures a corrupt state); RPO exceeds
   the schedule's promise => high. Recency (≤30 days at launch) is enforced
   by PRR-28.
