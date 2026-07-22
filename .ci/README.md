# `.ci/` — CI + quality-gate map

The runnable pipeline lives in `.github/workflows/ci.yml` (GitHub Actions). This folder
is the architecture-doc anchor (`architecture.md` §1/§8) describing what runs and when.

## Layer 1 — continuous, every push (plan T3, cadence.md §1)
| Gate | Tool | Posture |
|---|---|---|
| Lint | eslint | blocking |
| Typecheck | tsc --noEmit | blocking |
| Migration apply + rollback | `npm run migrate` / `migrate:down` | blocking |
| Unit + integration + NFR tests | vitest (against a real Postgres service) | blocking |
| Secrets scan | gitleaks | **blocking from first run** (no warn-only) |
| SAST | semgrep | advisory in Layer 1; blocking gate is T60 (M1 security-agent) |
| SCA | osv-scanner | advisory in Layer 1; escalates via the security-agent milestone gate |

## Layer 2 — per-milestone agent runs (T60–T71, T76)
Not in this workflow. Each verification agent (security, resilience, perf, observability,
privacy, and once production-test) runs its skill against the codebase at that milestone's
exit; findings land in `docs/08-security.md` … `docs/16-privacy.md`. See `architecture.md` §8.

## Layer 3 — event-triggered scoped checks
Standing rules, not discrete tasks: any `server/src/shared/*` change, any new migration, any
new external integration triggers a scoped re-check. See `architecture.md` §8 and
`quality-kit-additions/cadence.md` §3.
