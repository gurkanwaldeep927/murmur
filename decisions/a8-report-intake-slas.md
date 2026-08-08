# A8 report intake — reason vocabulary, SLA figures, acknowledgement, and duplicate merge

**Task:** T34 (A8 report intake). **Date:** 2026-08-09.
**Status:** decided here because no upstream document decided them, and T34 cannot compute an
SLA deadline without an answer to each. Every figure below is provisional and is the exact
input T43 (legal review) exists to confirm or replace.

---

## The gap this document closes

`docs/03-trd.md` §7 states two grievance NFRs:

- acknowledgement **within 24h** of submission, measured `created_at → acknowledged_at`;
- resolution **within 15 days** in general, with *"specific unlawful-content categories (e.g.
  impersonation, non-consensual content) expedited to 24–36h"*, measured `created_at →
  resolved_at`, **segmented by category**.

`docs/05-schema.md` §4 froze `grievance_report` with a single free-text `reason` column, one
`sla_deadline`, and **no category column at all**. So the segmented resolution SLA the NFR
requires had nothing to segment on, and T38's "category-segmented resolution SLA" timers would
have had nothing to read. This was found while building T34, not before it.

---

## 1. The reason IS the category — a controlled vocabulary in `reason`

`docs/04-ux.md` F7 step 1 says the reporter *"selects a reason"*. A selection is a closed set.
So `reason` holds a code from a fixed vocabulary rather than free text, and the SLA is derived
from that code. No new column is added and the frozen schema's column type is unchanged.

**The vocabulary is `[ASSUMPTION]`** — no upstream document lists one. It is grouped by the only
thing that changes behaviour, which is the deadline:

| Reason code | Resolution SLA | Grounding |
|---|---|---|
| `non_consensual_imagery` | expedited | IT Rules 2021 Rule 3(2)(b) — nudity / sexual act / private area |
| `sexual_content_morphed` | expedited | same rule — impersonated or morphed sexual imagery |
| `impersonation` | expedited | TRD names impersonation as an expedited example |
| `harassment` | general | |
| `hate_speech` | general | |
| `threat_of_violence` | general | |
| `spam_or_scam` | general | |
| `other` | general | catch-all, so a reporter is never stuck without a submit |

**Cost of a closed vocabulary:** a reason nobody anticipated arrives as `other` and gets the
general 15-day clock. That is why `other` exists and why it is deliberately *not* expedited —
guessing "this might be urgent" from free text is the thing a category exists to avoid.
**Adding a category later requires a migration**, which is the point: a new category without a
decided SLA is exactly the silent mis-bucketing this document prevents.

**The rule lives in the database too.** Migration 010 adds a CHECK constraint pinning `reason`
to this list, following `decisions/oq-schema-aggregates-and-vote-enforcement.md` §2: the code
checks first so the reporter gets a named error, the database refuses regardless. Without it,
any future writer could store a reason the SLA table has never heard of, and the deadline
computation would silently take its general-case branch on a legally urgent complaint.

**Owners of the next move:** T39 (design) needs these labels to draw S13's picker; T43 (legal)
must confirm the list is complete for IT Rules 2021 and correct the figures below.

---

## 2. The figures

| Clock | Value | Source |
|---|---|---|
| Acknowledgement | **24h** from `created_at` | TRD §7, `[ASSUMPTION: general IT Rules 2021 norm]` |
| Resolution, expedited categories | **24h** from `created_at` | tighter end of the TRD's own "24–36h" |
| Resolution, general | **15 days** from `created_at` | TRD §7, Rule 3(2)(a)-aligned |

**Why 24h and not 36h for the expedited set.** The TRD offers a range and the range is not
neutral: Rule 3(2)(b) is generally read as a 24-hour obligation for exactly this content. Being
late against a self-chosen 36h when the statute says 24h is a worse failure than flagging a
breach we could have avoided by writing a looser number. They live as named constants
(`grievance.slas.ts`) so T43 can move them in one edit.

**Changing them later does not move existing tickets.** `sla_deadline` is computed once, at
intake, and stored — and migration 010 makes it immutable (§4). A ticket carries the deadline
that was in force when it was filed, which is what a compliance record has to do.

---

## 3. Acknowledgement happens at intake, in the same transaction

`acknowledged_at` is set by A8 itself, not by a later human step, and a
`grievance_audit_log` row is written with `actor_type = 'system'`, `action = 'acknowledged'`.

**Why.** Rule 3(2)(a)'s acknowledgement is a confirmation of *receipt*, not of review, and an
automated acknowledgement carrying a ticket ID is the ordinary way that obligation is met. Doing
it in the intake transaction makes the 24h acknowledgement SLA **structurally unbreachable**:
there is no path that creates a ticket without acknowledging it, because the two are one write.

**What it costs, stated plainly:** the 24h acknowledgement clock can now never fire, so T38's
"ack SLA" timer is not a countdown — it is a **reconciliation check**: any `grievance_report`
with `acknowledged_at IS NULL` is a bug in this code, and T38 should alert on its existence
rather than on its age. Written here so T38 does not implement a timer that can never trigger
and mistake its silence for compliance.

**The log still tells the two apart.** `actor_type` distinguishes `system` from `operator`,
which is the entire reason that CHECK constraint exists (T33). An automatic acknowledgement is
never mistakable for a human having looked at the complaint.

---

## 4. `sla_deadline` is immutable after insert

Migration 010 adds a trigger refusing any UPDATE that changes `sla_deadline`.

**Why this is not decoration.** T33's whole achievement is that `sla_breached` is a GENERATED
column — nobody can set it and nobody can unset it. But it is generated from
`resolved_at > sla_deadline`, and with a mutable `sla_deadline` the flag is defeated by moving
the goalposts instead of by touching the flag: push the deadline out, resolve late, and the
record reads compliant. The generated column closes the front door; this closes the back one.

**Cost:** a ticket filed under the wrong reason cannot have its deadline corrected. The
remedy is an operator action recorded in the audit log plus, if needed, a fresh ticket — not a
quiet UPDATE. If re-categorisation turns out to be a real operational need, it needs its own
decision and its own audited path, and it should not arrive as a loosened trigger.

---

## 5. Duplicate reports merge into the open ticket, and no second row is created

TRD apis[A8].errors: *"duplicate report from the same actor on the same content → merged into
the existing ticket, not rejected"*.

**Implemented as:** the same reporter reporting the same content while an **open** report of
theirs on it already exists gets that ticket back, `merged: true`, plus a
`grievance_audit_log` row on the original (`actor_type = 'reporter'`, `action =
'duplicate_report_merged'`). No new `grievance_report` row.

**Why not a second row pointed at the first via `merged_into_report_id`.** A second row carries
its own `sla_deadline` and its own generated `sla_breached`, so it would sit open forever
inflating both the operator queue and the breach statistics, for an event that added no new
information. The fact that they reported twice is preserved where facts about a ticket belong —
the audit log. `merged_into_report_id` is left for the operator-initiated merge of two
*different* reporters' tickets, which is T35's to define.

**Only OPEN reports merge.** If their earlier report was resolved, a new report is a genuinely
new grievance — the content re-offended, or they dispute the dismissal — and it gets its own
ticket and its own clock.

**Anonymous reports never merge, and this is a real cost.** Merge detection needs
`reporter_profile_id`, and an anonymous report deliberately stores none (T33: anonymity is a
property of the row, not of the screen). So repeated anonymous reports on the same content
create separate tickets. Choosing the other way — storing the reporter "just for
de-duplication" — would undo exactly the property T33 built. The per-reporter rate limit (§6)
is what bounds the abuse instead.

---

## 6. Rate limiting is keyed by profile, not by IP

Every other limiter in `shared/rate-limit.ts` buckets by caller address, because A1/A2/A12 have
no authenticated caller to bucket by. A8 does — it is behind `requireSession`.

**Why that matters here:** a campus behind one NAT shares one address. An IP bucket on an
authenticated route would let one abusive reporter exhaust the budget for everyone on the same
network, which is the "lock out the entire campus" failure already recorded against
`TRUST_PROXY`. Bucketing by profile id is exact.

**It does not weaken anonymity.** The bucket key is an HMAC under a per-process salt that is
regenerated on restart and never persisted; the anonymous report's *row* still stores no
reporter. Default budget: 10 reports per profile per hour (`RATE_LIMIT_REPORTS_PER_HOUR`),
`[ASSUMPTION]` — no upstream figure exists. Loose enough that a student reporting a bad thread
is never stopped, tight enough that report-spam as a harassment tool is bounded.

---

## 7. What T34 deliberately does NOT build

- **No read endpoint.** S14 ("My Reports") needs one and the TRD defines none — A8 is intake
  only. Recorded as a gap in `docs/TASK-STATUS.md` rather than invented here; its likely home
  is T40, which integrates S13–S15 and is the first task that cannot proceed without it.
- **No analytics events.** M5 instrumentation is T53's scope, in full, so that the events are
  designed against S13/S16/S17 together rather than one endpoint at a time.
- **No `moderation_case_id` link.** A report is linked to a moderation case when a takedown
  creates one — that is T35's write, not intake's.
