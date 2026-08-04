-- Rollback of 008 — and a DELIBERATELY ASYMMETRIC one.
--
-- This disables RLS. It does NOT re-GRANT anything to `anon` or `authenticated`, and it does
-- not restore the default privileges that were handing those grants out.
--
-- A rollback exists so a broken migration can be undone. It does not exist to put a security
-- hole back. If `down` faithfully reversed 008, then any routine rollback — including the
-- `migrate:down && migrate` step CI runs on every push — would leave a window where every
-- table in the database was readable, writable and truncatable through a published key. The
-- reversal would be the vulnerability.
--
-- So the honest contract is: 008 is reversible in the sense that matters (whatever RLS broke,
-- stops being broken), and permanently one-way in the sense that protects users. If the
-- grants are ever genuinely wanted back, that is a new migration written on purpose, with a
-- reason attached — not a side effect of rolling something else back.
--
-- CI's apply/rollback check still passes: it verifies down-then-up runs cleanly, and it does.

DO $$
DECLARE
    tbl record;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl.tablename);
    END LOOP;
END $$;
