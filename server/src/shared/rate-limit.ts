import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config/index.js";
import { errors } from "./error-envelope.js";

/**
 * Caller-scoped rate limiting (SEC-004 / SEC-007).
 *
 * The existing per-email cooldown in `identity.service.ts` bounds what one ADDRESS can
 * do. It cannot see the attack it was never shaped for: one caller cycling through
 * thousands of addresses, each of which looks like a first-time signup. That path sends
 * unbounded outbound mail on your SMTP credentials — cost, deliverability reputation,
 * and a spam cannon pointed at a campus — and it also lets an attacker spread OTP guesses
 * across many accounts to stay under any per-account cap.
 *
 * ## Why in-memory
 *
 * A shared store (Redis) would be the textbook answer, and it is the right answer at
 * multiple instances. The TRD deliberately admits no second datastore at v1 scale
 * (§stack: "no separate search engine, push service, or cache"), and a per-instance limit
 * is strictly better than the current zero. The tradeoff is written into
 * `docs/BUILD-NOTES.md` rather than left implicit: **at N instances the effective limit
 * is N × the configured value.** Revisit when the deployment stops being single-instance.
 *
 * ## Why the key is hashed
 *
 * A client IP is personal data under DPDP and a deanonymisation vector against a product
 * whose entire promise is that a post cannot be traced to a student (the same reasoning
 * that put `req.remoteAddress` in the log redact list, PRV-5). Buckets are keyed by a
 * truncated HMAC of the address under a per-process salt, so the table cannot be read
 * back into a list of who visited. The salt is regenerated on restart because these
 * buckets are not meant to outlive the process.
 */

const SALT = crypto.randomBytes(32);

function bucketKey(scope: string, caller: string): string {
  return crypto.createHmac("sha256", SALT).update(`${scope}:${caller}`).digest("base64url").slice(0, 22);
}

interface Window {
  count: number;
  resetAt: number;
}

export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly scope: string,
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true when the call is allowed, false when the caller is over budget. */
  check(caller: string, now: number = Date.now()): boolean {
    this.sweep(now);
    const key = bucketKey(this.scope, caller);
    const existing = this.windows.get(key);

    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    existing.count += 1;
    return existing.count <= this.limit;
  }

  /**
   * Drop expired windows. Without this the map is an unbounded memory leak keyed by
   * attacker-controlled input — a rate limiter that can be used to exhaust memory is a
   * denial-of-service tool rather than a defence against one.
   */
  private sweep(now: number): void {
    if (this.windows.size < 1_000) return;
    for (const [key, win] of this.windows) {
      if (win.resetAt <= now) this.windows.delete(key);
    }
  }

  /** Test seam: forget all buckets. */
  reset(): void {
    this.windows.clear();
  }
}

/**
 * Identifies the caller for limiting purposes.
 *
 * `req.ip` is only trustworthy when Express knows how many proxies sit in front of it.
 * Behind a load balancer with `trust proxy` unset, every request reports the proxy's
 * address, all callers share one bucket, and the limiter locks out the entire campus at
 * once — a self-inflicted outage. `TRUST_PROXY` must therefore be set to match the real
 * deployment; see `.env.example`.
 */
export function callerOf(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/** Express middleware wrapper. Over-budget callers get the standard 429 envelope. */
export function rateLimit(limiter: FixedWindowLimiter) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (limiter.check(callerOf(req))) return next();
    next(errors.rateLimited("Too many attempts from this device. Please try again later."));
  };
}

const MINUTE = 60_000;

/**
 * A1 initiate. The tightest budget: every allowed call sends an email, so this bounds
 * real-world cost and the campus's exposure to a mail flood.
 */
export const initiateLimiter = new FixedWindowLimiter(
  "verification.initiate",
  config.rateLimitInitiatePerHour,
  60 * MINUTE,
);

/**
 * A2 confirm. The per-token guess budget (SEC-004) already bounds guessing against ONE
 * account; this bounds a caller spreading guesses across MANY accounts to stay under it.
 * Looser than initiate because a legitimate user mistypes, and a wrong guess costs the
 * service nothing.
 */
export const confirmLimiter = new FixedWindowLimiter(
  "verification.confirm",
  config.rateLimitConfirmPerHour,
  60 * MINUTE,
);

/** A12 event ingest — unauthenticated, so it needs a ceiling of its own (PRV-7). */
export const eventsLimiter = new FixedWindowLimiter(
  "analytics.events",
  config.rateLimitEventsPerHour,
  60 * MINUTE,
);

/**
 * `POST /session/exchange` (SEC-023, found by the T62 gate).
 *
 * This route runs BEFORE `requireSession` by definition — a bootstrap token is the
 * credential it accepts — so it was the last credential-handling endpoint in the app with
 * no ceiling at all. Bucketed by address like the other two pre-session routes, because
 * there is no authenticated caller here to bucket by.
 *
 * What the budget is actually for, since a forged bootstrap token is not the threat: the
 * signature is HMAC-SHA256 and is not guessable, so this does not exist to stop brute
 * force. It exists because every allowed call does a database read (`findProfileById`) on
 * an unauthenticated path, which makes an unbounded route a free amplifier against
 * Postgres — the same shape as A12, which is why the ceiling is the same order.
 *
 * Looser than initiate (10/hr): a real student exchanges once per sign-in, but a flaky
 * connection retrying a failed exchange must not lock them out of their own account, and
 * unlike initiate an allowed call here costs no outbound email.
 */
export const exchangeLimiter = new FixedWindowLimiter(
  "session.exchange",
  config.rateLimitExchangePerHour,
  60 * MINUTE,
);

/**
 * A8 report intake (T34). Bucketed by PROFILE, not by address — see `rateLimitByProfile`.
 * `[ASSUMPTION]`: no upstream figure exists. Loose enough that a student reporting a bad
 * thread is never stopped, tight enough that report-spam as a harassment tool is bounded.
 */
export const reportLimiter = new FixedWindowLimiter(
  "grievance.reports",
  config.rateLimitReportsPerHour,
  60 * MINUTE,
);

/**
 * Per-caller limiting for routes that run behind `requireSession`.
 *
 * Every limiter above buckets by address, because A1/A2/A12 have no authenticated caller to
 * bucket by. An authenticated route does — and using the address there is actively wrong: a
 * campus behind one NAT shares one address, so one abusive reporter would exhaust the budget
 * for everyone on the same network. That is the "lock out the entire campus" failure already
 * recorded against `TRUST_PROXY`, arriving by a second route.
 *
 * It does not weaken anonymity. The bucket key is an HMAC under `SALT`, which is regenerated
 * every restart and never persisted, so this table cannot be read back into a list of who
 * reported what — and an anonymous report's ROW still stores no reporter at all.
 *
 * Registered AFTER `requireSession` in the route chain, never before: without a profile there
 * is nothing to bucket by, and silently falling back to the address would reintroduce the
 * shared-bucket failure at the exact moment the middleware order was got wrong. It throws
 * instead.
 */
export function rateLimitByProfile(limiter: FixedWindowLimiter, message?: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const profileId = req.profile?.id;
    if (!profileId) {
      // A programming error (registered before requireSession), not user input.
      throw new Error("rateLimitByProfile must run after requireSession");
    }
    if (limiter.check(profileId)) return next();
    next(errors.rateLimited(message));
  };
}

/**
 * Clear every process-wide bucket.
 *
 * Called from the integration harness between tests: supertest sends every request from
 * one caller address, so without this a suite that signs in a handful of students burns
 * an hour's signup budget and the remaining tests fail on 429s unrelated to what they
 * assert. Resetting keeps the suite running against the PRODUCTION ceilings rather than
 * relaxing them under NODE_ENV=test, so a real flow that outgrows a limit fails a test
 * instead of surprising a student.
 */
export function resetRateLimiters(): void {
  for (const limiter of [
    initiateLimiter,
    confirmLimiter,
    eventsLimiter,
    reportLimiter,
    exchangeLimiter,
  ]) {
    limiter.reset();
  }
}
