import { readFileSync } from "node:fs";
import pg from "pg";
import { config } from "../config/index.js";

/**
 * Single shared connection pool for the modular monolith. Modules never construct
 * their own pool — they receive a pool/client and own only their tables (architecture §2).
 */
/**
 * SEC-002 — the `ssl` value node-postgres actually receives.
 *
 * `require` deliberately maps to `rejectUnauthorized: false`: it encrypts the channel but
 * accepts any certificate, so it stops passive sniffing and NOT an active
 * machine-in-the-middle. That is why `config.databaseSsl` never defaults to it — see the
 * reasoning in `config/index.ts`.
 *
 * This option survives the `connectionString` alongside it only because the DSN is
 * guaranteed to carry no `sslmode=` (config refuses to start otherwise). Verified against
 * pg 8.22.0: with no `sslmode` in the DSN, the explicit option is what reaches the socket.
 */
function sslConfig(): pg.PoolConfig["ssl"] {
  switch (config.databaseSsl) {
    case "disable":
      return false;
    case "require":
      return { rejectUnauthorized: false };
    case "verify-full":
      return {
        rejectUnauthorized: true,
        // Empty string -> undefined, so Node falls back to its built-in trust store.
        // Read eagerly at startup: a missing or unreadable CA file must fail loudly here,
        // not on the first query under load.
        ca: config.databaseSslCa ? readFileSync(config.databaseSslCa, "utf8") : undefined,
      };
  }
}

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: sslConfig(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export type DbPool = pg.Pool;
export type DbClient = pg.PoolClient;

/**
 * Anything that can run a query — the pool itself or a transaction's client. Repo
 * functions that do a single read take this so callers outside a transaction (e.g.
 * the requireSession middleware) can pass the pool directly.
 */
export type Queryable = Pick<DbClient, "query">;

/** Run a function inside a transaction, rolling back on any error. */
export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
