# Runbook: HMAC Pepper Rotation

**Trace:** RR-13 (schema:escalations[HMAC pepper]); T50 (shared email-identity utility).
**Owner:** [HUMAN: name]  **Last reviewed:** [HUMAN: date]
**Trigger:** suspected pepper exposure, scheduled rotation policy, or provider/KMS migration.

## Why this is dangerous
Every `identity_account.email_hash` and `ban_record.email_hash` was produced
with the current pepper. Rotating it naively breaks ALL existing ban matches
and duplicate-email checks silently — banned users could re-register (defeats
TRD:nfrs[ban durability]). Rotation therefore requires a dual-hash window.

## Preconditions
- [ ] New pepper generated and stored in the secrets manager under a versioned key ([HUMAN: manager + key path])
- [ ] `shared/email-identity.ts` supports versioned peppers (hash tagged with pepper version) — if not, STOP; that is a code change, not an ops action
- [ ] Staging drill of this runbook completed within the last [HUMAN: n] months

## Steps
1. Deploy dual-hash mode: new writes hash with pepper v(N+1); lookups check v(N+1) then fall back to v(N).
2. Backfill migration: for rows where plaintext recovery is possible (`email_encrypted` present), recompute hash under v(N+1). For `ban_record` rows with no recoverable plaintext, retain the v(N) hash and keep the v(N) fallback lookup **permanently** for that table. [HUMAN: confirm which tables have recoverable plaintext]
3. Verify: run the T57 ban-durability test and the A1 duplicate-check test against staging under dual-hash mode — both green before production.
4. Production rollout; monitor refusal/duplicate-check rates for anomalies for [HUMAN: n] days (a sudden drop in ban refusals = missed matches).
5. Retire v(N) from the *write* path; record the rotation (date, versions, operator) in the decisions folder.

## Verification
- T57 green post-rotation in production-shadow or staging.
- Ban-refusal rate within historical band.

## Escalation
Any missed-ban suspicion → treat as a security incident; freeze registration if necessary ([HUMAN: decide threshold]).
