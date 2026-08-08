-- Migration 005 — grievance / takedown records (plan T33)
-- Tables: grievance_report, grievance_audit_log, grievance_officer_contact
-- Source: docs/05-schema.md §4 (frozen DDL), §5 (indexes). No field invented here.
--
-- Enum scope note: §4 declares all 12 enums in one block; each migration introduces only the
-- enums its own tables use. 005 takes the two grievance enums.
--
-- APPLY ORDER, same trap as 003: this file is numbered 005 but runs AFTER 006/007/008 on the
-- live database, because it was written later. Migration 008 (the SEC-003 hardening) sweeps
-- only the tables that exist when it runs, so it will never see these three. The hardening
-- block at the bottom is therefore carried here, idempotently, so it is correct whether 005
-- runs before 008 (fresh database) or after it (live). Getting this wrong would leave the
-- complaints table — the one holding reporters' words about other students — reachable
-- through a published API key.

CREATE TYPE grievance_status_enum AS ENUM ('open', 'resolved');
CREATE TYPE grievance_resolution_enum AS ENUM ('takedown', 'dismiss', 'escalate_further');

-- ---------------------------------------------------------------------
-- grievance_report — one ticket per report, with the legal clock attached.
--
-- `sla_breached` is a GENERATED column, not a flag someone sets. A breach is a fact about
-- two timestamps, and computing it in the database means no code path can forget to mark it,
-- and none can quietly un-mark it either. It is NULL-safe by construction: an unresolved
-- report is not breached, it is unfinished.
--
-- `reporter_profile_id` is nullable because a report may be anonymous (`is_anonymous`), which
-- is the point of having both columns: the flag says the reporter chose anonymity, the null
-- says there is nobody to tell. Storing a profile id alongside is_anonymous = true would make
-- the anonymity a UI convention rather than a property of the data.
-- ---------------------------------------------------------------------
CREATE TABLE grievance_report (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id           uuid REFERENCES question(id),
    answer_id             uuid REFERENCES answer(id),
    reason                text NOT NULL,
    reporter_profile_id   uuid REFERENCES pseudonymous_profile(id),
    is_anonymous          boolean NOT NULL DEFAULT false,
    status                grievance_status_enum NOT NULL DEFAULT 'open',
    sla_deadline          timestamptz NOT NULL,
    acknowledged_at       timestamptz,
    resolution_action     grievance_resolution_enum,
    resolution_notes      text,
    resolved_at           timestamptz,
    sla_breached          boolean GENERATED ALWAYS AS (
                               resolved_at IS NOT NULL AND resolved_at > sla_deadline
                           ) STORED,
    merged_into_report_id uuid REFERENCES grievance_report(id),
    moderation_case_id    uuid REFERENCES moderation_case(id),
    idempotency_key       uuid UNIQUE,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_grievance_report_one_target
        CHECK (num_nonnulls(question_id, answer_id) = 1)
);

-- ---------------------------------------------------------------------
-- grievance_audit_log — append-only record of every action taken on a ticket.
--
-- Being unable to show who did what and when is itself the compliance failure under IT Rules
-- 2021, so this table is not a convenience: it is half of what makes the takedown process
-- defensible. `actor_type` is CHECK-constrained rather than free text because 'operator' and
-- 'system' being distinguishable is the whole value of the log.
-- ---------------------------------------------------------------------
CREATE TABLE grievance_audit_log (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grievance_report_id   uuid NOT NULL REFERENCES grievance_report(id),
    actor_type            text NOT NULL CHECK (actor_type IN ('reporter', 'operator', 'system')),
    actor_profile_id      uuid REFERENCES pseudonymous_profile(id),
    action                text NOT NULL,
    notes                 text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- grievance_officer_contact — the published contact details IT Rules require.
--
-- `effective_from` rather than a single mutable row: who the officer was at the time a
-- complaint was handled is part of the record, and overwriting it would erase that.
-- Placeholder copy lives here until T42 lands the real details (launch-blocking, RR-15).
-- ---------------------------------------------------------------------
CREATE TABLE grievance_officer_contact (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    officer_name      text NOT NULL,
    contact_email     text NOT NULL,
    contact_phone     text,
    process_summary   text,
    effective_from    timestamptz NOT NULL DEFAULT now(),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Indexes (§5)
-- ---------------------------------------------------------------------
CREATE INDEX idx_grievance_report_status ON grievance_report (status);
CREATE INDEX idx_grievance_report_reporter ON grievance_report (reporter_profile_id);
CREATE INDEX idx_grievance_report_sla_deadline ON grievance_report (sla_deadline);
CREATE INDEX idx_grievance_audit_log_report ON grievance_audit_log (grievance_report_id);

-- ---------------------------------------------------------------------
-- updated_at triggers (set_updated_at() created by migration 001)
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_grievance_report_updated_at BEFORE UPDATE ON grievance_report
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_grievance_audit_log_updated_at BEFORE UPDATE ON grievance_audit_log
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_grievance_officer_contact_updated_at BEFORE UPDATE ON grievance_officer_contact
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Storage hardening for the three tables this migration creates (SEC-003).
-- See the apply-order note at the top. Same shape as migration 003's block.
-- The role guard is not padding: `anon` and `authenticated` are Supabase roles and do not
-- exist in the plain postgres:16 service CI runs against.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    role_name text;
    tbl       text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['grievance_report', 'grievance_audit_log', 'grievance_officer_contact']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
        FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
        LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
                EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tbl, role_name);
            END IF;
        END LOOP;
    END LOOP;
END $$;
