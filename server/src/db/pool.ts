import pg from "pg";
import { config } from "../config/index.js";

/**
 * Single shared connection pool for the modular monolith. Modules never construct
 * their own pool — they receive a pool/client and own only their tables (architecture §2).
 */
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
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
