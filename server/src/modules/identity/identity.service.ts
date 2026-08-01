import { config } from "../../config/index.js";
import { pool, withTransaction } from "../../db/pool.js";
import { AppError } from "../../shared/error-envelope.js";
import {
  candidateHashes,
  hashNormalizedEmail,
  isCampusDomain,
  normalizeEmail,
} from "../../shared/email-identity.js";
import { encryptEmail } from "../../shared/email-encryption.js";
import { issueBootstrapToken } from "../../shared/session.js";
import { logger } from "../../shared/logger.js";
import { emit } from "../analytics/analytics.service.js";
import { createProfile, type PublicProfile } from "../profile/profile.repo.js";
import { emailProvider } from "../notification/email-provider.js";
import * as repo from "./identity.repo.js";
import { checkBanByNormalizedEmail } from "./ban-check.js";
import { parseEnrollmentYear } from "./year-parser.js";
import { generateOtp, hashToken, tokenExpiry, tokenMatches } from "./verification-token.js";
import { RegistrationEvents } from "./registration-events.js";

/**
 * Identity & Verification Service (TRD §4). Implements A1 (initiate) and A2 (confirm).
 * Raw email and hashes NEVER cross the response boundary (NFR identity non-disclosure);
 * service outputs contain only public profile fields + a session-bootstrap token.
 */

// ---------------------------------------------------------------------------
// A1 — Initiate Email Verification
// ---------------------------------------------------------------------------

export interface InitiateResult {
  status: "verification_pending";
  resendAvailableInSeconds: number;
}

export async function initiateVerification(rawEmail: string): Promise<InitiateResult> {
  const normalized = normalizeEmail(rawEmail);
  if (!normalized) {
    throw new AppError(400, "email_malformed", "That doesn't look like a valid email address.");
  }
  if (!isCampusDomain(normalized.domain)) {
    throw new AppError(
      403,
      "email_domain_refused",
      "Use your college email address to join.",
    );
  }

  // Write with the ACTIVE pepper; look up against active + retired (RR-13). An
  // active-only lookup would stop recognising existing accounts the instant the
  // pepper rotates, letting a registered student register again (RR-7).
  const emailHash = hashNormalizedEmail(normalized.normalized);
  const existing = await repo.findByAnyEmailHash(pool, candidateHashes(normalized.normalized));
  const otp = generateOtp();
  const tokenHash = hashToken(otp);
  const expiresAt = tokenExpiry();

  if (existing && existing.verification_status !== "pending") {
    // Verified or blocked account already exists for this email → refused (R1).
    throw new AppError(
      409,
      "email_already_registered",
      "This email is already registered.",
    );
  }

  if (existing) {
    // Resend path: enforce cooldown + rate window against the schema's own columns.
    const now = Date.now();
    const lastSent = existing.last_verification_sent_at?.getTime() ?? 0;
    const windowMs = config.verificationRateWindowMinutes * 60_000;
    const cooldownMs = config.verificationResendCooldownSeconds * 1000;
    const windowElapsed = now - lastSent > windowMs;

    if (!windowElapsed && existing.verification_attempt_count >= config.verificationMaxAttemptsPerWindow) {
      throw new AppError(429, "rate_limited", "Too many attempts. Please try again later.");
    }
    const sinceLast = now - lastSent;
    if (sinceLast < cooldownMs) {
      throw new AppError(
        429,
        "rate_limited",
        `Please wait before requesting another code.`,
      );
    }
    const nextCount = windowElapsed ? 1 : existing.verification_attempt_count + 1;
    await repo.reissueToken(pool, existing.id, tokenHash, expiresAt, nextCount);
    await deliverOrBlock(normalized.normalized, otp);
    emit({ eventType: RegistrationEvents.VERIFICATION_RESENT });
    return { status: "verification_pending", resendAvailableInSeconds: config.verificationResendCooldownSeconds };
  }

  // New account.
  await repo.createPending(pool, {
    emailHash,
    emailEncrypted: encryptEmail(normalized.normalized),
    tokenHash,
    tokenExpiresAt: expiresAt,
  });
  await deliverOrBlock(normalized.normalized, otp);
  emit({ eventType: RegistrationEvents.VERIFICATION_INITIATED });
  return { status: "verification_pending", resendAvailableInSeconds: config.verificationResendCooldownSeconds };
}

/**
 * Delivery must be confirmed (TRD §8): if the provider cannot confirm delivery,
 * registration is BLOCKED, never silently defaulted to unverified. We surface a
 * 502 so the client shows a "couldn't send — try resend" state rather than pretending
 * a code was sent.
 */
async function deliverOrBlock(normalizedEmail: string, otp: string): Promise<void> {
  try {
    await emailProvider.sendVerification(normalizedEmail, otp);
  } catch (err) {
    logger.error({ err }, "verification delivery unconfirmed — registration blocked");
    throw new AppError(
      502,
      "internal_error",
      "We couldn't send your verification code. Please try again.",
    );
  }
}

// ---------------------------------------------------------------------------
// A2 — Confirm Verification & Derive Year Badge
// ---------------------------------------------------------------------------

export type ConfirmResult =
  | { outcome: "verified"; profile: PublicProfile; sessionToken: string }
  | { outcome: "blocked_unparseable_year" }
  | { outcome: "refused_banned" };

/**
 * The single response A2 gives for every unusable-credential case: no account, wrong
 * code, expired code, already-consumed code, or guess budget exhausted. Keeping them
 * indistinguishable is the point — a distinct "too many attempts" reply would confirm
 * that an address is registered (the SEC-008 oracle) and tell an attacker exactly when
 * to rotate to a fresh code.
 */
function invalidToken(): AppError {
  return new AppError(400, "token_invalid_or_expired", "This code is invalid or has expired.");
}

export async function confirmVerification(rawEmail: string, otp: string): Promise<ConfirmResult> {
  const normalized = normalizeEmail(rawEmail);
  if (!normalized) {
    throw new AppError(400, "email_malformed", "That doesn't look like a valid email address.");
  }
  const hashes = candidateHashes(normalized.normalized);

  // SEC-004. Credential checking happens BEFORE the transaction opens, because a failed
  // guess must be *recorded* and the invalid-token throw rolls the transaction back —
  // an increment inside it would be discarded and the cap would never engage.
  //
  // Rotation-safe (RR-13) — see the note in initiateVerification. A2 only reads the
  // account here, so it needs no active-pepper hash of its own.
  //
  // Deliberately NOT done here: lazily re-hashing a matched `v1$…` row up to the active
  // pepper. That is how a dual-hash rollout converges so the retired pepper can
  // eventually be dropped, but the rollout thresholds are human-owned and unfilled
  // (T72, runbooks/pepper-rotation.md). Until they are, every row stays readable via
  // candidateHashes and nothing is lost by waiting.
  const account = await repo.findByAnyEmailHash(pool, hashes);
  if (!account || account.verification_status !== "pending") throw invalidToken();

  // Budget already spent on an earlier request: the token should be gone, but clear it
  // again rather than trusting that it was — this is the branch that must not be
  // bypassable.
  if (account.verification_confirm_attempt_count >= config.verificationMaxConfirmAttempts) {
    await repo.invalidateVerificationToken(pool, account.id);
    throw invalidToken();
  }

  const expired =
    !account.verification_token_expires_at ||
    account.verification_token_expires_at.getTime() < Date.now();

  if (expired || !tokenMatches(otp, account.verification_token_hash)) {
    const failures = await repo.recordConfirmFailure(pool, account.id);
    if (failures >= config.verificationMaxConfirmAttempts) {
      // Burn the token, not the account: the user can still request a fresh code, but
      // the value the attacker was grinding against no longer exists.
      await repo.invalidateVerificationToken(pool, account.id);
      emit({ eventType: RegistrationEvents.VERIFICATION_ATTEMPTS_EXHAUSTED });
      logger.warn(
        { accountId: account.id, failures },
        "verification guess budget exhausted — token invalidated (SEC-004)",
      );
    }
    throw invalidToken();
  }

  return withTransaction(async (client) => {
    // Re-read inside the transaction: the checks above ran on a separate connection, so
    // this is what makes two concurrent confirms of the same valid code produce one
    // verified account rather than two profiles.
    const fresh = await repo.findByAnyEmailHash(client, hashes);
    if (!fresh || fresh.verification_status !== "pending") throw invalidToken();

    // A11 ban enforcement check (mechanism live from M1; real matches once ban_record lands, M3).
    const ban = await checkBanByNormalizedEmail(client, normalized.normalized);
    if (ban.banned) {
      emit({ eventType: RegistrationEvents.REGISTRATION_REFUSED_BANNED });
      return { outcome: "refused_banned" };
    }

    // Derive the year badge — block, never guess (R1 AC2).
    const parsed = parseEnrollmentYear(normalized);
    if (parsed.year === null) {
      await repo.markBlockedUnparseable(client, fresh.id);
      emit({
        eventType: RegistrationEvents.VERIFICATION_BLOCKED_YEAR,
        metadata: { noRuleForDomain: parsed.noRuleForDomain },
      });
      return { outcome: "blocked_unparseable_year" };
    }

    await repo.markVerified(client, fresh.id, parsed.year);
    const profile = await createProfile(client, fresh.id, String(parsed.year));
    emit({ eventType: RegistrationEvents.VERIFICATION_CONFIRMED, actorProfileId: profile.id });
    emit({ eventType: RegistrationEvents.ACTIVATED, actorProfileId: profile.id });
    // 15-minute bootstrap credential, not the session itself: the client trades it at
    // POST /session/exchange (T12, decisions/oq-14-session-mechanism.md §2). The field
    // name is T8's and stays as-is so the A2 response shape never changed.
    const sessionToken = issueBootstrapToken(profile.id);
    return { outcome: "verified", profile, sessionToken };
  });
}
