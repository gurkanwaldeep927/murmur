import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-011 — email encryption must not be silently off.
 *
 * The finding: `EMAIL_ENCRYPTION_KEY` was declared `optional(..., "")`, and
 * `encryptEmail()` returns `null` when the key is absent. A deployment that never set the
 * variable therefore wrote nothing where the encrypted address belonged, while the schema
 * note, the module comment and the privacy document all went on saying the address was
 * encrypted at rest. There was no warning and no failure — the app looked healthy.
 *
 * Honest scope: `decryptEmail()` has no callers today, so what was wrong was the CLAIM.
 * It becomes a live defect the moment S2 resend or manual-fallback review reads the
 * column and finds it empty for every account created while the variable was unset —
 * unrecoverably, because the plaintext is long gone by then.
 *
 * Third time this remedy is applied in `config/index.ts` (email pepper, console mailer,
 * now this): outside a developer's laptop, a missing security control refuses to boot.
 * The guard lives in config, which is built at import time, so these assert on `import()`.
 */

const ENV_KEYS = [
  "NODE_ENV",
  "EMAIL_ENCRYPTION_KEY",
  "DATABASE_URL",
  "EMAIL_HASH_PEPPER_ACTIVE",
  "SESSION_SIGNING_KEY",
] as const;

let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

/** A real 32-byte key, base64. Obviously fake and low-entropy so the secret scan ignores it. */
const VALID_KEY = Buffer.alloc(32, 7).toString("base64");

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  vi.resetModules();
  process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
  // Must clear the OTHER boot guards so these tests fail on the encryption key rather
  // than on secret validation. Same low-entropy convention as email-provider-guard.
  process.env.EMAIL_HASH_PEPPER_ACTIVE = "v2:test-only-pepper-not-a-real-secret";
  process.env.SESSION_SIGNING_KEY = "v1:test-only-session-key-not-a-real-secret";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.resetModules();
});

const loadConfig = () => import("../../server/src/config/index.js");

describe("SEC-011: email encryption key", () => {
  it("test_SEC011_missing_key_refuses_to_boot_in_production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.EMAIL_ENCRYPTION_KEY;
    await expect(loadConfig()).rejects.toThrow(/EMAIL_ENCRYPTION_KEY is not set/i);
  });

  it("test_SEC011_an_empty_string_counts_as_missing", async () => {
    // The actual failure mode: the variable is PRESENT in .env, with nothing after the
    // `=`. `optional()` treated that as "unset" and fell back to "" without complaint,
    // which is exactly how the key came to be blank in the first place.
    process.env.NODE_ENV = "production";
    process.env.EMAIL_ENCRYPTION_KEY = "   ";
    await expect(loadConfig()).rejects.toThrow(/EMAIL_ENCRYPTION_KEY is not set/i);
  });

  it("test_SEC011_an_unrecognised_environment_is_treated_as_not_dev", async () => {
    // Staging holds real student addresses. An allowlist of dev-like environments fails
    // closed on values nobody anticipated; a `!== "production"` check would not.
    process.env.NODE_ENV = "staging";
    delete process.env.EMAIL_ENCRYPTION_KEY;
    await expect(loadConfig()).rejects.toThrow(/EMAIL_ENCRYPTION_KEY is not set/i);
  });

  it("test_SEC011_a_wrong_length_key_is_refused_at_boot_everywhere", async () => {
    // AES-256 needs exactly 32 bytes. Before this, a short key threw on the first
    // encryptEmail() call — i.e. during a real student's first sign-up, not at startup.
    process.env.NODE_ENV = "development";
    process.env.EMAIL_ENCRYPTION_KEY = Buffer.alloc(16, 7).toString("base64");
    await expect(loadConfig()).rejects.toThrow(/base64-encoded 32-byte key/i);
  });

  it("test_SEC011_a_non_base64_key_is_refused_rather_than_silently_truncated", async () => {
    // Buffer.from(..., "base64") DISCARDS characters outside the alphabet instead of
    // failing, so a pasted key with stray punctuation would decode to something shorter
    // and still "work" — with a key nobody intended.
    process.env.NODE_ENV = "development";
    process.env.EMAIL_ENCRYPTION_KEY = "not a key!!! definitely not base64 ***";
    await expect(loadConfig()).rejects.toThrow(/base64-encoded 32-byte key/i);
  });

  it("test_SEC011_a_valid_key_boots_and_is_exposed_to_the_encryptor", async () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_ENCRYPTION_KEY = VALID_KEY;
    const { config } = await loadConfig();
    expect(config.emailEncryptionKey).toBe(VALID_KEY);
  });

  it("test_SEC011_development_still_boots_with_no_key_at_all", async () => {
    // The no-op path has to survive: the spine must run on a laptop with no secrets.
    // A guard that breaks local development is a guard that gets deleted.
    process.env.NODE_ENV = "development";
    delete process.env.EMAIL_ENCRYPTION_KEY;
    const { config } = await loadConfig();
    expect(config.emailEncryptionKey).toBe("");
  });

  it("test_SEC011_encryption_really_is_a_no_op_without_a_key", async () => {
    // Pins the behaviour the guard exists to bound: silent null, not an error. This is
    // what production was doing, and why nothing ever surfaced it.
    process.env.NODE_ENV = "development";
    delete process.env.EMAIL_ENCRYPTION_KEY;
    const { encryptEmail } = await import("../../server/src/shared/email-encryption.js");
    expect(encryptEmail("someone.24@nitj.ac.in")).toBeNull();
  });

  it("test_SEC011_a_configured_key_round_trips", async () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_ENCRYPTION_KEY = VALID_KEY;
    const { encryptEmail, decryptEmail } = await import(
      "../../server/src/shared/email-encryption.js"
    );
    const blob = encryptEmail("someone.24@nitj.ac.in");
    expect(blob).not.toBeNull();
    expect(decryptEmail(blob!)).toBe("someone.24@nitj.ac.in");
  });
});
