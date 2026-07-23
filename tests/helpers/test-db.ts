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
 * DESTRUCTIVE — point DATABASE_URL at a disposable database before calling this.
 * Covers migration 002's tables (T13) as well; a table missing from this list leaks
 * rows between tests instead of failing loudly.
 */
export async function truncateAll(): Promise<void> {
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
