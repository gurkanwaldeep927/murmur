-- Migration 003 — reputation ledger + ban records (plan T21)
-- Tables: ban_record, reputation_event
-- Source: docs/05-schema.md §3.6/§3.8 (fields), §4 (frozen DDL), §5 (indexes). No field
-- invented here.
--
-- Enum scope note: §4 declares all 12 enums in one block; each migration introduces only
-- the enums its own tables use (001 took verification_status/profile_status, 002 the three
-- moderation enums). 003 takes reputation_event_type.
--
-- ---------------------------------------------------------------------------------------
-- FILE NUMBER vs APPLY ORDER — read this before assuming they are the same thing.
--
-- Migrations 006, 007 and 008 are already applied on the live database; 003 is only now
-- being written, because the plan's numbering follows the milestone the tables belong to,
-- not the order tasks happened to be built in. The runner tracks applied versions
-- individually and rolls back by applied_at, so this is supported — but it means this file
-- runs in TWO different positions and must be correct in both:
--
--   fresh database  : 001, 002, 003, 006, 007, 008   (003 before the RLS migration)
--   live database   : ... 006, 007, 008, then 003    (003 after the RLS migration)
--
-- That is why the hardening block at the bottom exists rather than being left to 008. On a
-- fresh database 008's catalogue loop would cover these two tables anyway; on the live
-- database 008 has already run and will never see them. Doing it here is the only shape
-- that is right in both orders — and getting it wrong would leave exactly the SEC-003 hole
-- 008 was written to close, on the two tables that decide who is banned.

-- Enum used by migration 003 (§4).
CREATE TYPE reputation_event_type_enum AS ENUM ('upvote', 'accepted_answer', 'violation_penalty');

-- ---------------------------------------------------------------------
-- ban_record — the permanent, email-hash-keyed ban ledger.
--
-- Deliberately NOT foreign-keyed to identity_account or pseudonymous_profile (§3.8, and
-- schema §2's relationship map says so explicitly). A ban has to outlive the account that
-- earned it, and an FK is precisely the thing that would let deleting the account take the
-- ban with it — which is the currently-open SEC-016/PRV-2 defect this table exists to fix
-- at T24. The link is by email_hash, computed by the same T50 procedure A1, A2 and A11 all
-- call, so a normalisation difference cannot make a ban silently stop matching (RR-7).
--
-- No delete path, ever, by design (§6: "not a default — a requirement").
-- ---------------------------------------------------------------------
CREATE TABLE ban_record (
    id                               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email_hash                       text NOT NULL UNIQUE,
    ban_reason                       text NOT NULL,
    issued_at                        timestamptz NOT NULL DEFAULT now(),
    originating_moderation_case_id   uuid REFERENCES moderation_case(id),
    created_at                       timestamptz NOT NULL DEFAULT now(),
    updated_at                       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- reputation_event — append-only, server-authoritative ledger.
--
-- Never resolved via last-write-wins (§4a, TRD §3): an offline queued vote becomes a row
-- here only when the server processes it, so two devices voting concurrently produce two
-- ledger rows the duplicate-vote index adjudicates, never a lost update.
--
-- actor_profile_id is nullable on purpose: a violation_penalty is issued by the system and
-- has no peer actor (§3.6).
-- ---------------------------------------------------------------------
CREATE TABLE reputation_event (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type          reputation_event_type_enum NOT NULL,
    delta               integer NOT NULL,
    actor_profile_id    uuid REFERENCES pseudonymous_profile(id),
    subject_profile_id  uuid NOT NULL REFERENCES pseudonymous_profile(id),
    question_id         uuid REFERENCES question(id),
    answer_id           uuid REFERENCES answer(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_reputation_event_one_target
        CHECK (num_nonnulls(question_id, answer_id) = 1)
);

-- ---------------------------------------------------------------------
-- Indexes (§5)
--
-- The partial unique index is the duplicate-vote error contract from A6, enforced in the
-- one place a concurrent second request cannot slip past: two simultaneous upvotes from the
-- same actor on the same answer cannot both commit, whatever the application layer checked
-- first. Partial because only upvotes are once-per-actor — an accepted_answer or a
-- violation_penalty can legitimately repeat, and NULL actors (system penalties) are
-- excluded rather than colliding with each other.
-- ---------------------------------------------------------------------
CREATE INDEX idx_reputation_event_subject ON reputation_event (subject_profile_id);
CREATE UNIQUE INDEX uniq_reputation_event_actor_answer_upvote
    ON reputation_event (actor_profile_id, answer_id)
    WHERE event_type = 'upvote' AND answer_id IS NOT NULL AND actor_profile_id IS NOT NULL;

-- ban_record.email_hash's UNIQUE constraint provides the A11 lookup index implicitly (§5).

-- ---------------------------------------------------------------------
-- updated_at triggers (set_updated_at() created by migration 001)
--
-- reputation_event is append-only and should never fire this. It is attached anyway,
-- matching the frozen §4 DDL: if a future write does update a ledger row, updated_at
-- diverging from created_at is the evidence. Silence would not be.
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_ban_record_updated_at BEFORE UPDATE ON ban_record
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reputation_event_updated_at BEFORE UPDATE ON reputation_event
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Self-vote prevention (§4; API A6 errors[self-vote forbidden]).
-- Cannot be a CHECK constraint: it has to read another table.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_self_vote() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.event_type = 'upvote' AND NEW.answer_id IS NOT NULL THEN
        IF NEW.actor_profile_id = (SELECT author_profile_id FROM answer WHERE id = NEW.answer_id) THEN
            RAISE EXCEPTION 'self-vote forbidden';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_self_vote
    BEFORE INSERT ON reputation_event
    FOR EACH ROW EXECUTE FUNCTION prevent_self_vote();

-- ---------------------------------------------------------------------
-- Storage hardening for the two tables this migration creates (SEC-003).
--
-- See the apply-order note at the top: on the live database 008 has already run, so its
-- catalogue loop will never see these tables, and nothing else would enable RLS on them.
-- Written idempotently so it is also harmless in the fresh-database order, where 008 runs
-- afterwards and covers them a second time.
--
-- The role-existence guard is not padding: `anon` and `authenticated` are Supabase roles
-- and do not exist in the plain postgres:16 service CI runs against. An unguarded REVOKE
-- fails there and takes the whole migration step down.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    role_name text;
BEGIN
    ALTER TABLE public.ban_record ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.reputation_event ENABLE ROW LEVEL SECURITY;

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('REVOKE ALL ON TABLE public.ban_record FROM %I', role_name);
            EXECUTE format('REVOKE ALL ON TABLE public.reputation_event FROM %I', role_name);
        END IF;
    END LOOP;
END $$;
