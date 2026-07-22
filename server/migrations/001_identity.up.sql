-- Migration 001 — identity spine (plan T4)
-- Tables: identity_account, pseudonymous_profile
-- Source: docs/05-schema.md §3.2, §3.3 (frozen DDL). No field invented here.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- Enums used by migration 001 (the rest are introduced by their own migrations).
CREATE TYPE verification_status_enum AS ENUM ('pending', 'verified', 'blocked_unparseable_year');
CREATE TYPE profile_status_enum AS ENUM ('active', 'suspended', 'banned');

-- Shared updated_at maintenance function (append-only ledgers deliberately omit it).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- identity_account — verified, non-pseudonymous identity + DPDP-minimized ban material.
-- Never joined into any user-facing read path (NFR identity non-disclosure).
CREATE TABLE identity_account (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email_hash                      text NOT NULL UNIQUE,
    email_encrypted                 bytea,
    verification_status             verification_status_enum NOT NULL DEFAULT 'pending',
    derived_enrollment_year         integer,
    verification_token_hash         text,
    verification_token_expires_at   timestamptz,
    verification_attempt_count      integer NOT NULL DEFAULT 0,
    last_verification_sent_at       timestamptz,
    ban_status                      boolean NOT NULL DEFAULT false,
    deleted_at                      timestamptz,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_identity_year_positive
        CHECK (derived_enrollment_year IS NULL OR derived_enrollment_year > 0),
    CONSTRAINT chk_identity_verified_has_year
        CHECK (verification_status <> 'verified' OR derived_enrollment_year IS NOT NULL)
);

-- pseudonymous_profile — the persistent, user-facing identity; the only identity others see.
CREATE TABLE pseudonymous_profile (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_account_id  uuid NOT NULL UNIQUE REFERENCES identity_account(id),
    pseudonym            text NOT NULL UNIQUE,
    year_badge           text NOT NULL,
    reputation_score     integer NOT NULL DEFAULT 0,
    status               profile_status_enum NOT NULL DEFAULT 'active',
    deleted_at           timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_identity_account_updated_at BEFORE UPDATE ON identity_account
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pseudonymous_profile_updated_at BEFORE UPDATE ON pseudonymous_profile
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
