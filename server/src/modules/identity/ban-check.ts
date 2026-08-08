import type { DbClient } from "../../db/pool.js";
import { candidateHashes } from "../../shared/email-identity.js";

/**
 * A11 — Ban Enforcement Check (internal, invoked by A2 at registration).
 *
 * Matching uses `candidateHashes()` (active + retired peppers) so a ban written under an
 * older pepper still matches after a rotation (RR-13). `ban_record.email_hash` and
 * `identity_account.email_hash` are produced by the same T50 procedure, so the two cannot
 * drift apart (RR-7) — which is the whole reason there is only one hashing path.
 *
 * ---------------------------------------------------------------------------------------
 * FAIL-CLOSED, as of T23. This function used to catch Postgres 42P01 (undefined_table) and
 * return "not banned", because the lookup mechanism was built in M1 while `ban_record`
 * itself only arrived with migration 003 in M3. That escape hatch was correct exactly until
 * the table existed — and migration 003 landed on 2026-08-08 (T21), so its precondition is
 * now false.
 *
 * It is removed rather than left harmlessly in place. A ban check that answers "no ban"
 * when it cannot read the ban table is fail-OPEN: the one posture this product refuses
 * everywhere else (R6's moderation gateway holds when it cannot classify). Left in, it
 * would sit there as a permanent path where a schema problem silently readmits every
 * banned person, and nothing would report it — the exact shape of the failures in
 * TASK-STATUS problems 8–11e.
 *
 * With it gone, an unreadable `ban_record` aborts A2's transaction and registration fails
 * loudly. That is the correct trade: a student who cannot register today is a visible
 * problem someone fixes; a banned student who quietly gets back in is not.
 *
 * The SAVEPOINT went with it. It existed only to let the caller's transaction survive the
 * 42P01 probe; with the probe gone it protected nothing and cost a round trip on every
 * single registration.
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
  const { rows } = await client.query<{ ban_reason: string | null }>(
    `SELECT ban_reason FROM ban_record WHERE email_hash = ANY($1::text[]) LIMIT 1`,
    [hashes],
  );
  if (rows.length === 0) return { banned: false, reason: null };
  return { banned: true, reason: rows[0]!.ban_reason };
}
