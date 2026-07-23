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
  emailHashPepperActive: required("EMAIL_HASH_PEPPER_ACTIVE"),
  emailHashPepperRetired: optional("EMAIL_HASH_PEPPER_RETIRED", ""),
  emailEncryptionKey: optional("EMAIL_ENCRYPTION_KEY", ""),

  // T12 — session signing (decisions/oq-14-session-mechanism.md §5). Versioned
  // `v<n>:<secret>` like the email pepper so keys rotate without logging users out.
  // Deliberately NOT the email-hash pepper: separate security domains.
  sessionSigningKey: required("SESSION_SIGNING_KEY"),
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
} as const;

export type Config = typeof config;
