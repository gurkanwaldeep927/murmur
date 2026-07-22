import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./pool.js";
import { logger } from "../shared/logger.js";

/**
 * Minimal, dependency-free SQL migration runner (plan T4).
 * Migrations live in server/migrations as paired files:
 *   NNN_name.up.sql   — forward migration
 *   NNN_name.down.sql — rollback (CI verifies apply + rollback, T3)
 * Applied migrations are recorded in schema_migrations. Each file runs inside a
 * transaction so a failed migration leaves no partial state.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

interface Migration {
  version: string; // e.g. "001"
  name: string; // e.g. "001_identity"
  upPath: string;
  downPath: string | null;
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      name       text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function loadMigrations(): Promise<Migration[]> {
  const files = await readdir(MIGRATIONS_DIR);
  const byBase = new Map<string, { up?: string; down?: string }>();
  for (const f of files) {
    const m = /^(\d{3}_[a-z0-9_]+)\.(up|down)\.sql$/.exec(f);
    if (!m) continue;
    const base = m[1]!;
    const kind = m[2]! as "up" | "down";
    const entry = byBase.get(base) ?? {};
    entry[kind] = path.join(MIGRATIONS_DIR, f);
    byBase.set(base, entry);
  }
  const migrations: Migration[] = [];
  for (const [base, entry] of byBase) {
    if (!entry.up) continue;
    migrations.push({
      version: base.slice(0, 3),
      name: base,
      upPath: entry.up,
      downPath: entry.down ?? null,
    });
  }
  migrations.sort((a, b) => a.version.localeCompare(b.version));
  return migrations;
}

async function appliedVersions(): Promise<Set<string>> {
  const { rows } = await pool.query<{ version: string }>("SELECT version FROM schema_migrations");
  return new Set(rows.map((r) => r.version));
}

export async function up(): Promise<void> {
  await ensureMigrationsTable();
  const migrations = await loadMigrations();
  const applied = await appliedVersions();
  let ran = 0;
  for (const mig of migrations) {
    if (applied.has(mig.version)) continue;
    const sql = await readFile(mig.upPath, "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [
        mig.version,
        mig.name,
      ]);
      await client.query("COMMIT");
      logger.info({ version: mig.version, name: mig.name }, "migration applied");
      ran++;
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error({ version: mig.version, err }, "migration failed — rolled back");
      throw err;
    } finally {
      client.release();
    }
  }
  logger.info({ ran }, ran === 0 ? "no pending migrations" : "migrations up to date");
}

export async function down(): Promise<void> {
  await ensureMigrationsTable();
  const migrations = await loadMigrations();
  const applied = await appliedVersions();
  const lastApplied = [...migrations].reverse().find((m) => applied.has(m.version));
  if (!lastApplied) {
    logger.info("nothing to roll back");
    return;
  }
  if (!lastApplied.downPath) {
    throw new Error(`Migration ${lastApplied.name} has no .down.sql — cannot roll back`);
  }
  const sql = await readFile(lastApplied.downPath, "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("DELETE FROM schema_migrations WHERE version = $1", [lastApplied.version]);
    await client.query("COMMIT");
    logger.info({ version: lastApplied.version }, "migration rolled back");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function status(): Promise<void> {
  await ensureMigrationsTable();
  const migrations = await loadMigrations();
  const applied = await appliedVersions();
  for (const mig of migrations) {
    const mark = applied.has(mig.version) ? "[x]" : "[ ]";
    // eslint-disable-next-line no-console
    console.log(`${mark} ${mig.name}`);
  }
}

// CLI entrypoint: `tsx migrate.ts up|down|status`
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const cmd = process.argv[2] ?? "up";
  const run = cmd === "down" ? down : cmd === "status" ? status : up;
  run()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, "migration command failed");
      pool.end().finally(() => process.exit(1));
    });
}
