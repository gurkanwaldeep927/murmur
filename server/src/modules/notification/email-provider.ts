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
  /**
   * A plain operational notice to a named recipient — T38's grievance-SLA alerts are the
   * first caller. Separate from `sendVerification` rather than a generalisation of it,
   * because the two have opposite content rules: a verification mail necessarily carries a
   * secret to one student, while a notice must carry NO student's identity and no reported
   * content at all (it goes to an operator's mailbox, which is a place things get forwarded
   * from). Keeping them apart is what stops a future edit routing one through the other.
   */
  sendNotice(to: string, subject: string, body: string): Promise<void>;
}

/**
 * Environments in which an adapter that does not really deliver mail is acceptable.
 * Anything else — production, staging, or an unrecognised value — must fail loudly at
 * boot rather than quietly, because both non-delivering adapters break registration in
 * their own way: `console` prints the OTP to stdout, `memory` drops it entirely.
 */
const NON_DELIVERING_OK = new Set(["development", "test"]);

function refuseOutsideDev(name: string): void {
  if (NON_DELIVERING_OK.has(config.env)) return;
  throw new Error(
    `EMAIL_PROVIDER='${name}' does not deliver real email and must not run with ` +
      `NODE_ENV='${config.env}'. Set EMAIL_PROVIDER=smtp (with SMTP_HOST/SMTP_USER/SMTP_PASS) ` +
      `or implement a real adapter.`,
  );
}

/**
 * PRV-6 (fixed 2026-08-02). This adapter writes the student's RAW email address and their
 * LIVE one-time code to stdout, bypassing pino's redaction entirely — and it was the
 * default (`EMAIL_PROVIDER` defaults to `console`), so a production deploy that simply
 * forgot to set the variable would have printed every student's identity and login code
 * into its log aggregator. Against a product whose whole promise is anonymity, that is
 * the single worst thing a default could do.
 *
 * A comment saying "never do this in prod" did not prevent the equivalent mistake with
 * the email pepper (OQ-SEC-01); refusing to boot did. Same remedy here.
 */
class ConsoleEmailProvider implements EmailProvider {
  constructor() {
    refuseOutsideDev("console");
  }
  async sendVerification(to: string, token: string): Promise<void> {
    // Dev only, and now enforced by the constructor above rather than by convention.
    // eslint-disable-next-line no-console
    console.log(`[email:console] verification token for ${to}: ${token}`);
  }
  async sendNotice(to: string, subject: string, body: string): Promise<void> {
    // Safe to print in a way the verification path is not: a notice carries no student
    // identity and no reported content by contract (see the interface).
    // eslint-disable-next-line no-console
    console.log(`[email:console] notice to ${to}: ${subject}
${body}`);
  }
}

/**
 * In-memory provider for integration/NFR tests (EMAIL_PROVIDER=memory). Captures the
 * last OTP per address so tests can drive the full A2 verified path without a real
 * inbox. Never selected in production paths (guarded by the env switch below).
 */
class MemoryEmailProvider implements EmailProvider {
  private readonly lastByAddress = new Map<string, string>();
  constructor() {
    // Not a leak, but a silent failure: in production this accepts every send and
    // delivers nothing, so registration appears to work and no code ever arrives.
    refuseOutsideDev("memory");
  }
  async sendVerification(to: string, token: string): Promise<void> {
    this.lastByAddress.set(to.toLowerCase(), token);
  }
  lastToken(to: string): string | undefined {
    return this.lastByAddress.get(to.toLowerCase());
  }

  /**
   * Every notice sent, in order. Kept in full rather than last-only because T38's tests
   * assert on the BODY — specifically that no reporter and no reported text appears in it.
   * A "was something sent?" boolean would pass while leaking.
   */
  private readonly notices: { to: string; subject: string; body: string }[] = [];
  async sendNotice(to: string, subject: string, body: string): Promise<void> {
    this.notices.push({ to, subject, body });
  }
  sentNotices(): readonly { to: string; subject: string; body: string }[] {
    return this.notices;
  }
  clearNotices(): void {
    this.notices.length = 0;
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
    throw this.unimplemented();
  }
  async sendNotice(): Promise<void> {
    throw this.unimplemented();
  }
  private unimplemented(): Error {
    return new Error(
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

  async sendNotice(to: string, subject: string, body: string): Promise<void> {
    await this.transporter.sendMail({ from: config.emailFrom, to, subject, text: body });
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

  /**
   * Same retry shape, and the throw at the end matters as much here as it does above: T38
   * records "the operator was alerted" in the audit log only after this resolves. Swallowing
   * a failed send would write a compliance record saying someone was told, when nobody was.
   */
  async sendNotice(to: string, subject: string, body: string): Promise<void> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        await this.inner.sendNotice(to, subject, body);
        return;
      } catch (err) {
        lastErr = err;
        // The subject is safe to log; the body is not logged even though it carries no
        // identity by contract, because a log line is the wrong place to re-assert that.
        logger.warn({ attempt, maxAttempts: this.maxAttempts, subject }, "notice delivery failed");
        if (attempt < this.maxAttempts) await sleep(this.baseDelayMs * 2 ** (attempt - 1));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("notice delivery unconfirmed");
  }
}

export const emailProvider: EmailProvider = new RetryingEmailProvider();
