import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../../config/index.js";
import { logger } from "../../shared/logger.js";

/**
 * T5 — Email/OTP Delivery Provider integration (Notification Dispatcher, TRD §4/§8).
 *
 * Failure posture (TRD §8): retry with backoff on delivery failure; the caller
 * (A1) exposes a resend affordance; registration is BLOCKED, never silently
 * defaulted to unverified, if delivery cannot be confirmed. `sendVerification`
 * therefore returns success only when the provider confirmed acceptance.
 *
 * The default 'console' provider logs the token locally for dev. Real environments
 * plug an SMTP/provider adapter behind the same interface — no call site changes.
 */

export interface EmailProvider {
  /** Resolves on confirmed delivery; rejects if delivery could not be confirmed. */
  sendVerification(to: string, token: string): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async sendVerification(to: string, token: string): Promise<void> {
    // Dev only. The raw address is intentionally NOT structured-logged (it is passed
    // straight to the console line below and never persisted). Never do this in prod.
    // eslint-disable-next-line no-console
    console.log(`[email:console] verification token for ${to}: ${token}`);
  }
}

/**
 * In-memory provider for integration/NFR tests (EMAIL_PROVIDER=memory). Captures the
 * last OTP per address so tests can drive the full A2 verified path without a real
 * inbox. Never selected in production paths (guarded by the env switch below).
 */
class MemoryEmailProvider implements EmailProvider {
  private readonly lastByAddress = new Map<string, string>();
  async sendVerification(to: string, token: string): Promise<void> {
    this.lastByAddress.set(to.toLowerCase(), token);
  }
  lastToken(to: string): string | undefined {
    return this.lastByAddress.get(to.toLowerCase());
  }
}

/** Exposed so tests can read the captured OTP. Undefined unless EMAIL_PROVIDER=memory. */
export let memoryEmailProvider: MemoryEmailProvider | undefined;

/**
 * Placeholder for a real provider adapter (SMTP / transactional email API). Kept as
 * an explicit stub so the wiring is visible; a real environment supplies credentials
 * and this throws until implemented, forcing a deliberate choice rather than a silent
 * fall-through to console in production.
 */
class UnconfiguredProvider implements EmailProvider {
  constructor(private readonly name: string) {}
  async sendVerification(): Promise<void> {
    throw new Error(
      `EMAIL_PROVIDER='${this.name}' is not implemented yet. Configure a real adapter or use 'console' in dev.`,
    );
  }
}

/**
 * Real SMTP adapter (EMAIL_PROVIDER=smtp) via nodemailer. Works with Gmail SMTP
 * using a Google App Password (host smtp.gmail.com, port 465). Resolves only on
 * confirmed acceptance by the SMTP server; a rejection propagates so the retry
 * wrapper and, ultimately, A1 can block registration on unconfirmed delivery.
 */
class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;
  constructor() {
    if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
      throw new Error(
        "EMAIL_PROVIDER='smtp' requires SMTP_HOST, SMTP_USER and SMTP_PASS to be set.",
      );
    }
    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
  }

  async sendVerification(to: string, token: string): Promise<void> {
    await this.transporter.sendMail({
      from: config.emailFrom,
      to,
      subject: "Your Murmur verification code",
      text: `Your Murmur verification code is ${token}. It expires in ${config.verificationTokenTtlMinutes} minutes.`,
    });
  }
}

function baseProvider(): EmailProvider {
  switch (config.emailProvider) {
    case "console":
      return new ConsoleEmailProvider();
    case "memory": {
      memoryEmailProvider = new MemoryEmailProvider();
      return memoryEmailProvider;
    }
    case "smtp":
      return new SmtpEmailProvider();
    default:
      return new UnconfiguredProvider(config.emailProvider);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry-with-backoff wrapper so a transient provider hiccup does not block a legit user. */
export class RetryingEmailProvider implements EmailProvider {
  constructor(
    private readonly inner: EmailProvider = baseProvider(),
    private readonly maxAttempts = 3,
    private readonly baseDelayMs = 200,
  ) {}

  async sendVerification(to: string, token: string): Promise<void> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        await this.inner.sendVerification(to, token);
        return;
      } catch (err) {
        lastErr = err;
        logger.warn({ attempt, maxAttempts: this.maxAttempts }, "verification email delivery failed");
        if (attempt < this.maxAttempts) await sleep(this.baseDelayMs * 2 ** (attempt - 1));
      }
    }
    // Delivery unconfirmed after all retries — surface to caller so registration is BLOCKED.
    throw lastErr instanceof Error ? lastErr : new Error("verification email delivery unconfirmed");
  }
}

export const emailProvider: EmailProvider = new RetryingEmailProvider();
