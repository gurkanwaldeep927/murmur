---
name: perf-audit
description: Method for stage-12 — k6 load-test authoring with SLO thresholds as code, plus the query-level scale-killer audit (N+1, indexes, unbounded, pagination). Used by performance-agent.
---
# perf-audit

## Method
1. **SLO table first:** metric, target, source (TRD field path or
   [ASSUMPTION] defaults). No load run before targets exist on paper.
2. **k6 scripts** (committed under `perf/`, one per critical UX flow):
   encode targets as `thresholds` (e.g. `http_req_duration: ['p(95)<500']`,
   `http_req_failed: ['rate<0.01']`) so pass/fail = k6 exit code. Stages:
   ramp to expected load (hold 2m), ramp to 2x (hold 2m). Seed realistic
   data volume first (list endpoints against 3 rows prove nothing —
   generate N=10k rows for the top entities from the schema handoff).
3. **N+1 detection:** enable query logging; script one request per list
   endpoint at collection sizes 10 and 100; query count scaling with size
   => N+1 finding with the log excerpt.
4. **Index audit:** capture the 10 slowest queries from the load run's query
   log; EXPLAIN each; sequential scans on filtered/joined columns of large
   tables => finding with the plan.
5. **Unbounded/pagination:** static scan for LIMIT-less list queries and
   endpoints returning arrays without page params; each => finding
   (severity high if the entity grows unboundedly per the schema handoff).
6. **Cost note:** flag patterns with runaway-bill shape (per-request LLM
   calls without cache, per-item third-party API calls in loops) as medium
   findings — cost is a production failure mode too.
