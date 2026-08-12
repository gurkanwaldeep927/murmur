# Human Tasks — what only you can do

Living checklist of every task in `docs/07-plan.md` that Claude Code cannot do, ordered by
how much it unblocks. Companion to `docs/BUILD-NOTES.md` (the build log).

**Last updated:** 2026-08-13 (second pass — T62's gate work was landed on `main`, and the code
half of its fix-list closed; see the end of "Status at a glance". **Items 2, 3 and 4 below are
unchanged and still the only things blocking M2.**)

**T62, the Milestone 2 security gate, has now run, and it
failed.** You unblocked it on 11 August by writing `.pipeline/unlock`; the review ran two days
later. **Every one of the 17 routes passed the access-control review — there is nothing wrong
with the code.** All three blocking findings are settings in your `.env`, and they are now
items 2, 3 and 4 below. Two are a few minutes each. The third cannot be fixed by editing at
all; it is a decision only you can make, and nothing on T62 closes until you make it.

Previously updated 2026-08-11 — T28 (the phone's offline queue) landed, which was the last
thing in the build that was neither behind `.pipeline/unlock` nor waiting on you. One
correction went in too: this file claimed the repo had no git remote, and it has had one for
some time.

Previously updated 2026-08-09 — **the list was ten days and eleven tasks stale, and it was wrong
in both directions.** It was asking you for work already finished, and it was missing the single
highest-value thing you can do.

**Two items came off it because they were never yours.** T25 and T39 — landing the search /
topic / profile screens and the five Milestone 5 screens — sat here as "designer, 15 minutes"
for days. Claude Design *creates* screens; *landing* them is a copy job and mine. All 17 screens
have existed in the design project since July, so there was no design work outstanding. Both
landed on 9 August. Nothing was blocked; the tasks were simply filed against the wrong person.

**Three items went on that were not here at all:** the `.pipeline/unlock` file (the biggest
lever in the project and it had never been written down here), rotating the database password
(open since 7 August), and a new design round carrying a **legal** problem with the report form.

Previously updated 2026-07-30 (moderation end-loading, fourth plan revision — that is what moved
T54 out of the hot path by splitting T14a from T14b, and it still holds).

---

## Status at a glance

| # | Task | Blocks | Your time | When |
|---|---|---|---|---|
| 1 | ~~**`.pipeline/unlock`**~~ — **done 2026-08-11**, and this file had the list wrong | T62 and everything behind it — now unblocked | — | ✅ |
| 2 | **`.env`: `EMAIL_PROVIDER` + `NODE_ENV`** — live emails and login codes are printing to the screen | T62, and through it M2 | **~2 min** | **Now — highest value here** |
| 3 | **`.env`: `DATABASE_SSL` + the Supabase CA file** — the DB connection is encrypted but unverified | T62, and through it M2 | **~10 min** | **Now** |
| 4 | **Decide what happens to the old email fingerprints** (`EMAIL_HASH_PEPPER_RETIRED`) | T62 — and it cannot be fixed by editing, only decided | ~20 min thinking | **Now — nothing can proceed without it** |
| 5 | **T49** — staging deploy | T11 (closes M1), and T19's look-at-it-on-a-screen check | 1–2 hrs | **Now** |
| 6 | **Rotate the database password** | nothing — but it has been on a screen | ~10 min | **Now** |
| 7 | **T43** — legal review (IT Rules + DPDP) | T34, T35, T42, T75, T70 — and now the doxxing category | Weeks (external) | **Start now, finishes later** |
| 8 | **Design round 6** — the report form's missing categories | T40, and a legal deadline being wrong | 15–30 min | **Soon — see why below** |
| 9 | **T30** — design round 4 (sync status) | T31 | 15–60 min | At M4 |
| 10 | **T54** — moderation vendor | T14b, T64, T73 — all M6 | ~30 min | Anytime before M6 |
| 11 | **T42** — grievance officer details | R7 AC3 — launch-blocking, **but only at T48/M6** | ~1 hr | Anytime before M6 |
| 12 | **T72–T75** — four runbooks | T48 GO/NO-GO | ~30 min each | Anytime before M6 |

*(T54 dropped out of the hot path on 2026-07-30 — the T14a/T14b split removed the dependency
rather than deferring it. T42 and T72–T75 moved out the same day. T18 was removed on 2026-08-09
because it landed on 2 August and had been sitting at the top of this list ever since.)*

**What this costs you to know:** until T54 + T14b land at M6, Murmur holds every question and
answer for moderation and publishes nothing outside the test suite. That is R6's fail-closed
posture working correctly, not a bug — but it does mean you won't see a post go live on
staging until you pick a vendor. Running T54 early un-does that at any time. See **RR-21**.

**And the honest version of "I am not idle while you do these" — I mostly still am, and the
reason has changed.** It is no longer that T62 cannot run. It has run. It is that T62 has not
*passed*, and until it does, reshaping the code it inspects means the re-run examines
something different from what failed — so the comparison is lost. That rules out T20 and T37,
and through T37 the whole rest of Milestone 5. What is left is the phone app, or this list.
Items 2 and 3 are minutes of your time and they move the whole thing.

**What I did with the rest of 13 August, and what it did *not* achieve.** T62's own fix-list
was the one thing that is neither blocked by the gate nor waiting on you — closing a finding a
gate named is the intended answer to it, not a reshaping of it. Six of the eleven smaller
findings are now closed, verified, and green on CI: the sign-in route's missing rate limit, a
code comment that claimed a security property the code never had, the guard that stopped the
test suites wiping your **live** database (it was checking the database's *name* and not which
machine it was on), an admin script that put live student email addresses into your shell
history, seven unpinned CI helpers that their owners could have swapped under us, and a quarter
of the vulnerable dependencies. Plus one hole found beside them: **the phone app's dependency
list had never been security-scanned by anything, ever** — and it is the half carrying the worst
advisories.

**Be clear that this does not move item 2, 3 or 4, and does not unblock M2.** The gate passes
only at zero high findings; all three highs are your `.env`. What it buys is that the re-run
after you fix them reports a short list rather than a long one. Two findings were left
deliberately open because closing them would have meant guessing — the browser content-security
policy needs T49's real API address (writing the version that works locally would silently break
every screen in production while looking finished), and the last open route's three suggested
fixes are respectively yours, the lawyer's, and a trade nobody has decided. Both are written up
with the blocker named in `docs/08-security.md` §12.

---

# TIER 1 — do these now

## 1. ~~`.pipeline/unlock`~~ — ✅ **written by you on 2026-08-11**

The file now reads `08 09 10 11 12 13`. **T62 is unblocked, and with it everything that was
parked behind it.**

### This section had the list wrong, in two ways, and both are worth recording

Re-derived from the guard's own code (`.claude/hooks/guardrail.py`) on 11 August, rather than
from what this file previously asserted.

**1. The stated reason was wrong.** This section said *"`docs/16-privacy.md` exists, so
documents 01 through 15 are all frozen."* The guard's freeze scan globs `docs/0[1-9]-*.md` and
`docs/1[0-5]-*.md` (lines 61–62) — **`16-privacy.md` matches neither, so the guard never sees
it.** What is actually doing the freezing is `docs/14-resilience.md`.

**2. Two numbers were missing.** The old instruction was `08 11 12 13 15`:

| Prefix | Old list | Actually needed |
|---|---|---|
| `08` | ✅ | yes — the security reviews (T62, T65, T69) write `docs/08-security.md` |
| `09` | ❌ **absent** | **yes** — the AI-security gate (T64) writes `docs/09-*` |
| `10` | ❌ **absent** | **yes** — the test-writer stage writes `docs/10-tests.md` |
| `11` | ✅ | yes — T47 |
| `12` | ✅ | yes — the speed checks (T66, T68) |
| `13` | ✅ | yes — the logging check (T71) |
| `15` | ✅ | **no** — 15 can never be frozen, because no globbed document can outnumber it. Same for 14. |

Writing the old list would have unblocked T62 and then hit the same wall twice more — at T64 and
at the test-authoring stage — weeks apart, each looking like a fresh problem. **It is one
problem.** That is the third time in this project a table telling you how much work you have
turned out to be a guess rather than a reading; it is recorded here rather than quietly fixed.

### Why I did not write it myself

This file is what stops a review agent from lifting its own audit restrictions. **A guard an
agent can lift for itself is not a guard.** The precedent was set when T60 refused to self-grant
its own unlock.

### The second job this file does, which is still worth knowing

It drives two different guards by two different rules. The document freeze above reads its
**contents**. A separate denylist — the one restricting what commands a review agent may run
(`git reset --hard`, `curl | sh`, `npm publish`, `terraform destroy`) — switches off merely
because the file **exists**, whatever is in it (line 102). It has existed since 2 August, so
**that denylist has been off since then**, including while the file was empty and nothing was
actually unlocked. Not dangerous on its own, and not something for me to quietly "repair" — how
your guards behave is your call.

**What unlock never affects:** the always-on list — `rm -rf`, force-push, `DROP`/`TRUNCATE`,
deleting a stage doc. Those stay blocked regardless, which is why a force-push was refused on
11 August even with this file present.

---

## 2. `.env` — stop printing live emails and login codes ⚠️ **~2 minutes**

**Found by T62 on 2026-08-13 (finding SEC-021). This is the cheapest fix on the whole list
and it closes the worst of the three.**

Your `.env` has both of these:

```
NODE_ENV=development
EMAIL_PROVIDER=console
```

The console email provider writes **the student's raw email address and their live one-time
login code** to standard output — `server/src/modules/notification/email-provider.ts:66`. It
is allowed to run *only* because `NODE_ENV` says `development`. Meanwhile `DATABASE_URL`
points at the live Supabase database holding real accounts.

So the single environment that touches real student data is the one configured to have the
guards switched off. The guard itself is not broken — it is doing exactly what it was told.

**Why `NODE_ENV` is the more important half.** T60 fixed several problems by making the app
*refuse to boot* on a bad configuration. Every one of those refusals is keyed on `NODE_ENV`.
Leaving it at `development` against a live database disarms all of them at once.

### What to do

Either point this environment at a throwaway database, **or** set `EMAIL_PROVIDER` to
something that does not print (`memory`) and move `NODE_ENV` off `development`. If you set
`NODE_ENV=production`, expect the app to start refusing things — that is the guard working,
and each refusal message names its own fix.

---

## 3. `.env` — verify the database server, don't just encrypt the traffic ⚠️ **~10 minutes**

**Found by T62 on 2026-08-13 (finding SEC-002).**

Your `.env` has:

```
DATABASE_SSL=require
DATABASE_SSL_CA=
```

`require` means *scramble the traffic, but accept whatever certificate the other end presents*
(`server/src/db/pool.ts:28` maps it to `rejectUnauthorized: false`). It stops someone
passively sniffing the wire. It does **not** stop someone sitting in the middle presenting
their own certificate — and if that happens they get the database password and every row.

**The part worth knowing: the code already defaults to the safe setting.** For any non-local
host it derives `verify-full` on its own. Your `.env` line is explicitly overriding that safe
default with a weaker one. Deleting the line is a legitimate fix.

### What to do

1. Supabase dashboard → Database Settings → SSL Configuration → download `prod-ca-2021.crt`.
2. Put it in `server/certs/`.
3. Set `DATABASE_SSL_CA` to that path, and either set `DATABASE_SSL=verify-full` or delete the
   `DATABASE_SSL` line entirely.

**Why the certificate must come from the dashboard and not from the connection itself:**
trusting a root certificate handed to you by the very server you are trying to verify is
circular — someone in the middle would simply hand you *their* root, and you would pin it.
That reasoning is written into `server/src/config/index.ts` so it does not get lost.

---

## 4. Decide: what happens to the old email fingerprints ⚠️ **a decision, not an edit**

**Found by T62 on 2026-08-13 (finding SEC-019, blocking open question OQ-SEC-02).**

**First, the good news: the real key rotation worked.** `EMAIL_HASH_PEPPER_ACTIVE` is a
genuine `v2:` secret with no placeholder in it. Problem #2 in `TASK-STATUS.md` is properly
closed.

**What is still wrong:** `EMAIL_HASH_PEPPER_RETIRED` still holds
`v1:change-me-in-every-real-environment` — byte-for-byte identical to line 41 of
`.env.example`, which **is committed to this repository**. Every `identity_account` row whose
fingerprint is still stored under version `v1` was computed with a secret that anyone reading
this project can see.

**What that lets someone do:** not read the addresses back — the fingerprint is one-way. But
it lets them *test a guess*. Take a plausible campus address, compute its fingerprint with the
published secret, and see whether it is in the table. On a campus where addresses follow a
predictable pattern, that is a working membership oracle against the one thing this whole
product promises to hide.

It is rated **high** rather than **critical** only because migration 008 removed anonymous
database access, so an attacker now needs database credentials rather than a public request.

### Why you cannot just fix this one

The fingerprints **cannot be recomputed** under the new secret. They are one-way, and the raw
addresses were deliberately never kept. There is no path from the stored value back to
something you could re-hash. So the options are only these two:

| Option | What it costs |
|---|---|
| **Delete or quarantine every `v1$` row** | Destroys real student accounts. Those people cannot sign in and cannot recover — there is nothing left to match them against. |
| **Accept it, in writing, with your name on it** | The oracle stays until those accounts age out naturally. Honest, recorded, and reversible later; but it is a real accepted risk, not a fixed one. |

**This is deliberately not an agent's decision.** Either choice destroys something — accounts,
or a security property — and both are yours to weigh. Nothing on T62 can close until you pick
one, and the choice should be written down where the next reviewer will find it
(`decisions/`), not just done.

---

## 5. T49 — Staging deployment

**Why it blocks:** T11 (the tracer demo on a real phone with a real email) is the **last M1
task**. Closing it takes M1 from 73% to done.

Good news: **Supabase already covers the database half, and step (a) below is already done** —
this file said "no git remote" until 11 August and that had stopped being true; `origin` points
at `github.com/gurkanwaldeep927/murmur` and the task branches are pushed. What is actually
missing is **hosting**, and there is still no deploy config.

### Steps

**a. ~~Push to GitHub~~ — done.** The remote exists and CI runs on every push.

**b. Deploy the API (~30 min)** — Render is the least-friction option; Railway or Fly work too.
1. New **Web Service** → connect the repo
2. Build command: `npm ci && npm run build`
3. Start command: `npm start`
4. Set environment variables (see checklist below)
5. Deploy, then confirm `https://<your-app>/health` returns `{"status":"ok"}` — it reports
   `degraded` if it can't reach Postgres, so this one call verifies the DB wiring too

**c. Environment variables — generate FRESH secrets, do not reuse your local dev values**

| Variable | Value |
|---|---|
| `DATABASE_URL` | your Supabase connection string |
| `EMAIL_HASH_PEPPER_ACTIVE` | `v1:<new random secret>` |
| `EMAIL_ENCRYPTION_KEY` | new base64 32-byte key |
| `SESSION_SIGNING_KEY` | `v1:<new random secret>` |
| `CAMPUS_EMAIL_DOMAINS` | `nitj.ac.in` |
| `EMAIL_PROVIDER` | `smtp` |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | see below |
| `NODE_ENV` | `production` |

Generate secrets with:
```bash
node -e "console.log('v1:'+require('crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # encryption key
```

> ⚠️ **Changing `EMAIL_HASH_PEPPER_ACTIVE` between environments is correct and intentional** —
> staging and production must not share a pepper. But it means staging cannot recognise
> production's email hashes, which is the point.

**d. Real email (required for T11)**
The nodemailer SMTP adapter is already built. For Gmail: enable 2FA on the account, then create
a **16-character App Password** (`SMTP_PASS`), with `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`,
`SMTP_USER=<your gmail>`. Without this the OTP email never sends and T11 can't run.

**e. Deploy the client (~15 min)**
Vercel or Netlify, static: build `npm run build` in `client/`, publish `client/dist`, and set
`VITE_API_BASE=https://<your-api-host>`.

**f. Run migrations against staging**
```bash
DATABASE_URL=<staging url> npm run migrate
```

### Send me
The staging API URL and client URL. Then I run T11 and M1 is closed.

---

## 6. Rotate the database password

**Why:** on 5 August the password appeared in terminal output on your own machine, in the middle
of a dumped connection object. `.env` is not in git and never has been, so it never entered the
repository or its history — it has only ever been on your screen.

The code side is closed: the service pool was fixed on 7 August, and the last place with the
same hole (`scripts/db-inventory.ts`) was fixed on 9 August. **Those stop new leaks; they cannot
un-see the one that already happened.**

### What to do
1. Supabase dashboard → Project Settings → Database → reset the password.
2. Update `DATABASE_URL` in your local `.env`.
3. Update it wherever staging reads it, once T49 exists.

**Do this before your next `npm run db:inventory` run**, not after — that script is the one most
likely to be run right after a rotation.

---

# TIER 2 — start now, finishes later

## 7. T43 — Legal review (IT Rules 2021 + DPDP) 🕐 long lead time

**Start this now even though it's M5.** Engaging counsel takes weeks, and it blocks five tasks
(T34, T35, T42, T75, T70). It is the single longest-lead item in the project.

**What counsel must confirm or correct:**
1. **IT Rules 2021 SLA figures** currently assumed in the plan — **24h acknowledgement**,
   **15-day general resolution**, **24–36h expedited**. These are wired into the `sla_deadline`
   computation in T34, so a correction late means rework in code *and* in stored data.
2. **DPDP consent-flow copy** — the exact wording shown at S1/S4 onboarding.
3. **Retention duration** — how long Murmur keeps identity data. Needed by the T70 privacy gate,
   which *executes* retention enforcement rather than just reading policy.
4. **Erasure vs ban legal basis** — a banned user asking for deletion cannot simply be deleted,
   or the ban is defeated. Counsel needs to bless keeping the ban hash after erasure.
5. **⚠️ New, 9 August — there is no complaint category for doxxing.** The eight reasons a report
   can carry cover harassment, hate, threats, spam, impersonation, two kinds of non-consensual
   imagery, and a catch-all. **Not "someone revealed who I am"** — which is the single harm this
   product exists to prevent. `impersonation` is a different thing: that is somebody pretending
   to *be* you, not somebody unmasking you. Counsel needs to say whether this needs its own
   category and **which clock it earns** — 24 hours or 15 days. Until then it falls into the
   catch-all, on the slow clock. Full write-up: `docs/TASK-STATUS.md` problem #18.

### Send me
The confirmed SLA numbers, the consent copy, the retention period, and the answer on doxxing.
I wire them in.

---

# TIER 3 — before their milestone (structural — keep doing these as scheduled)

## 8. Design round 6 — the report form's missing categories ⚠️ **legal**

**Brief, ready to paste:** `docs/design-prompts/T39-round-6.md`.

**Why it matters, in one paragraph.** The law gives a small set of complaint categories a
**24-hour** deadline and everything else **15 days**. The app decides which clock a complaint
gets from the category the reporter picks — that is the whole design, and it is locked in the
database so a deadline can never be wrong. **The report screen offers five choices, and two of
the three urgent categories are not among them.** A student reporting intimate images of
themselves shared without consent has nothing to pick but "Something else serious", which is the
catch-all, and the catch-all is deliberately *not* urgent. So the most time-critical complaint
the platform can receive would quietly get fifteen days.

Nothing is broken in the code. The category is correct — it just cannot be chosen. The fix is a
fuller list on the screen.

The brief also carries four smaller corrections found the same day: one button covering two
different legal categories, an anonymity default that contradicts the confirmation screen right
after it, a "someone else reported this" message describing something that never happens, and a
made-up grievance officer with a made-up email on the page that legally must name a real one.

### What to do
Open Claude Design, paste `docs/design-prompts/T39-round-6.md`, and save the updated components
back into the design project. I pull them down from there — that part is mine.

**One thing the brief deliberately does not ask for, and you should know why.** The screen today
has an option reading *"Reveals someone's real identity"* — doxxing, which is the exact harm this
whole product exists to prevent. **It maps to no category the server accepts.** The brief asks
for eight options, not nine, because a ninth would be refused the moment someone submitted it.
That gap is real and it is **the lawyer's** (item 4 above), not the designer's — deciding whether
doxxing earns the 24-hour clock or the 15-day one is a reading of the IT Rules.

---

## 9. T30 — Claude Design round 4 (sync status)

**Brief, ready to paste:** `docs/design-prompts/T30-sync-status.md`. **Blocks T31.**

| Task | Milestone | Prompts | Components |
|---|---|---|---|
| T30 | M4 | §3.12 | SyncStatusList |

This one is a **real design round**, not a copy. The screen exists in the design project, but it
was drawn before the offline queue was built and gets three things wrong — including drawing a
state that can never happen. The brief says which, and why.

**T25 and T39 used to be listed here and are gone** — they landed on 9 August. They were copy
jobs, not design sessions, and copy jobs are mine: all 17 screens have existed since July. If a
future round is genuinely just "pull the existing screen down", it should not appear on this
list at all.

Components go in `client/src/components/`; I integrate from `client/src/screens/`.

---

# TIER 4 — anytime before the M6 launch gate (deferred here on 2026-07-30)

Nothing below blocks any Claude Code build task. They only feed the T48 GO/NO-GO checklist,
so batch them whenever is convenient — the natural moment is once M5 is substantially done and
before T48 runs.

**T54 is the exception worth reading.** It qualifies for this tier on the same test as the
others (it blocks no build task), but unlike the others it has a real cost to deferring: no
content publishes until it lands, and vendor risk stays undiscovered. It's ~30 minutes. Doing
it in any idle moment before M6 is strictly better than doing it at M6.

## 10. T54 — AI-moderation vendor shortlist

**No longer blocking** (changed 2026-07-30, `docs/07-plan.md` fourth revision). It used to
gate six tasks: T14 built the gateway *around* a chosen provider, and everything that
publishes content sat behind it. T14 is now split — **T14a** is the provider-agnostic gateway
(port, tiered routing, `moderation_case` lifecycle, fail-closed hold, retry worker) and I
build it without a vendor; **T14b** is just the adapter that binds your chosen providers to
that port. So T15/T16/T19/T56 no longer wait on you.

**What it still gates, all at M6:** **T14b** (provider binding), **T64** (adversarial probe of
the live provider), **T73** (the outage runbook, whose provider-switch criteria are meaningless
before a provider exists), and therefore **T48**, the GO/NO-GO gate.

**Why doing it early is still better:** until it lands, nothing publishes outside the test
suite (fail-closed default), the per-item cost stays unsized (**RR-9**), and any vendor you
would have rejected on the `FP(must_pass)` disqualifier gets discovered at the last milestone
instead of the first (**RR-21**). Nothing forces you to wait — this is a ~30-minute task whose
deadline is now M6 rather than today.

**Full instructions + results table:** `decisions/t54-moderation-vendor.md`
**Harness (already built):** `spikes/t54-moderation/`

### Steps

**a. OpenAI — tier-1 candidate (~10 min)**
1. Sign in at <https://platform.openai.com>
2. **API keys → Create new secret key**, name it `murmur-t54-spike`
3. Add to `.env`: `OPENAI_API_KEY=sk-...`
4. Note your rate limits under **Settings → Limits** — tier 1 sits in the publish path, so a
   low RPM cap is a real constraint. Record it in the decision doc.

**b. Azure AI Content Safety — tier-2 candidate (~20 min)**
1. Create a free account at <https://azure.microsoft.com/free> (card needed for identity
   verification only; the F0 tier is free)
2. **Create a resource → Content Safety → Create**
3. Region: **Central India** or Southeast Asia — latency matters, this call is synchronous
4. Pricing tier: **F0 (free)** — 5,000 text records/month, plenty for the spike
5. From **Keys and Endpoint**, add to `.env`:
   ```
   AZURE_CONTENT_SAFETY_ENDPOINT=https://<your-resource>.cognitiveservices.azure.com
   AZURE_CONTENT_SAFETY_KEY=<key1>
   ```

**c. Run the spike (~1 min)**
```bash
npx tsx spikes/t54-moderation/run-spike.ts
```

**d. Read the scorecard in this order**
1. **`FP(must_pass)`** — false positives on frank senior advice. Two fixtures are deliberately
   harsh criticism of a professor and of the placement cell. **They must pass.** Murmur's whole
   value is honest talk; a provider that censors it is disqualified as tier 1 at any price.
2. **`hinglish`** — NITJ posts will be code-mixed Hindi/Punjabi-English. English-trained
   classifiers fail *both* ways on it: under-blocking real abuse and over-blocking normal posts.
3. **`miss(block)` / `miss(esc)`** — under-blocking. Less fatal (tier 2 + user reports catch it),
   but self-harm or ragging reaching `pass` is serious.
4. **`p50ms`** — synchronous, in the publish path.
5. **`INR/mo`** — only compare among providers that cleared #1.

**e. Fill in the results table** in `decisions/t54-moderation-vendor.md`, set Status to
RESOLVED, and tell me.

### ⚠️ Already-found landmine
**Google Perspective API is disqualified** — it sunsets **31 Dec 2026**, hard deadline, no
migration path, and quota-increase requests stopped in Feb 2026. It was the obvious free
tier-1 pick. Verify sunset status for any vendor you add.

### Send me
Vendor names for tier 1 + tier 2, the scorecard output, and the rate limits. Then I build T14.

---

---

## 11. T42 — Grievance officer details (launch-blocking for R7 AC3)

IT Rules require a **named, reachable grievance officer**. This is a real person with a real
email and phone, published in-app on S15.

**What to prepare** (loaded into the `grievance_officer_contact` table):

| Field | What it needs |
|---|---|
| `officer_name` | Real name of the designated officer |
| `contact_email` | Monitored address — this is a legal commitment, not a formality |
| `contact_phone` | Optional but expected |
| `process_summary` | IT-Rules-compliant description of how a grievance is filed, acknowledged, and resolved — write it **after** T43 confirms the SLA figures, so the text and the code agree |

Until this lands the app ships placeholder copy, which is fine for staging and **not** fine for
launch.

## 12. T72–T75 — Four runbooks

Each has `[HUMAN:` markers to fill. T48 (the final GO/NO-GO gate) checks that **no `[HUMAN:`
markers remain** — they're launch-blocking in aggregate.

| Task | File | Markers | Depends on |
|---|---|---|---|
| T72 | `runbooks/pepper-rotation.md` | 7 | — (do anytime) |
| T73 | `runbooks/moderation-provider-outage.md` | 9 | **T54** |
| T74 | `runbooks/takedown-sla-breach.md` | 6 | T35 |
| T75 | `runbooks/dpdp-breach-notification.md` | 7 | **T43** (counsel) |

*(Counts re-counted from the files on 2026-08-09. **All four were wrong** — the table had said
6/6/5/5 against an actual 7/9/6/7. Small, but it is a table telling you how much work you have,
so it should not be a guess. Recount them rather than trusting this line if the runbooks change.)*

**What they ask for, concretely:**
- **Everywhere:** owner name + last-reviewed date
- **T72:** secrets-manager name and key path, drill frequency (months), rollout monitoring window
  (days), which tables have recoverable plaintext, missed-ban freeze threshold
- **T73:** sandbox classify command (comes out of the T54 spike), queue-depth query or dashboard
  link, outage thresholds in minutes/hours, where the user notice is posted, triage order, and
  the **provider-switch criteria decided cold** — the runbook explicitly warns not to decide
  this during an outage
- **T74:** ticket query/dashboard link, counsel contact, reporter-notification template, recurrence
  window before a staffing review
- **T75:** counsel contact + backup, the Data Protection Board notification form/portal, key-rotation
  procedure reference, and a **pre-drafted student breach-notification email** — the runbook notes
  writing it mid-incident produces a bad one

> The T75 runbook flags something worth reading: the notification channel *is* the PII. If email
> is what leaked, counsel must confirm an acceptable alternative channel.

---

## Also yours: T11's demo

T11 is my task, but the demo itself is yours: a **real phone**, a **real `@nitj.ac.in` email**,
running against staging. I inspect the responses for identity leakage. Needs T49 first.

---

## What I'll build meanwhile — and the honest answer is "very little"

The list that used to sit here named T14a, T15, T16, T17, T56, T60 and T61. **All seven are
done**, and had been for a week while this section went on claiming they were in progress.

Here is the real picture on 9 August, at **39 of 77 done and nothing half-finished**:

**Everything left is one of four things**, and only the first is mine:

1. **Behind T62** — T20 (search), T37 (operator permissions), and through T37 the whole rest of
   Milestone 5 (T35, T36, T41). All of them change the exact code T62 is waiting to inspect, so
   building them first only makes its findings staler. **This is why item 1 is item 1.**
2. **The phone app** — ~~T28 and~~ T31, which needs T30's screen first. **T28 landed on
   11 August.** It never needed T30: that was a fourth mis-filing, corrected on 9 August. T31
   draws the screen; T28 was the machinery under it, and the machinery is now in and tested.
3. **A designer** — T30 (now carrying a fourth gap, added by T28: the composers have no card for
   "this never left the phone"), and design round 6.
4. **You** — everything else on this list.

**As of 11 August, category 1 is the entire remaining build.** There is no longer a Claude Code
task outside it that does not depend on you or on a designer. That is not a complaint — it is
the reason a one-minute file edit sits at the top of this list.

**What I did while writing this**, so "very little" is not an excuse: landed T25 and T39 (they
were mis-filed here as yours), wrote the round-6 brief, and closed two recorded bugs — the last
place that could print the database password, and a maintenance script that had silently stopped
counting half the database's tables.

`docs/gates/` now holds four gate files (`security-gate-M1.json`, `privacy-gate-m1.json`,
`14-resilience-T63.gate.json`, `taste-gate.json`). **Do not trust their contents as a list of
what is still open** — on 4 August a finding they listed as unfixed turned out to have been fixed
days earlier. T62's run rebuilds an honest list, which is one more reason it is the top item.
