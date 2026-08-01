-- Migration 007 — bound OTP guessing (SEC-004, security-gate-M1 HIGH).
--
-- `verification_attempt_count` already exists but counts SENDS, not GUESSES: A1's resend
-- cooldown increments it. Nothing counted confirm attempts, so A2 accepted unlimited
-- guesses against a 6-digit code — brute-forceable in minutes, which defeats the email
-- verification the entire identity model rests on.
--
-- Deliberately a separate column rather than reusing the send counter: they bound
-- different attacks (outbound mail abuse vs. credential guessing), have different
-- ceilings, and reset at different moments. Conflating them would mean a resend silently
-- restored guesses, or a wrong guess consumed a resend.

ALTER TABLE identity_account
    ADD COLUMN verification_confirm_attempt_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN identity_account.verification_confirm_attempt_count IS
    'Failed A2 confirm attempts against the CURRENT token (SEC-004). Reset when a new '
    'token is issued. At the ceiling the token is invalidated and a fresh one must be '
    'requested; A2 keeps returning the uniform token_invalid_or_expired either way, so '
    'lockout is not observable to an attacker.';
