/**
 * Registration + activation funnel event names (plan T45 hooks; PRD R8).
 * Centralized so the T46 metric-derivation audit (M6) has one canonical vocabulary.
 */
export const RegistrationEvents = {
  VERIFICATION_INITIATED: "registration.verification_initiated", // S1 → A1
  VERIFICATION_RESENT: "registration.verification_resent", // S2 resend
  VERIFICATION_CONFIRMED: "registration.verification_confirmed", // S3 → A2 success
  VERIFICATION_BLOCKED_YEAR: "registration.blocked_unparseable_year", // S4 blocked
  REGISTRATION_REFUSED_BANNED: "registration.refused_banned", // S4 refused
  ACTIVATED: "activation.profile_created", // first profile created
  /**
   * SEC-004: a token's guess budget was spent and the token was burned. Carries no actor
   * — the whole point is that an exhausted budget may well be an attacker, not the
   * account's owner. A rise here is the signal that someone is grinding OTPs.
   */
  VERIFICATION_ATTEMPTS_EXHAUSTED: "registration.verification_attempts_exhausted",
} as const;
