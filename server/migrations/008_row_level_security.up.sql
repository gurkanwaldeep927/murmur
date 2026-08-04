-- Migration 008 — close the default-open storage surface (SEC-003, security-gate-M1 HIGH).
--
-- WHAT WAS ACTUALLY WRONG, measured against the live database on 2026-08-04 rather than
-- inferred: every table in `public` carried
--     GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- to BOTH `anon` and `authenticated`. Those are the roles behind Supabase's PostgREST API,
-- and the `anon` key that assumes that role is published in client-side code by design.
-- So anyone holding a value the product intends to be public could read `identity_account`
-- (email_hash, email_encrypted, verification_token_hash), publish unmoderated rows straight
-- into `question`/`answer` past the T14a gateway, rewrite `moderation_case` verdicts, or
-- TRUNCATE the entire database. That is the whole anonymity promise (RR-7 / RR-13) and the
-- whole fail-closed moderation posture (R6), reachable without authenticating at all.
--
-- It was not something anyone wrote. `pg_default_acl` shows Supabase ships default
-- privileges granting ALL on tables/sequences/functions in `public` to anon, authenticated
-- and service_role — so every table any migration creates is auto-granted on creation. That
-- is why this file revokes the DEFAULT privileges too: without that, migrations 009+ silently
-- re-open the hole, and the next person to notice would be an attacker.
--
-- ---------------------------------------------------------------------------------------
-- DELIBERATE DEVIATION FROM THE GATE'S OWN fix_hint. security-gate-M1.json says
-- "ENABLE + FORCE ROW LEVEL SECURITY". We ENABLE. We do NOT force, and the difference is
-- the whole service:
--
--   FORCE ROW LEVEL SECURITY applies RLS to the TABLE OWNER as well. The app connects as
--   the owner and this schema defines ZERO policies, so under FORCE every query would
--   return zero rows — every feed empty, every signup failing to find its own account —
--   while /health still answered "ok". A silent, total outage that looks like a data
--   problem. Following the fix_hint literally would have shipped it.
--
-- ENABLE alone gives the property we actually want: the owner keeps working, and any OTHER
-- role is denied every row even if a GRANT somehow reappears. RLS is the second layer here;
-- the REVOKE below is the fix that does the real work.
--
-- Verified before writing this, not assumed: the connecting role is `postgres`, it owns all
-- eight tables, and it carries rolbypassrls = true. Two independent reasons the app cannot
-- be locked out by this migration.
--
-- `service_role` is deliberately left alone: it is the trusted server-side identity, its key
-- is a secret rather than a published one, and this app does not use it at all. Revoking it
-- would buy nothing and could break dashboard tooling.
--
-- Schema-level USAGE on `public` is also left alone. With zero table privileges and RLS on,
-- USAGE grants the ability to name a table and nothing else — and revoking it risks
-- Supabase-managed internals this project does not control.

DO $$
DECLARE
    tbl  record;
    role_name text;
BEGIN
    -- 1. RLS on every existing table. Iterated from the catalogue rather than a written-out
    --    list: a hardcoded list is a thing that goes stale in silence, which is the exact
    --    failure mode this project keeps paying for.
    FOR tbl IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.tablename);
    END LOOP;

    -- 2. Strip the grants, and the default that keeps re-issuing them.
    --
    --    The existence guard is not defensive padding: `anon` and `authenticated` are
    --    Supabase roles and DO NOT EXIST in the plain postgres:16 service CI runs against
    --    (.github/workflows/ci.yml). An unguarded REVOKE fails there with
    --    'role "anon" does not exist' and takes the whole migration step down with it.
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', role_name);
            EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name);
            EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', role_name);

            -- Applies to objects created by the CURRENT role (postgres) — which is the role
            -- migrations run as, and therefore the default ACL that governs every future table.
            EXECUTE format(
                'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', role_name);
            EXECUTE format(
                'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', role_name);
            EXECUTE format(
                'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', role_name);
        END IF;
    END LOOP;
END $$;
