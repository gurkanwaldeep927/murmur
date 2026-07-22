import type { DbClient } from "../../db/pool.js";
import { candidateHashes } from "../../shared/email-identity.js";
import { logger } from "../../shared/logger.js";

/**
 * A11 — Ban Enforcement Check (internal, invoked by A2 at registration).
 *
 * The lookup MECHANISM is built in M1 (plan T50 note) so A2 calls it from day one,
 * even though the `ban_record` TABLE is created later by migration 003 (M3 / T21) and
 * ban *issuance* + guard-wiring on A3/A4/A6 is M3 (T23). Until migration 003 lands,
 * the table does not exist; we detect that (Postgres 42P01 undefined_table) and treat
 * it as "no ban match" so the tracer runs, while the exact query that will enforce
 * bans in M3 is already in place and exercised.
 *
 * Matching uses candidateHashes() (active + retired peppers) so a ban written under an
 * older pepper still matches after rotation (RR-13). ban_record.email_hash and
 * identity_account.email_hash are produced by the same T50 procedure — no drift (RR-7).
 */

export interface BanCheckResult {
  banned: boolean;
  reason: string | null;
}

export async function checkBanByNormalizedEmail(
  client: DbClient,
  normalizedEmail: string,
): Promise<BanCheckResult> {
  const hashes = candidateHashes(normalizedEmail);
  // The ban query runs inside the caller's transaction (A2 confirm). If ban_record
  // is absent (pre-M3), Postgres aborts the ENTIRE transaction on 42P01 — catching
  // the error in JS is not enough, every later statement would fail with 25P02.
  // A SAVEPOINT isolates the probe so we can roll back just this query and continue.
  await client.query("SAVEPOINT ban_check");
  try {
    const { rows } = await client.query<{ ban_reason: string | null }>(
      `SELECT ban_reason FROM ban_record WHERE email_hash = ANY($1::text[]) LIMIT 1`,
      [hashes],
    );
    await client.query("RELEASE SAVEPOINT ban_check");
    if (rows.length === 0) return { banned: false, reason: null };
    return { banned: true, reason: rows[0]!.ban_reason };
  } catch (err) {
    // Restore the transaction to the savepoint so the caller can keep going.
    await client.query("ROLLBACK TO SAVEPOINT ban_check");
    if ((err as { code?: string }).code === "42P01") {
      // ban_record not yet created (pre-M3). No bans can exist; treat as no match.
      logger.debug("ban_record table absent (pre-M3) — ban check returns no-match");
      return { banned: false, reason: null };
    }
    throw err;
  }
}
