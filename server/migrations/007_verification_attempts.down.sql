-- Rollback of migration 007.
ALTER TABLE identity_account
    DROP COLUMN IF EXISTS verification_confirm_attempt_count;
