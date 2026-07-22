-- Rollback of migration 001.
DROP TABLE IF EXISTS pseudonymous_profile;
DROP TABLE IF EXISTS identity_account;
DROP FUNCTION IF EXISTS set_updated_at();
DROP TYPE IF EXISTS profile_status_enum;
DROP TYPE IF EXISTS verification_status_enum;
-- pgcrypto extension is left in place (shared, harmless to retain).
