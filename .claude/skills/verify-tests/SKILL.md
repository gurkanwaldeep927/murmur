---
name: verify-tests
description: Method for stage-11 test verification — suite execution, coverage vs threshold, criticality-ranked mutation sampling, per-criterion verdicts, and fix-list routing with a 3-round cap. Used by test-verifier-agent (critic; never edits).
---
# verify-tests

## Method
1. **Execute exactly** the runner command from the stage-10 handoff in a
   clean environment. Red suite => status fail, fix_list from failure output,
   stop (no coverage/mutation on a red suite).
2. **Coverage:** stack-standard tool (coverage.py / istanbul / go cover).
   Threshold source order: TRD NFR > 80% line default `[ASSUMPTION]`.
   Report line + branch. Coverage gaming check: files excluded from coverage
   config that hold TRD-critical logic => finding.
3. **Mutation sample (the real quality signal):** rank files by criticality —
   money paths > auth/authz > data writes > rest (rank from TRD entities +
   integrations). Take top 5, run mutmut / Stryker / go-mutesting capped at
   30 mutants/file (runtime bound). Killed% < 60% on any critical file =>
   its criteria downgrade to `test-exists-but-weak`.
4. **Per-criterion verdicts:** verified (test exists, passed, not weak) /
   test-exists-but-weak / unverified. The map must cover 100% of PRD criteria
   — silent drops are the exact failure class the pipeline exists to catch.
5. **Fix list:** each item = finding shape with the concrete defect
   (assertion-free, mocks-subject, flaky, uncovered-branch on critical path)
   and file:line. Round counter in `.pipeline/test-loop.json`; round 3 with
   remaining unverified criteria => blocking OQ listing them verbatim.
6. **Wall:** never modify tests/source; never re-run selectively to get
   green; timing-flaky tests are findings, not retries.
