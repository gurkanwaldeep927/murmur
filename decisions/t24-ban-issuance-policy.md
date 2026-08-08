# Issuing a ban — what the code does, and what it deliberately does not decide

**Decided:** 2026-08-08, during T24.
**Task text:** *"Ban issuance path (backend): severe moderation/grievance outcome writes
`ban_record` + profile status change, surviving account deletion; operator UI trigger arrives
with M5 console."* — `docs/07-plan.md` T24.

---

## 1. What T24 builds

One function, `banIdentity()`, that in a single transaction:

1. writes the `ban_record` row, keyed by the T50 email fingerprint,
2. flips `pseudonymous_profile.status` to `banned`,
3. flips `identity_account.ban_status` to `true`.

All three or none. A ban that recorded the durable row but left the profile active would let
the person keep posting until someone noticed; one that flipped the profile but never wrote the
row would evaporate the moment they deleted their account — which is the defect this task
exists to close (SEC-016 / PRV-2, `TASK-STATUS.md` problem #7).

Enforcement of a ban is not built here. It already exists: A11 refuses re-registration
(T23), and `requireSession` refuses every authenticated action because it reads the profile
live on each request. T24 is the only missing half — something that *sets* the state those two
have always been reading.

## 2. What T24 deliberately does NOT build: an automatic trigger

**No code path bans anyone automatically. Nothing calls `banIdentity()` in the running product
yet, and that is the decision, not an oversight.**

The obvious-looking wiring would be: moderation returns `auto_block`, therefore ban the author.
It is rejected for three reasons.

- **One blocked post is not a severe violation.** The classifier blocks content; it says
  nothing about the person. Banning on a single automated content verdict would make a
  false positive — the failure mode the T54 vendor spike exists to measure and which is
  entirely unmeasured until M6 (RR-21) — permanently remove a real student. Permanent, because
  the schema forbids deleting a ban record by design.
- **There is no severity model to trigger on.** `moderation_case` carries a classification
  label, a tier and a score. None of them means "severe enough to remove a person". Inventing
  a threshold here would be inventing product policy in a build task, and the wrong number
  would be discovered by the student it removed.
- **The intended trigger is a human, and the plan says so.** "Operator UI trigger arrives with
  M5 console." T35 (resolve) and T41 (operator console) are the callers. T24's job is to make
  sure that when they call, the ban is complete and durable.

**Cost of leaving it uncalled, stated plainly:** until M5, nothing in the product can ban
anyone. Moderation still holds and blocks content, so the harm is contained — but a repeat
offender cannot be removed, only silenced post by post. That is the actual state of the
product, and it is better written down here than implied by an empty function.

**What would change this:** a human deciding a concrete rule ("N blocked posts in M days",
or a specific classification label). That is one config value and one call site away, and the
mechanism is ready for it. It is not something to guess.

## 3. Idempotency, and what happens on a second ban

`ban_record.email_hash` is UNIQUE. A second ban for the same address does **not** error and
does **not** overwrite the first reason: the original stands, and the profile/account flags are
re-applied.

Keeping the first reason is deliberate. The ban record is the audit trail of *why* someone was
removed; a later, vaguer reason overwriting a specific one loses the only evidence there is.
Re-applying the flags is also deliberate: if a ban was issued and the profile somehow drifted
back to active, calling again should heal it rather than silently no-op on the unique
constraint.

## 4. Which fingerprint a ban is written under

The **active** pepper, always — `hashNormalizedEmail()`, never a retired one.

Matching at lookup time already tries every pepper version (`candidateHashes`, RR-13), so a ban
written today keeps matching after a future rotation. Writing under a retired pepper would
create records that only match while that pepper is still listed, which is exactly the silent
expiry the rotation strategy exists to prevent.

## 5. Surviving account deletion — and a gap in the plan worth naming

Durability is structural: `ban_record` has no foreign key to `identity_account` or
`pseudonymous_profile` (schema §3.8, built at T21). There is nothing for a delete to cascade
along. The T24 test proves the end-to-end property by soft-deleting both rows exactly as an
erasure path would and then re-registering the same address, which is refused.

**The gap:** the product has no account-deletion endpoint. There is no `DELETE /account`, no
erasure route, nothing — verified against the route table on 2026-08-08, not assumed. Yet
**T57** (M3) is specified as *"delete account → re-register same email → refused"*, and
`docs/16-privacy.md`'s DPDP erasure work is M5/T70. **No task in `docs/07-plan.md` builds
account deletion itself.**

T24 does not build it either, because inventing an erasure endpoint here would pre-empt the
DPDP retention and legal-basis decisions T43 and T70 own — and an erasure path built before
those decisions is one that has to be rebuilt after them.

Recorded in `docs/TASK-STATUS.md` so it is a visible plan gap rather than a surprise at T57.
The likely right home is T70 (privacy, M5), with T57's test written against whatever it builds.
Until then, T24's test simulates deletion at the row level, and says so in its own comment
rather than implying the endpoint exists.
