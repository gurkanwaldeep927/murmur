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

/**
 * SEC-011 — the key behind `shared/email-encryption.ts`.
 *
 * The finding: this was a bare `optional("EMAIL_ENCRYPTION_KEY", "")`, and
 * `encryptEmail()` returns `null` when the key is absent. So a real deployment that never
 * set the variable stored nothing where an encrypted address was supposed to go, while
 * every document, comment and schema note went on saying the address was encrypted at
 * rest. Nothing anywhere said otherwise — no warning, no failure, no empty-column check.
 *
 * The honest scope: `decryptEmail()` has no callers today, so what this closes is a false
 * claim rather than a live leak. It becomes a live defect the moment S2 resend or
 * manual-fallback review reads the column and finds it empty for every account created
 * while the variable was unset — silently, and unrecoverably, since the plaintext is gone.
 *
 * Third instance of the same remedy in this file (the email pepper, the console mailer,
 * now this): outside a developer's laptop, a missing security control refuses to boot.
 * Development and test keep the no-op path so the spine runs with no key at all.
 *
 * The length is validated HERE rather than on first use, so a mistyped key fails at
 * startup instead of during a student's first sign-up.
 */
function emailEncryptionKey(): string {
  const raw = process.env.EMAIL_ENCRYPTION_KEY?.trim() ?? "";
  const env = process.env.NODE_ENV ?? "development";

  if (raw === "") {
    if (env === "development" || env === "test") return "";
    throw new Error(
      `EMAIL_ENCRYPTION_KEY is not set and NODE_ENV='${env}'. Without it, email ` +
        `encryption silently does nothing while everything claims it is on. Generate one:\n` +
        `  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\n` +
        `Refusing to start.`,
    );
  }

  // Buffer.from(..., "base64") DISCARDS characters outside the alphabet rather than
  // failing, so a typo would otherwise decode to a short key and be caught only by the
  // length check — or, at the wrong length, not at all. Check the shape too.
  const looksBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(raw);
  if (!looksBase64 || Buffer.from(raw, "base64").length !== 32) {
    throw new Error(
      `EMAIL_ENCRYPTION_KEY must be a base64-encoded 32-byte key (AES-256-GCM). ` +
        `Generate one:\n` +
        `  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\n` +
        `Refusing to start.`,
    );
  }
  return raw;
}

function intOpt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be an integer`);
  return n;
}

export type DatabaseSslMode = "disable" | "require" | "verify-full";

const SSL_MODES: readonly DatabaseSslMode[] = ["disable", "require", "verify-full"];

/**
 * SEC-002 — transport security for the Postgres connection.
 *
 * The M1 gate found `pool.ts` passing no `ssl` option and no `sslmode` in the DSN, so
 * node-postgres connected in cleartext. Every credential, every `email_hash` and every row
 * of question text crossed the public internet unencrypted to the managed host.
 *
 * `require` vs `verify-full` is the distinction worth holding on to: **`require` encrypts
 * but does not check who is on the other end**, so a machine-in-the-middle still works. It
 * exists here only as a documented escape hatch for a host whose certificate chain we
 * cannot verify yet — never as the default.
 *
 * The default is DERIVED and derived to fail safe: local hosts get `disable` (CI runs a
 * plain `postgres:16` service with no TLS at all, and a hard default would break it), every
 * other host gets `verify-full`. A remote database is therefore verified without anyone
 * remembering to set anything — the failure mode of a forgotten variable is "too strict",
 * not "silently cleartext".
 */
function databaseSslMode(url: string): DatabaseSslMode {
  // A `sslmode=` in the DSN would SILENTLY WIN over the `ssl` option pool.ts passes:
  // pg's ConnectionParameters merges `parse(connectionString)` on top of the explicit
  // config, and `?sslmode=require` parses to a truthy `{}`. Rather than let two settings
  // disagree with the invisible one winning, refuse to start and name the fix. (Verified
  // against pg 8.22.0 / pg-connection-string, not assumed.)
  if (/[?&]sslmode=/i.test(url)) {
    throw new Error(
      `DATABASE_URL carries an "sslmode=" parameter, which silently overrides the ssl ` +
        `setting this app configures. Remove it from the DSN and use DATABASE_SSL ` +
        `(${SSL_MODES.join(" | ")}) instead, so there is one source of truth.`,
    );
  }

  const explicit = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (explicit) {
    if (!SSL_MODES.includes(explicit as DatabaseSslMode)) {
      throw new Error(`DATABASE_SSL must be one of: ${SSL_MODES.join(", ")} (got "${explicit}")`);
    }
    return explicit as DatabaseSslMode;
  }

  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "verify-full"; // unparseable DSN: assume remote, fail safe
  }
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
  return isLocal ? "disable" : "verify-full";
}

const databaseUrl = required("DATABASE_URL");

export const config = {
  env: optional("NODE_ENV", "development"),
  port: intOpt("PORT", 4000),
  logLevel: optional("LOG_LEVEL", "info"),

  databaseUrl,
  databaseSsl: databaseSslMode(databaseUrl),
  // Path to a PEM CA bundle used to verify the database server under `verify-full`.
  // Needed whenever the host runs a private CA that is not in Node's default trust store —
  // Supabase does: the pooler chain is `*.pooler.supabase.com` <- `Supabase Intermediate
  // 2021 CA` <- `Supabase Root 2021 CA`, all self-signed by Supabase Inc, so Node rejects it
  // with SELF_SIGNED_CERT_IN_CHAIN. Download `prod-ca-2021.crt` from the Supabase dashboard
  // (Database Settings -> SSL Configuration) into server/certs/ and point this at it.
  //
  // It must come from the dashboard, NOT from the live connection: trusting a root handed
  // to you by the endpoint you are trying to authenticate is circular — a machine-in-the-
  // middle would simply present its own root and you would pin that.
  databaseSslCa: optional("DATABASE_SSL_CA", ""),

  // T50 — shared email-hash pepper (versioned for rotation, RR-13).
  emailHashPepperActive: requiredSecret("EMAIL_HASH_PEPPER_ACTIVE"),
  emailHashPepperRetired: optional("EMAIL_HASH_PEPPER_RETIRED", ""),
  // SEC-011 — see emailEncryptionKey() above: empty is a development-only state.
  emailEncryptionKey: emailEncryptionKey(),

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
  /**
   * SEC-004 — failed A2 guesses allowed against ONE token before it is burned. Distinct
   * from the send budget above: this bounds credential guessing, that bounds outbound
   * mail. At 5, a 6-digit code gives an attacker a 5-in-a-million shot per issued token
   * instead of unlimited tries.
   */
  verificationMaxConfirmAttempts: intOpt("VERIFICATION_MAX_CONFIRM_ATTEMPTS", 5),

  /**
   * SEC-007 — per-caller hourly ceilings (shared/rate-limit.ts). The per-email cooldown
   * above cannot see a caller cycling thousands of fresh addresses; these can.
   *
   * `trustProxy` matters as much as the numbers: behind a load balancer with it unset,
   * every request appears to come from the proxy, all callers share one bucket, and the
   * limiter locks out the whole campus. Set it to the number of proxies in front of the
   * app (or "true" if that is unknown and the hop is trusted).
   */
  rateLimitInitiatePerHour: intOpt("RATE_LIMIT_INITIATE_PER_HOUR", 10),
  rateLimitConfirmPerHour: intOpt("RATE_LIMIT_CONFIRM_PER_HOUR", 30),
  rateLimitEventsPerHour: intOpt("RATE_LIMIT_EVENTS_PER_HOUR", 300),
  trustProxy: optional("TRUST_PROXY", ""),

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
