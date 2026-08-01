import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SECREG-PRV-6 — a non-delivering email adapter must never run outside development.
 *
 * The finding: `EMAIL_PROVIDER` defaults to `console`, and that adapter writes the
 * student's RAW address and their LIVE one-time code straight to stdout, bypassing pino's
 * redaction. A production deploy that simply forgot to set the variable would have printed
 * every student's identity and login code into its log aggregator — the precise opposite
 * of the product's core promise. Observed doing exactly that in a dev log on 2026-08-02.
 *
 * `memory` is covered by the same guard for a different reason: it silently delivers
 * nothing, so registration would look healthy while no student ever received a code.
 *
 * The guard runs in the adapter's CONSTRUCTOR, and the module builds its provider at
 * import time, so a misconfigured production process fails at boot rather than on the
 * first sign-up attempt. These tests therefore assert on `import()`, not on a method call.
 */

const ENV_KEYS = [
  "NODE_ENV",
  "EMAIL_PROVIDER",
  "DATABASE_URL",
  "EMAIL_HASH_PEPPER_ACTIVE",
  "SESSION_SIGNING_KEY",
] as const;

let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  vi.resetModules();
  process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
  // Real-looking secrets: under NODE_ENV=production the config guard also rejects
  // .env.example placeholders, and we want THIS test to fail on the email provider.
  process.env.EMAIL_HASH_PEPPER_ACTIVE = "v2:ZmFrZS1idXQtbm90LWEtcGxhY2Vob2xkZXI";
  process.env.SESSION_SIGNING_KEY = "v1:ZmFrZS1zZXNzaW9uLWtleS1ub3QtYS1wbGFjZWhvbGRlcg";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.resetModules();
});

const loadProviderModule = () => import("../../server/src/modules/notification/email-provider.js");

describe("SECREG-PRV-6: non-delivering email adapters", () => {
  it("test_PRV6_console_provider_refuses_to_boot_in_production", async () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "console";
    await expect(loadProviderModule()).rejects.toThrow(/does not deliver real email/i);
  });

  it("test_PRV6_the_unset_default_also_refuses_in_production", async () => {
    // The actual failure mode: nobody sets EMAIL_PROVIDER, it falls back to `console`,
    // and OTPs go to stdout. Forgetting the variable must break the boot, not the promise.
    process.env.NODE_ENV = "production";
    delete process.env.EMAIL_PROVIDER;
    await expect(loadProviderModule()).rejects.toThrow(/does not deliver real email/i);
  });

  it("test_PRV6_memory_provider_refuses_to_boot_in_production", async () => {
    // Not a leak — a silent one. It accepts every send and delivers nothing.
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "memory";
    await expect(loadProviderModule()).rejects.toThrow(/does not deliver real email/i);
  });

  it("test_PRV6_an_unrecognised_environment_is_treated_as_not_dev", async () => {
    // Staging is not development. An allowlist fails closed on values nobody anticipated;
    // a `!== "production"` check would have let this through.
    process.env.NODE_ENV = "staging";
    process.env.EMAIL_PROVIDER = "console";
    await expect(loadProviderModule()).rejects.toThrow(/does not deliver real email/i);
  });

  it("test_PRV6_console_still_works_in_development", async () => {
    // The guard must not make local development harder — that is how guards get removed.
    process.env.NODE_ENV = "development";
    process.env.EMAIL_PROVIDER = "console";
    await expect(loadProviderModule()).resolves.toBeDefined();
  });

  it("test_PRV6_memory_still_works_under_test", async () => {
    // The integration and NFR suites drive the real A2 path through this adapter.
    process.env.NODE_ENV = "test";
    process.env.EMAIL_PROVIDER = "memory";
    const mod = await loadProviderModule();
    expect(mod.memoryEmailProvider).toBeDefined();
  });
});
