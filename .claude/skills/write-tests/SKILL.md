---
name: write-tests
description: Method for stage-10 test authoring — translating PRD acceptance criteria and TRD contracts into a pyramid-shaped suite with full traceability. Used by test-writer-agent (generator; never executes).
---
# write-tests

## Method
1. **Criteria extraction:** pull acceptance criteria with IDs from the PRD
   handoff; testable NFR claims and API contracts from the TRD handoff; error
   states from the UX handoff (every UX error state needs a test forcing it).
2. **Level selection (pyramid rule):** for each criterion pick the LOWEST
   level that truly verifies it: pure logic => unit; component boundary /
   DB interaction => integration; multi-step user journey => e2e (budget:
   e2e count <= 10% of suite); external API shape => contract; open input
   domain (parsers, money, dates, IDs) => property-based (hypothesis /
   fast-check — boring defaults).
3. **Naming & traceability:** test name embeds the criterion id
   (`test_AC12_member_cannot_view_other_member_invoice`). One criterion may
   have many tests; every test maps to exactly one criterion or is tagged
   `regression` with a finding/bug id.
4. **Quality bars (verifier will mutation-test you):**
   - Every test asserts observable behavior, not implementation internals.
   - Never mock the subject under test; mock only true externals.
   - Integration tests run against a real ephemeral DB (testcontainers or
     the stack's boring equivalent), not in-memory fakes, for anything the
     schema stage defines.
   - Deterministic: no sleeps, no wall-clock, no network to third parties
     (contract tests use recorded fixtures + signature verification).
5. **Security regression seeds:** every stage-08 critical/high finding that
   was fixed gets a pinning test (id `SECREG-<finding-id>`).
6. **Honesty rule:** untestable criterion => uncovered_criteria entry with
   reason. An assertion-free placeholder test is a house-rules violation.
