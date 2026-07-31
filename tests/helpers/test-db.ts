import { pool } from "../../server/src/db/pool.js";
import { up } from "../../server/src/db/migrate.js";

/**
 * Integration/NFR test harness. Requires a reachable Postgres via DATABASE_URL
 * (point it at a disposable test database). Applies all migrations once, and exposes
 * a truncate helper so each test starts clean.
 *
 * Tests that need a DB call `requireDb()` in a beforeAll; if the DB is unreachable the
 * suite fails loudly rather than passing vacuously — an NFR that "anonymity is the
 * product" must never be a silent skip in CI (docs/07-plan.md §5).
 */

export async function migrateTestDb(): Promise<void> {
  await up();
}

/**
 * Refuse to run destructively against a database that looks real.
 *
 * Two ways to opt in, in order of preference:
 *
 * 1. The database NAME contains `test` (CI's `murmur_test`). Self-evident and needs no
 *    configuration.
 * 2. `MURMUR_TEST_DB_ALLOW` names the exact `host/database` this suite may destroy, and
 *    it must match the live connection.
 *
 * Route 2 exists because managed Postgres often denies you route 1: every Supabase
 * database is named `postgres`, so the name check can never pass there no matter how
 * disposable the project actually is.
 *
 * It deliberately names a specific connection rather than being a blanket on/off switch.
 * The previous `MURMUR_TEST_DB_CONFIRM=i-am-disposable` unlocked *whatever* DATABASE_URL
 * happened to be set — so a variable exported for a test run at 1am, still live in the
 * shell when DATABASE_URL was later pointed at production, would silently authorise
 * TRUNCATE against real user data. Pinning host+database means a stale variable stops
 * matching the moment you point somewhere else, and the guard closes again by itself.
 * (Security gate finding SEC-017: "destructive test guard is a naming heuristic".)
 *
 * This is a guard, not a convenience: it fails the suite loudly rather than skipping.
 */
async function assertDisposableDatabase(): Promise<void> {
  const { rows } = await pool.query<{ db: string }>(`SELECT current_database() AS db`);
  const db = rows[0]!.db.toLowerCase();

  if (db.includes("test")) return;

  const host = new URL(process.env.DATABASE_URL ?? "postgres://unknown/").hostname;
  const fingerprint = `${host}/${db}`;
  const allowed = process.env.MURMUR_TEST_DB_ALLOW?.trim().toLowerCase();

  if (allowed === fingerprint) return;

  throw new Error(
    `Refusing to TRUNCATE "${fingerprint}": it is not marked disposable.\n` +
      `These suites destroy every row in every table.\n\n` +
      `If this database IS disposable, authorise this exact connection:\n` +
      `  MURMUR_TEST_DB_ALLOW=${fingerprint}\n\n` +
      (allowed
        ? `MURMUR_TEST_DB_ALLOW is currently set to "${allowed}", which does not match. ` +
          `Check DATABASE_URL — it may be pointing somewhere you did not intend.`
        : `Preferred alternative: use a database whose name contains "test".`),
  );
}

/**
 * DESTRUCTIVE — point DATABASE_URL at a disposable database before calling this.
 * Covers migration 002's tables (T13) as well; a table missing from this list leaks
 * rows between tests instead of failing loudly.
 */
export async function truncateAll(): Promise<void> {
  await assertDisposableDatabase();
  await pool.query(`
    TRUNCATE moderation_case, answer, question, analytics_event,
             pseudonymous_profile, identity_account RESTART IDENTITY CASCADE;
  `);
  // topic_tag is deliberately NOT truncated: migration 002 seeds it, and the seed is
  // reference data every content test depends on.
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

export { pool };
