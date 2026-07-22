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
} as const;
