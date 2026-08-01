import { config } from "../../../config/index.js";
import { logger } from "../../../shared/logger.js";
import type { ModerationProvider } from "../moderation.types.js";
import { fixtureProvider } from "./fixture.provider.js";
import { holdAllProvider } from "./hold-all.provider.js";

/**
 * Provider resolution (T14a). The registry T14b (M6) extends with real vendor adapters
 * once T54 names them — a new file in this folder plus one line in `REGISTRY`.
 *
 * Nothing else in the codebase branches on which provider is bound. That is the whole
 * point of the port: binding a vendor is an adapter + config change, not a rework
 * (plan RR-21's stated mitigation).
 */

const REGISTRY: Record<string, () => ModerationProvider> = {
  fixture: () => fixtureProvider,
  // T14b (M6), from T54's shortlist:
  //   "openai":  () => openAiProvider,
  //   "azure":   () => azureContentSafetyProvider,
};

/** Providers that must never be reachable outside the test runner. */
const TEST_ONLY = new Set(["fixture"]);

function resolve(name: string, slot: "tier1" | "tier2"): ModerationProvider | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;

  if (TEST_ONLY.has(key) && config.env !== "test") {
    // Fail at startup, loudly, rather than silently downgrade to hold-all: a deployment
    // that *thinks* it configured a provider must not discover at runtime that it did
    // not. Refusing to boot is the safe direction here.
    throw new Error(
      `MODERATION_PROVIDER${slot === "tier2" ? "_TIER2" : ""}="${key}" is a test-only provider ` +
        `and cannot run with NODE_ENV="${config.env}"`,
    );
  }

  const factory = REGISTRY[key];
  if (!factory) {
    throw new Error(
      `Unknown moderation provider "${key}". Known: ${Object.keys(REGISTRY).join(", ") || "(none bound yet — T14b)"}`,
    );
  }
  return factory();
}

let cached: { tier1: ModerationProvider; tier2: ModerationProvider | null } | null = null;

/**
 * The tier-1 (every item) and tier-2 (escalation-confirmation) providers.
 *
 * With nothing configured, tier 1 is `hold-all` and tier 2 is absent — so every write
 * holds. See `hold-all.provider.ts` for why that is the correct default rather than a
 * placeholder.
 */
export function resolveProviders(): { tier1: ModerationProvider; tier2: ModerationProvider | null } {
  if (cached) return cached;

  const tier1 = resolve(config.moderationProvider, "tier1") ?? holdAllProvider;
  const tier2 = resolve(config.moderationProviderTier2, "tier2");

  if (tier1 === holdAllProvider) {
    logger.warn(
      { tier1: tier1.name },
      "no moderation provider configured — all UGC will be held pending (fail-closed, T14a). " +
        "Binding a real provider is T14b/M6.",
    );
  } else {
    logger.info({ tier1: tier1.name, tier2: tier2?.name ?? null }, "moderation providers bound");
  }

  cached = { tier1, tier2 };
  return cached;
}

/**
 * RES-2 (fixed 2026-08-02). `resolve()` above says it "fails at startup, loudly" — but
 * nothing called it at startup. Resolution happened lazily inside `classifyTiered`, i.e.
 * on the first user write, so a deployment naming a provider that does not exist, or a
 * test-only one, booted green and passed health checks and only broke when a student
 * posted. The whole point of that error is to stop a bad config from reaching users.
 *
 * Each process entrypoint calls this before accepting work, which is what makes the
 * comment true. It also surfaces the "no provider configured — everything holds" warning
 * at boot, where an operator will actually see it, rather than buried in a request log.
 */
export function initModerationProviders(): void {
  resolveProviders();
}

/**
 * Test seam. `config` is read once at import, so a test that wants a different provider
 * cannot get one by mutating process.env after the fact — it overrides here instead.
 * Refuses outside the test runner, for the same reason `TEST_ONLY` does.
 */
export function setProvidersForTest(
  tier1: ModerationProvider,
  tier2: ModerationProvider | null = null,
): void {
  if (config.env !== "test") {
    throw new Error("setProvidersForTest is not available outside NODE_ENV=test");
  }
  cached = { tier1, tier2 };
}

/** Test seam: drop the override and fall back to configuration. */
export function resetProvidersForTest(): void {
  if (config.env !== "test") {
    throw new Error("resetProvidersForTest is not available outside NODE_ENV=test");
  }
  cached = null;
}
