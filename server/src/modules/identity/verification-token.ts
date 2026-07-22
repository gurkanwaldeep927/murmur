import crypto from "node:crypto";
import { config } from "../../config/index.js";

/**
 * Verification OTP generation + hashing. The raw 6-digit OTP is delivered by email
 * (T5) and never persisted; only its hash is stored (identity_account.verification_token_hash).
 */

export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashToken(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

/** Constant-time comparison of a submitted OTP against a stored hash. */
export function tokenMatches(submitted: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const submittedHash = hashToken(submitted);
  const a = Buffer.from(submittedHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function tokenExpiry(): Date {
  return new Date(Date.now() + config.verificationTokenTtlMinutes * 60_000);
}
