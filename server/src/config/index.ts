import "dotenv/config";

/**
 * Centralized, validated configuration. Every module imports from here rather than
 * reading process.env directly — one place to see what the service needs to run.
 */

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

/**
 * Placeholder fragments shipped in `.env.example`. A secret containing one of these was
 * copied from the sample and never changed.
 *
 * This guard exists because that is exactly what happened (T60 security gate,
 * OQ-SEC-01): `EMAIL_HASH_PEPPER_ACTIVE` ran as the literal
 * `v1:change-me-in-every-real-environment` — a value published in git — so every
 * `identity_account.email_hash` was computed with a pepper any reader of the repo knows.
 * Campus addresses are low-entropy, so that reduces the keyed HMAC to a confirmation
 * oracle against the product's core anonymity promise (RR-7 / RR-13).
 *
 * A comment saying "change me" demonstrably does not prevent this; refusing to boot does.
 * Tests are exempt — they set their own obvious fixtures.
 */
const PLACEHOLDER_MARKERS = ["change-me", "changeme", "your-secret", "example-secret"];

function requiredSecret(name: string): string {
  const v = required(name);
  if (process.env.NODE_ENV === "test") return v;
  const lowered = v.toLowerCase();
  const hit = PLACEHOLDER_MARKERS.find((m) => lowered.includes(m));
  if (hit) {
    throw new Error(
      `${name} is still set to the placeholder from .env.example (contains "${hit}"). ` +
        `Generate a real value:\n` +
        `  node -e "console.log('v1:'+require('crypto').randomBytes(32).toString('base64url'))"\n` +
        `Refusing to start: this secret keys identity hashing, and a known value defeats it.`,
    );
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function intOpt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be an integer`);
  return n;
}

export const config = {
  env: optional("NODE_ENV", "development"),
  port: intOpt("PORT", 4000),
  logLevel: optional("LOG_LEVEL", "info"),

  databaseUrl: required("DATABASE_URL"),

  // T50 — shared email-hash pepper (versioned for rotation, RR-13).
  emailHashPepperActive: requiredSecret("EMAIL_HASH_PEPPER_ACTIVE"),
  emailHashPepperRetired: optional("EMAIL_HASH_PEPPER_RETIRED", ""),
  emailEncryptionKey: optional("EMAIL_ENCRYPTION_KEY", ""),

  // T12 — session signing (decisions/oq-14-session-mechanism.md §5). Versioned
  // `v<n>:<secret>` like the email pepper so keys rotate without logging users out.
  // Deliberately NOT the email-hash pepper: separate security domains.
  sessionSigningKey: requiredSecret("SESSION_SIGNING_KEY"),
  sessionSigningKeyRetired: optional("SESSION_SIGNING_KEY_RETIRED", ""),
  sessionTtlDays: intOpt("SESSION_TTL_DAYS", 30),
  sessionRefreshAfterDays: intOpt("SESSION_REFRESH_AFTER_DAYS", 7),

  // Single-campus allowlist (app config, not a DB table — TRD §10, schema §3.2 note).
  campusEmailDomains: optional("CAMPUS_EMAIL_DOMAINS", "example-college.edu")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),

  // T5 — Email/OTP delivery.
  emailProvider: optional("EMAIL_PROVIDER", "console"),
  emailFrom: optional("EMAIL_FROM", "verify@murmur.example"),
  // SMTP adapter (used when EMAIL_PROVIDER=smtp). For Gmail: host smtp.gmail.com,
  // port 465, secure=true, user=<your gmail>, pass=<16-char Google App Password>.
  smtpHost: optional("SMTP_HOST", ""),
  smtpPort: intOpt("SMTP_PORT", 465),
  smtpUser: optional("SMTP_USER", ""),
  smtpPass: optional("SMTP_PASS", ""),
  verificationTokenTtlMinutes: intOpt("VERIFICATION_TOKEN_TTL_MINUTES", 15),
  verificationResendCooldownSeconds: intOpt("VERIFICATION_RESEND_COOLDOWN_SECONDS", 60),
  verificationMaxAttemptsPerWindow: intOpt("VERIFICATION_MAX_ATTEMPTS_PER_WINDOW", 5),
  verificationRateWindowMinutes: intOpt("VERIFICATION_RATE_WINDOW_MINUTES", 60),

  // T14a — Moderation Gateway. Deliberately DEFAULTS TO EMPTY.
  //
  // Empty means "no provider configured", which resolves to the hold-all adapter:
  // every UGC item is held `pending` and nothing publishes. That is not a placeholder
  // to be filled in before this code is safe to run — it is R6's fail-closed posture
  // (TRD §8, apis[A7] errors) taking its normal path with an unreachable provider.
  // T14b (M6) sets these once T54 picks the vendors; until then the safe value is "".
  moderationProvider: optional("MODERATION_PROVIDER", ""),
  moderationProviderTier2: optional("MODERATION_PROVIDER_TIER2", ""),
  moderationTimeoutMs: intOpt("MODERATION_TIMEOUT_MS", 5_000),
  // Bounded backoff, then auto-route to the Human Escalation Queue — never publish,
  // never drop (TRD apis[A7] failure posture; plan §5 external-signal rule).
  moderationMaxAttempts: intOpt("MODERATION_MAX_ATTEMPTS", 5),
  moderationRetryBackoffSeconds: intOpt("MODERATION_RETRY_BACKOFF_SECONDS", 30),
  moderationRetryIntervalSeconds: intOpt("MODERATION_RETRY_INTERVAL_SECONDS", 60),
} as const;

export type Config = typeof config;
