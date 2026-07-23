/**
 * T54 — AI-moderation vendor spike.
 *
 * Runs the campus-shaped fixtures in samples.json through each configured provider and
 * reports what actually matters for the T14 decision:
 *
 *   1. FALSE POSITIVES on the `must_pass` set. Murmur exists so seniors can be frank
 *      about placements and professors. A provider that flags honest criticism is
 *      disqualified no matter how cheap it is — this is the number to look at first.
 *   2. Misses on `must_block` / `must_escalate`.
 *   3. Code-mixed (Hinglish) behaviour, since that is what campus posts look like.
 *   4. Latency, because A3 blocks on the tier-1 call before publish.
 *   5. Cost per 1,000 calls, projected to a monthly volume (RR-9 sizing).
 *
 * Run:  npx tsx spikes/t54-moderation/run-spike.ts
 * Providers activate only when their keys are present in .env — run it with one, or
 * with all three, and re-run as you add accounts.
 *
 * This is a SPIKE: it is not wired into the app, is not covered by tsconfig's include,
 * and should be deleted (or moved under tests/) once T14 picks a provider.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Tunables — set these before reading the cost column.
// ---------------------------------------------------------------------------

/** Check the live rate; this is only for turning vendor USD list prices into rupees. */
const USD_TO_INR = Number(process.env.SPIKE_USD_INR ?? 88);

/** Monthly moderated items to project cost against (every question + every answer). */
const MONTHLY_ITEMS = Number(process.env.SPIKE_MONTHLY_ITEMS ?? 10_000);

type Disposition = "pass" | "block" | "escalate";

interface Sample {
  id: string;
  group: string;
  expect: Disposition;
  text: string;
}

interface ProviderResult {
  disposition: Disposition;
  /** Highest-scoring category label, for eyeballing why something was flagged. */
  label: string;
  /** 0..1 normalized confidence where the provider gives one. */
  score: number;
  ms: number;
  error?: string;
}

interface Provider {
  name: string;
  /** USD per 1,000 text calls, or 0 for free. null = must be quoted manually. */
  usdPer1k: number | null;
  configured: boolean;
  missingEnv: string;
  classify(text: string): Promise<ProviderResult>;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/**
 * OpenAI omni-moderation — free at time of writing, so the natural tier-1 candidate.
 * Returns per-category booleans + scores; `flagged` is its own auto-block signal.
 * Self-harm is routed to `escalate` rather than `block`: a student in crisis needs a
 * human, and silently blocking the post is the worst possible outcome.
 */
const openai: Provider = {
  name: "openai-omni-moderation",
  usdPer1k: 0,
  configured: Boolean(process.env.OPENAI_API_KEY),
  missingEnv: "OPENAI_API_KEY",
  async classify(text) {
    const started = Date.now();
    try {
      const res = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: "omni-moderation-latest", input: text }),
      });
      const ms = Date.now() - started;
      if (!res.ok) {
        return { disposition: "escalate", label: "-", score: 0, ms, error: `HTTP ${res.status}` };
      }
      const json = (await res.json()) as {
        results: { flagged: boolean; category_scores: Record<string, number> }[];
      };
      const result = json.results[0]!;
      const scores = Object.entries(result.category_scores).sort((a, b) => b[1] - a[1]);
      const [label, score] = scores[0] ?? ["none", 0];
      const selfHarm = scores.find(([k]) => k.startsWith("self-harm"));
      const disposition: Disposition =
        selfHarm && selfHarm[1] > 0.5 ? "escalate" : result.flagged ? "block" : "pass";
      return { disposition, label: label!, score: score!, ms };
    } catch (err) {
      return {
        disposition: "escalate",
        label: "-",
        score: 0,
        ms: Date.now() - started,
        error: (err as Error).message,
      };
    }
  },
};

/**
 * Azure AI Content Safety — paid, four severity levels per category. Mapped as:
 * severity 0-1 pass, 2-3 escalate, 4+ block (Azure's own guidance is that 2+ warrants
 * review). SelfHarm always escalates rather than blocks, same reasoning as above.
 */
const azure: Provider = {
  name: "azure-content-safety",
  usdPer1k: 0.38,
  configured: Boolean(process.env.AZURE_CONTENT_SAFETY_ENDPOINT && process.env.AZURE_CONTENT_SAFETY_KEY),
  missingEnv: "AZURE_CONTENT_SAFETY_ENDPOINT + AZURE_CONTENT_SAFETY_KEY",
  async classify(text) {
    const started = Date.now();
    const endpoint = (process.env.AZURE_CONTENT_SAFETY_ENDPOINT ?? "").replace(/\/$/, "");
    try {
      const res = await fetch(`${endpoint}/contentsafety/text:analyze?api-version=2024-09-01`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Ocp-Apim-Subscription-Key": process.env.AZURE_CONTENT_SAFETY_KEY!,
        },
        body: JSON.stringify({ text, outputType: "FourSeverityLevels" }),
      });
      const ms = Date.now() - started;
      if (!res.ok) {
        return { disposition: "escalate", label: "-", score: 0, ms, error: `HTTP ${res.status}` };
      }
      const json = (await res.json()) as {
        categoriesAnalysis: { category: string; severity: number }[];
      };
      const worst = [...json.categoriesAnalysis].sort((a, b) => b.severity - a.severity)[0];
      const severity = worst?.severity ?? 0;
      const isSelfHarm = worst?.category === "SelfHarm";
      const disposition: Disposition =
        severity >= 4 && !isSelfHarm ? "block" : severity >= 2 ? "escalate" : "pass";
      return { disposition, label: worst?.category ?? "none", score: severity / 6, ms };
    } catch (err) {
      return {
        disposition: "escalate",
        label: "-",
        score: 0,
        ms: Date.now() - started,
        error: (err as Error).message,
      };
    }
  },
};

/**
 * Third slot — fill in whichever vendor you shortlist (Sightengine, Hive, an LLM-based
 * classifier, etc). Left deliberately unimplemented rather than guessed: its request
 * shape and pricing must come from that vendor's own docs, not from here.
 */
const thirdSlot: Provider = {
  name: "third-vendor (not implemented)",
  usdPer1k: null,
  configured: false,
  missingEnv: "implement classify() once you pick the third vendor",
  async classify() {
    return { disposition: "pass", label: "-", score: 0, ms: 0, error: "not implemented" };
  },
};

const PROVIDERS = [openai, azure, thirdSlot];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const raw = await readFile(path.join(__dirname, "samples.json"), "utf8");
  const { samples } = JSON.parse(raw) as { samples: Sample[] };

  const active = PROVIDERS.filter((p) => p.configured);
  if (active.length === 0) {
    console.log("No providers configured. Add keys to .env, then re-run:\n");
    for (const p of PROVIDERS) console.log(`  ${p.name.padEnd(30)} needs ${p.missingEnv}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Providers: ${active.map((p) => p.name).join(", ")}`);
  console.log(`Samples:   ${samples.length}   (USD→INR ${USD_TO_INR}, volume ${MONTHLY_ITEMS}/mo)\n`);

  const perProvider = new Map<string, ProviderResult[]>();

  for (const provider of active) {
    const results: ProviderResult[] = [];
    console.log(`\n=== ${provider.name} ===`);
    for (const sample of samples) {
      const result = await provider.classify(sample.text);
      results.push(result);
      const ok = result.disposition === sample.expect;
      const flag = result.error ? "ERR " : ok ? "  ok" : "MISS";
      console.log(
        `${flag}  ${sample.id.padEnd(28)} want=${sample.expect.padEnd(8)} got=${result.disposition.padEnd(8)} ` +
          `${result.label.slice(0, 18).padEnd(18)} ${result.score.toFixed(2)}  ${String(result.ms).padStart(5)}ms` +
          (result.error ? `  ${result.error}` : ""),
      );
    }
    perProvider.set(provider.name, results);
  }

  // --- Scorecard -----------------------------------------------------------
  console.log("\n\n================ SCORECARD ================\n");
  console.log(
    `${"provider".padEnd(30)} ${"FP(must_pass)".padEnd(14)} ${"miss(block)".padEnd(12)} ` +
      `${"miss(esc)".padEnd(10)} ${"hinglish".padEnd(10)} ${"p50ms".padEnd(7)} ${"INR/mo"}`,
  );

  for (const provider of active) {
    const results = perProvider.get(provider.name)!;
    let falsePositives = 0;
    let missedBlocks = 0;
    let missedEscalations = 0;
    let hinglishWrong = 0;
    let hinglishTotal = 0;

    samples.forEach((sample, i) => {
      const got = results[i]!.disposition;
      const correct = got === sample.expect;
      if (sample.group === "must_pass" && got !== "pass") falsePositives++;
      if (sample.expect === "block" && got === "pass") missedBlocks++;
      if (sample.expect === "escalate" && got === "pass") missedEscalations++;
      if (sample.group === "hinglish") {
        hinglishTotal++;
        if (!correct) hinglishWrong++;
      }
    });

    const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length / 2)] ?? 0;
    const mustPass = samples.filter((s) => s.group === "must_pass").length;
    const cost =
      provider.usdPer1k === null
        ? "quote it"
        : provider.usdPer1k === 0
          ? "free"
          : `₹${Math.round((provider.usdPer1k * USD_TO_INR * MONTHLY_ITEMS) / 1000).toLocaleString("en-IN")}`;

    console.log(
      `${provider.name.padEnd(30)} ${`${falsePositives}/${mustPass}`.padEnd(14)} ` +
        `${String(missedBlocks).padEnd(12)} ${String(missedEscalations).padEnd(10)} ` +
        `${`${hinglishWrong}/${hinglishTotal} wrong`.padEnd(10)} ${String(p50).padEnd(7)} ${cost}`,
    );
  }

  console.log(
    "\nRead FP(must_pass) first: anything above 0 means the provider censors the frank\n" +
      "senior advice Murmur is for. Cost only matters among providers that pass that bar.\n" +
      "Record the numbers in decisions/t54-moderation-vendor.md.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
