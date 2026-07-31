/**
 * Read-only database inventory.  `npm run db:inventory`
 *
 * Prints one row-count per table plus a small, non-identifying sample of each table's
 * shape, so a human can decide whether a database is safe to treat as disposable
 * *before* pointing the truncating suites at it (tests/helpers/test-db.ts).
 *
 * Strictly SELECT-only: no INSERT, UPDATE, DELETE, TRUNCATE or DDL. Safe to run
 * against any database, including one holding real data.
 *
 * Deliberately prints NO personal data — not email_hash, not email_encrypted, not
 * pseudonyms. Identity non-disclosure is the product's core NFR, and a diagnostic
 * script is not a licence to dump the one table the whole design protects.
 */
import "dotenv/config";
import pg from "pg";

const TABLES = [
  "identity_account",
  "pseudonymous_profile",
  "question",
  "answer",
  "moderation_case",
  "topic_tag",
  "analytics_event",
  "schema_migrations",
] as const;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // Report which host we are pointed at, never the credentials.
  const parsed = new URL(url);
  console.log(`host : ${parsed.hostname}:${parsed.port || 5432}`);
  console.log(`db   : ${parsed.pathname.slice(1)}\n`);

  const pool = new pg.Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 15_000 });

  try {
    const { rows: nameRows } = await pool.query<{ db: string }>(
      `SELECT current_database() AS db`,
    );
    const dbName = nameRows[0]!.db;

    console.log(`current_database() = "${dbName}"`);
    console.log(
      dbName.toLowerCase().includes("test")
        ? `  -> truncation guard: PASSES (name contains "test")\n`
        : `  -> truncation guard: BLOCKS (name lacks "test"); destructive suites will refuse\n`,
    );

    let total = 0;
    console.log("table                     rows");
    console.log("------------------------------");
    for (const table of TABLES) {
      try {
        const { rows } = await pool.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM ${table}`,
        );
        const n = Number(rows[0]!.n);
        total += n;
        console.log(`${table.padEnd(24)} ${String(n).padStart(5)}`);
      } catch {
        console.log(`${table.padEnd(24)}     - (absent)`);
      }
    }
    console.log("------------------------------");
    console.log(`${"TOTAL".padEnd(24)} ${String(total).padStart(5)}\n`);

    // Timestamps only — enough to tell "seeded/test rows" from "organic traffic",
    // without revealing who anyone is.
    const { rows: span } = await pool.query<{ earliest: string | null; latest: string | null }>(
      `SELECT min(created_at)::text AS earliest, max(created_at)::text AS latest
         FROM identity_account`,
    );
    if (span[0]?.earliest) {
      console.log(`identity_account created_at range:\n  earliest ${span[0].earliest}\n  latest   ${span[0].latest}`);
    } else {
      console.log("identity_account is empty.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
