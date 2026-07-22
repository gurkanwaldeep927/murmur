# PATCH: skills/resilience-audit/SKILL.md — add restore drill

Append the following as **Method step 6** (after "Teardown proof"). No other
section changes.

---

6. **Restore drill (backups are hypotheses until restored).** Scope: the
   staging DB (T49), never production. Procedure:
   a. Record current backup configuration (mechanism, schedule, retention)
      with provenance — absent/undocumented => **critical**.
   b. Take note of a known data state (row counts + checksums on the two
      legally-weighted tables: `ban_record`, `grievance_audit_log`, plus one
      content table).
   c. Restore the most recent backup into a fresh `qk-chaos-restore-*`
      instance (sandbox rule applies — never restore over a live instance).
   d. Run the NFR suite (T55–T59 set) against the restored copy; assert
      checksums/counts match expectations for the backup's timestamp.
   e. Record **RPO** (now minus backup timestamp) and **RTO** (wall-clock of
      steps c–d) in the stage-14 handoff's fault_injections array as a row
      with fault type `restore-drill`.
   Failure modes: restore fails => critical; suite red on restored copy =>
   critical (backup captures a corrupt state); RPO exceeds the backup
   schedule's promise => high.

Drill recency is enforced at the launch gate by PRR-28 (see
production-test-prr-additions patch): executed within the last 30 days,
RPO/RTO recorded.
