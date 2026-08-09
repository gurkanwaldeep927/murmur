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
import { pathToFileURL } from "node:url";
import pg from "pg";
import { poolErrorFields } from "../server/src/db/pool-error-fields.js";

/**
 * The tables are read from the catalog, never listed here. TASK-STATUS problem #19.
 *
 * This file used to carry a hand-written list of eight names. By 9 August the migrations
 * created fourteen, and the seven it had missed included `grievance_report` and
 * `content_draft` — the complaints, and the drafts a student never published. The one
 * question this script exists to answer is "is this database safe to wipe?", and a stale
 * list answers it with a total that omits exactly the rows you would most regret wiping.
 *
 * A list that has to be updated by hand goes stale silently. This cannot.
 */
const LIST_TABLES_SQL = `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`;

/**
 * Build the script's pool, with the `error` listener attached.
 *
 * TASK-STATUS problem #4 fixed this on the service pool (`server/src/db/pool.ts`) on
 * 7 August and recorded that this script still had the same hole. This closes it.
 *
 * Two different failures come out of one missing listener. An idle client dying is routine
 * against a remote database, and with no listener Node's EventEmitter contract throws it as
 * an unhandled error — which `main().catch()` at the bottom of this file can never see,
 * because it is an event and not a rejection. The default reporter then serializes the whole
 * error, and a pg connection error references the `Client` that raised it, which holds the
 * password parsed out of `DATABASE_URL`. Observed in real output on 5 August.
 *
 * `poolErrorFields` copies two scalars out and is deliberately shared with the service pool
 * rather than duplicated here — see that module's own note.
 *
 * Exported so a test can assert the listener is registered. The defect was its absence, so
 * the assertion has to be on the registration itself, not only on behaviour.
 */
export function createInventoryPool(url: string): pg.Pool {
  const pool = new pg.Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 15_000 });
  pool.on("error", (err) => {
    // console, not pino: this is a hand-run script and it must not drag the service's
    // logger — and its config — into a diagnostic tool that has to run when things are broken.
    console.error("idle database client errored; discarded by the pool:", poolErrorFields(err));
  });
  return pool;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // Report which host we are pointed at, never the credentials.
  const parsed = new URL(url);
  console.log(`host : ${parsed.hostname}:${parsed.port || 5432}`);
  console.log(`db   : ${parsed.pathname.slice(1)}\n`);

  const pool = createInventoryPool(url);

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

    const { rows: tableRows } = await pool.query<{ table_name: string }>(LIST_TABLES_SQL);
    const tables = tableRows.map((r) => r.table_name);
    console.log(`${tables.length} table(s) in schema "public"\n`);

    let total = 0;
    console.log("table                          rows");
    console.log("-----------------------------------");
    for (const table of tables) {
      try {
        // The identifier now comes from a query rather than from a literal in this file,
        // so it is quoted rather than interpolated raw.
        const { rows } = await pool.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM ${pg.escapeIdentifier(table)}`,
        );
        const n = Number(rows[0]!.n);
        total += n;
        console.log(`${table.padEnd(29)} ${String(n).padStart(5)}`);
      } catch {
        // Reachable now only if the role may see the table in the catalog but not read it —
        // worth printing rather than swallowing, because an unreadable table is a table
        // whose contents this inventory cannot vouch for.
        console.log(`${table.padEnd(29)}     - (unreadable)`);
      }
    }
    console.log("-----------------------------------");
    console.log(`${"TOTAL".padEnd(29)} ${String(total).padStart(5)}\n`);

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

/**
 * Run only when invoked directly (`npm run db:inventory`), so that importing this module —
 * which the pool test does — never opens a connection to a real database.
 */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
