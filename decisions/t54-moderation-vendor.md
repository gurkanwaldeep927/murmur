# T54 — AI-moderation vendor shortlist: IN PROGRESS

Status: **open — no longer blocking any build task** (changed 2026-07-30). Milestone: **M6**.
Owner: human/engineering. Started 2026-07-24.

Sizes **RR-9** ("AI-moderation cost per active user unsized in rupees") and answers PRD
**OQ-3**. The plan wants this settled *before* a provider is bound, not during it.

> **Re-scoped 2026-07-30 — `docs/07-plan.md` fourth revision.** T14 was split. **T14a**
> (built at M2) is the provider-agnostic gateway: the A7 port, tiered routing, the
> `moderation_case` lifecycle, the fail-closed hold posture, and the retry/escalate worker —
> none of which needed a vendor name. **T14b** (M6) is the adapter that binds the vendors
> chosen here onto that port. So this decision no longer gates T15/T16/T19/T56; it gates
> **T14b**, **T64** (adversarial probe of the live provider), **T73** (outage runbook), and
> through them **T48**.
>
> **What still argues for doing it early:** with no provider bound, the hold-all default holds
> every question and answer and publishes nothing outside the test suite. That is R6's
> fail-closed posture behaving correctly — but it means real-classifier accuracy, the
> `FP(must_pass)` disqualifier below, and per-item cost all stay unmeasured until M6
> (**RR-21**). Everything below is unchanged and still ~30 minutes.

---

## What T14 actually needs from this

`docs/07-plan.md` T14 specifies a **tiered, cheap-classifier-first** gateway:
auto-pass / auto-block / escalate, **fail-closed** (content is held, never published, when
the provider is down), with retry/backoff and auto-escalation past a threshold.

So this decision must produce **two** names, not one:

| Slot | Purpose | Requirement |
|---|---|---|
| **Tier 1** | Every question and answer hits this before publish | Cheap or free, fast (it's in the publish path), low false-positive rate |
| **Tier 2 / fallback** | Escalation + provider-outage switch | Better accuracy, cost acceptable at low volume |

The T73 runbook notes the switch to the second provider "is a DEPLOY, not a toggle"
(dual-provider support was deliberately deferred, RR-4) — so the fallback must be
chosen now, cold, not during an outage.

---

## Candidate research (verified 2026-07-24 — re-check before committing)

| Vendor | Price (text) | Free tier | Verdict |
|---|---|---|---|
| **OpenAI omni-moderation** | **Free** for API users, rate-limited by usage tier | n/a — free | Strongest tier-1 candidate. Text **and** image, which R6 will eventually need. |
| **Azure AI Content Safety** | **$0.38 / 1,000 text records** (1 record ≤ 1,000 chars) | 5,000 records/month | Strongest tier-2 candidate. Four severity levels map cleanly onto pass/escalate/block. |
| **Google Perspective API** | Free | 1 QPS default | ❌ **DISQUALIFIED — sunsetting 31 Dec 2026**, hard deadline, no migration path, and Google stopped accepting quota-increase requests in Feb 2026. Do not build on it. |
| **Hive** | Enterprise contract | self-serve capped ~100 req/day | ❌ Poor fit: the self-serve cap is unusable and enterprise annual contracts are wrong for a single founder pre-launch. |
| **Sightengine** | ~$1 / 1,000 (image-led pricing) | trial | Possible third slot, but its pricing and strength are image-oriented; Murmur v1 is text-only. |

**Note the near-miss:** Perspective was the obvious free tier-1 choice and would have been
a dead end within six months of launch. Verify sunset/deprecation status for any vendor
before committing.

### Cost projection at $0.38/1k (Azure), for sizing RR-9

| Monthly moderated items | Cost if ALL go to Azure | Cost if only ~10% escalate to Azure |
|---|---|---|
| 5,000 | ~₹0 (free tier) | ₹0 |
| 10,000 | ~₹335 | ~₹33 |
| 50,000 | ~₹1,672 | ~₹167 |

*(at ₹88/USD — check the live rate. Run `SPIKE_MONTHLY_ITEMS=... npx tsx spikes/t54-moderation/run-spike.ts`
for a current projection.)*

The tiered design is what keeps this affordable: a free tier-1 means Azure is only paid
for on the fraction that escalates. **This is the RR-9 answer, pending confirmation
against real traffic once T14's provider is live.**

---

## Your steps

### 1. OpenAI (tier-1 candidate) — ~10 minutes
1. Sign in at <https://platform.openai.com>.
2. **API keys → Create new secret key.** Name it `murmur-t54-spike`.
3. Add to `.env`: `OPENAI_API_KEY=sk-...`
4. The moderation endpoint is free, but confirm your account's rate limits under
   **Settings → Limits** and record them below — tier-1 sits in the publish path, so a
   low RPM cap is a real constraint.

### 2. Azure AI Content Safety (tier-2 candidate) — ~20 minutes
1. Create a free Azure account at <https://azure.microsoft.com/free> (needs a card for
   identity verification; the F0 tier is free).
2. In the portal: **Create a resource → AI Foundry / Content Safety → Create.** Pick the
   region nearest India (Central India or Southeast Asia) — latency counts here.
3. Choose the **F0 (free)** pricing tier for the spike: 5,000 text records/month.
4. From the resource's **Keys and Endpoint** page, add to `.env`:
   ```
   AZURE_CONTENT_SAFETY_ENDPOINT=https://<your-resource>.cognitiveservices.azure.com
   AZURE_CONTENT_SAFETY_KEY=<key1>
   ```

### 3. Third slot — optional
Only worth it if OpenAI or Azure fails the spike. If you add one, implement its
`classify()` in `spikes/t54-moderation/run-spike.ts` (the stub is marked).

### 4. Run the spike — one command
```bash
npx tsx spikes/t54-moderation/run-spike.ts
```
It runs 17 campus-shaped fixtures (`spikes/t54-moderation/samples.json`) through every
configured provider and prints a scorecard.

**Read the columns in this order:**
1. **`FP(must_pass)`** — false positives on frank senior advice. Murmur's entire value is
   honest talk about placements and professors. **Anything above 0 disqualifies the
   provider as tier 1**, however cheap it is. Two fixtures are deliberately harsh
   criticism of a professor and of the placement cell; they must pass.
2. **`hinglish`** — NIT Jalandhar posts will be code-mixed Hindi/Punjabi-English, and
   English-trained classifiers degrade badly on it. A provider that can't read Hinglish
   will silently under-moderate abuse *and* over-block ordinary posts.
3. **`miss(block)` / `miss(esc)`** — under-blocking. Less fatal than #1 because tier 2 and
   user reports (R7) catch these, but self-harm and ragging fixtures reaching `pass` is
   serious.
4. **`p50ms`** — this call is in the publish path (A3).
5. **`INR/mo`** — only compare among providers that cleared #1.

### 5. Record the decision
Fill in the tables below, flip Status to RESOLVED, and tell me. I'll then build T14
against the chosen pair.

---

## Results — fill in after the spike

| | Tier 1 | Tier 2 / fallback |
|---|---|---|
| Vendor | | |
| FP on must_pass | | |
| Hinglish wrong | | |
| Missed blocks | | |
| p50 latency | | |
| Price / 1k | | |
| Rate limit | | |

**Chosen tier 1:**
**Chosen tier 2 / outage fallback:**
**Projected monthly cost at 10k items (RR-9):**
**Escalation thresholds** (score/severity at which tier 1 escalates rather than
auto-blocking):

**Anything surprising in the spike output?** (worth recording — it feeds the T14
threshold tuning and the T73 outage runbook)
