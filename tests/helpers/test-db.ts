import { pool } from "../../server/src/db/pool.js";
import { up } from "../../server/src/db/migrate.js";
import { resetRateLimiters } from "../../server/src/shared/rate-limit.js";

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
 * Covers migration 002's tables (T13), 003's (T21) and 005's (T33) as well; a table missing
 * from this list leaks rows between tests instead of failing loudly.
 *
 * `ban_record` has to be named explicitly and cannot be left to CASCADE: it deliberately
 * carries no foreign key to identity_account or pseudonymous_profile (schema §3.8 — a ban
 * must outlive the account that earned it), so truncating those two reaches everything
 * except the one table whose leftover row would refuse the next test's registration.
 */
export async function truncateAll(): Promise<void> {
  await assertDisposableDatabase();

  // Drain the fire-and-forget analytics writes first. They are allowed to land after the
  // response a test already waited on (A12), so without this a write in flight arrives after
  // the truncate and either fails its foreign key — silently, since `emit` swallows errors —
  // or leaves a row belonging to the previous test in the next test's table.
  const { settleEmits } = await import("../../server/src/modules/analytics/analytics.service.js");
  await settleEmits();

  await pool.query(`
    TRUNCATE grievance_audit_log, grievance_report, grievance_officer_contact,
             reputation_event, ban_record, moderation_case, content_draft, sync_queue_item,
             answer, question, analytics_event,
             pseudonymous_profile, identity_account RESTART IDENTITY CASCADE;
  `);
  // topic_tag is deliberately NOT truncated: migration 002 seeds it, and the seed is
  // reference data every content test depends on.

  // Per-test state that is NOT in the database (SEC-007). The rate limiters bucket by
  // caller address, and every supertest request arrives from the same one — so a suite
  // that signs several students in exhausts one hour's signup budget and the rest of the
  // file fails on 429s that have nothing to do with what it is testing.
  //
  // Resetting here rather than raising the ceilings under NODE_ENV=test is deliberate:
  // the limits the suite runs against stay the PRODUCTION numbers, so a future change
  // that makes a real flow exceed them fails a test instead of surprising a student.
  resetRateLimiters();
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

export { pool };
