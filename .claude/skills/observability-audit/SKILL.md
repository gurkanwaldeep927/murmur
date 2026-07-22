---
name: observability-audit
description: Method for stage-13 — verifying structured logging, PII/secret-free logs, golden-signal metrics, trace propagation, health endpoint, and alert rules, via static checks plus an instrumented smoke run. Used by observability-agent.
---
# observability-audit

## Method
1. **Structured logging:** logger configured for JSON/key-value output;
   grep for print/console.log/echo on request paths => finding each.
2. **Log hygiene:** build the PII field list from the schema handoff's
   entities (names, phones, emails, payment refs) + generic secret shapes;
   grep log statements for interpolation of those fields; run the smoke
   traffic and gitleaks-scan the captured log output as a second signal.
3. **Golden signals mapping:** latency + traffic + errors => RED metrics per
   endpoint (OpenTelemetry or the framework's boring metrics middleware);
   saturation => at least DB pool utilization or process memory gauge.
   Each signal: instrumented boolean + file:line or captured metric sample.
4. **Trace propagation smoke:** drive requests including 1 forced error;
   verify a request/trace id appears on every log line of one request's
   lifecycle and the error logs carry stack + context at error level.
5. **Health endpoint:** exists, checks real dependencies (DB ping), returns
   non-200 when a dependency is down (verify by pointing it at a dead DB).
6. **Alert rules as code:** in-repo rule files covering, minimum: error rate
   > SLO, p95 latency > SLO, health check failing, saturation gauge > 80%.
   Missing => high finding (buildable gap, not an open question).
