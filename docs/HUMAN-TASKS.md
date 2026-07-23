# Human Tasks — what only you can do

Living checklist of every task in `docs/07-plan.md` that Claude Code cannot do, ordered by
how much it unblocks. Companion to `docs/BUILD-NOTES.md` (the build log).

**Last updated:** 2026-07-24, after T12/T13 landed.

---

## Status at a glance

| # | Task | Blocks | Your time | When |
|---|---|---|---|---|
| 1 | **T54** — moderation vendor | T14 → T15 → T16 → T19 → T56, T73 | ~30 min | **Now** |
| 2 | **T18** — Claude Design round 2 | T19 | 15–60 min | **Now** |
| 3 | **T49** — staging deploy | T11 (closes M1) | 1–2 hrs | **Now** |
| 4 | **T43** — legal review (IT Rules + DPDP) | T34, T35, T42, T75, T70 | Weeks (external) | **Start now, finishes later** |
| 5 | **T42** — grievance officer details | R7 AC3 — **launch-blocking** | ~1 hr | Before M5 |
| 6 | **T72–T75** — four runbooks | T48 GO/NO-GO | ~30 min each | Before M6 |
| 7 | **T25 / T30 / T39** — design rounds 3–5 | T26, T31, T40, T41 | 15–60 min each | At each milestone |

**I am not idle while you do these.** Startable today without you: **T17** (browse feed),
**T60** (security gate), **T61** (privacy gate). Say the word and I'll take those next.

---

# TIER 1 — do these now

## 1. T54 — AI-moderation vendor shortlist ⚠️ biggest lever

**Why it blocks:** T14 builds the moderation gateway around a *chosen* provider. Everything
that publishes content (T15 create-question, T16 create-answer, T19 integration, T56 tests)
sits behind it. Six tasks, one decision.

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

## 2. T18 — Claude Design round 2

**Why it blocks:** T19 integrates the M2 screens. Needed: **QuestionFeedCard, AskComposer,
QuestionThread, AnswerComposer** (S5–S8).

Your build notes say **all 17 screens S1–S17 already exist** in the "Murmur email entry form"
design project (owner: rishi). If that's still true this is a copy, not a design session.

### Try in this order

**Option A — fastest, zero design work (preferred)**
Give me the **full project UUID**. Your notes only record `ecb9e3e6-…` (truncated), and that
project does not currently appear in my accessible list — I can only see *FitKit Design System*
and two projects named *Design System*. Send the full UUID and confirm it's shared with your
account as a **design-system** project, and I'll pull S5–S8 myself.

**Option B — you export**
1. Open the Murmur design project
2. Export `S5`, `S6`, `S7`, `S8` as `.dc.html`
3. Drop them in `client/src/components/` (that folder is Claude Design's — I only integrate)
4. Tell me

**Option C — if the components aren't actually there**
1. Open Claude Design
2. Paste `docs/06-ui.md` **§2** (the design contract) first — this is what keeps the components
   visually consistent with S1–S4
3. Then paste the **§3.5–§3.8** prompts, one per component
4. Save the results into `client/src/components/`

### Send me
Either the project UUID, or the four files in place.

---

## 3. T49 — Staging deployment

**Why it blocks:** T11 (the tracer demo on a real phone with a real email) is the **last M1
task**. Closing it takes M1 from 73% to done.

Good news: **Supabase already covers the database half.** What's missing is hosting — and the
repo currently has **no git remote and no deploy config at all**.

### Steps

**a. Push to GitHub (~10 min)**
```bash
gh repo create murmur --private --source=. --remote=origin
git push -u origin main
```
(or create the repo in the browser and `git remote add origin <url>`)

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

# TIER 2 — start now, finishes later

## 4. T43 — Legal review (IT Rules 2021 + DPDP) 🕐 long lead time

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

### Send me
The confirmed SLA numbers, the consent copy, and the retention period. I wire them in.

---

# TIER 3 — before their milestone

## 5. T42 — Grievance officer details (launch-blocking for R7 AC3)

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

## 6. T72–T75 — Four runbooks

Each has `[HUMAN:` markers to fill. T48 (the final GO/NO-GO gate) checks that **no `[HUMAN:`
markers remain** — they're launch-blocking in aggregate.

| Task | File | Markers | Depends on |
|---|---|---|---|
| T72 | `runbooks/pepper-rotation.md` | 6 | — (do anytime) |
| T73 | `runbooks/moderation-provider-outage.md` | 6 | **T54** |
| T74 | `runbooks/takedown-sla-breach.md` | 5 | T35 |
| T75 | `runbooks/dpdp-breach-notification.md` | 5 | **T43** (counsel) |

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

## 7. T25 / T30 / T39 — Claude Design rounds 3–5

Same shape as T18. If all 17 screens are already in the design project, these are copies.

| Task | Milestone | Prompts | Components |
|---|---|---|---|
| T25 | M3 | §3.9–§3.11 | SearchPanel, TopicBrowseList, ProfileCard |
| T30 | M4 | §3.12 | SyncStatusList |
| T39 | M5 | §3.13–§3.17 | ReportContentModal, MyReportsList, GrievanceContactPanel, EscalationQueueTable, GrievanceResolutionPanel |

Components go in `client/src/components/`; I integrate from `client/src/screens/`.

---

## Also yours: T11's demo

T11 is my task, but the demo itself is yours: a **real phone**, a **real `@nitj.ac.in` email**,
running against staging. I inspect the responses for identity leakage. Needs T49 first.

---

## What I'll build meanwhile

Nothing above blocks all of my work. Unblocked right now:

- **T17** — A5 browse feed (published-questions query powering S5). Needs only T13, which landed.
- **T60** — security-agent gate over A1/A2/T50/T12 (warn-only, was due at M1)
- **T61** — privacy-agent gate: PII inventory + leakage baseline (warn-only, was due at M1)

Neither gate has been run yet — `docs/gates/` holds only `taste-gate.json`.
