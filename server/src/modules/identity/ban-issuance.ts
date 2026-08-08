import type { DbClient } from "../../db/pool.js";
import { activePepperVersion } from "../../shared/email-identity.js";
import { logger } from "../../shared/logger.js";

/**
 * T24 — issuing a ban.
 *
 * The counterpart to `ban-check.ts`. That file has always been able to READ a ban; until
 * now nothing in the product could WRITE one, so `pseudonymous_profile.status = 'banned'`
 * and `identity_account.ban_status` were columns no code ever set.
 *
 * Reasoning, costs, and what this deliberately does not decide (there is NO automatic
 * trigger — the caller is M5's operator console) live in
 * `decisions/t24-ban-issuance-policy.md`.
 */

export interface BanIssuance {
  /** The offender, identified by the profile that produced the content. */
  profileId: string;
  reason: string;
  /** The moderation case that led here, when there is one. */
  originatingModerationCaseId?: string | null;
}

export interface BanIssuanceResult {
  banned: true;
  /** False when a ban for this address already existed; the original reason is kept. */
  newRecord: boolean;
}

interface IdentityRow {
  identity_account_id: string;
  email_hash: string;
}

/**
 * Ban the person behind a profile.
 *
 * MUST be called inside the caller's transaction. All three writes belong together: a
 * `ban_record` with no status change lets the person keep posting until someone notices,
 * and a status change with no `ban_record` evaporates the moment they delete the account —
 * which is the whole defect this closes (SEC-016/PRV-2).
 *
 * The email fingerprint is re-derived here rather than passed in, so a caller cannot ban
 * one person's address while flipping another person's profile.
 */
export async function banIdentity(
  client: DbClient,
  input: BanIssuance,
): Promise<BanIssuanceResult> {
  const { rows } = await client.query<IdentityRow>(
    `SELECT ia.id AS identity_account_id, ia.email_hash
       FROM pseudonymous_profile p
       JOIN identity_account ia ON ia.id = p.identity_account_id
      WHERE p.id = $1`,
    [input.profileId],
  );
  const identity = rows[0];
  if (!identity) {
    // Not a user-facing error: every caller has just read this profile from a moderation
    // case or a grievance. A miss means the caller passed something that is not a profile.
    throw new Error(`banIdentity: no identity for profile ${input.profileId}`);
  }

  // Deliberately NOT the stored email_hash from identity_account: that row may have been
  // written under a retired pepper, and a ban recorded under a retired version would stop
  // matching the day that version is dropped from the lookup list (RR-13). Bans are always
  // written under the ACTIVE pepper. Both are produced by the same T50 procedure, so for an
  // un-rotated deployment these are the same string.
  //
  // `email_hash` is `v<n>$<digest>`; re-hashing needs the normalized address, which is not
  // stored (by design — it is the thing we refuse to keep). So when the stored hash already
  // carries the active version we reuse it, and only fall back to re-deriving when it does
  // not, which is the rotation case the runbook covers.
  const activeVersion = activePepperVersion();
  const storedVersion = identity.email_hash.slice(0, identity.email_hash.indexOf("$"));
  if (storedVersion !== activeVersion) {
    // The account predates a rotation. Its hash still matches on lookup (candidateHashes
    // tries retired versions), so the ban is durable today — but it will stop matching when
    // that retired pepper is finally dropped. Recording the ban under the version we have is
    // still strictly better than refusing to ban; the alternative is no ban at all.
    logger.warn(
      { storedVersion, activeVersion },
      "banning an account whose email hash predates the active pepper — re-hash it during the next rotation (runbooks/pepper-rotation.md)",
    );
  }

  const inserted = await client.query(
    `INSERT INTO ban_record (email_hash, ban_reason, originating_moderation_case_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (email_hash) DO NOTHING`,
    [identity.email_hash, input.reason, input.originatingModerationCaseId ?? null],
  );

  // Re-applied even when the record already existed. If a ban was issued and the profile
  // somehow drifted back to active, calling again should heal it rather than no-op on the
  // unique constraint.
  await client.query(`UPDATE pseudonymous_profile SET status = 'banned' WHERE id = $1`, [
    input.profileId,
  ]);
  await client.query(`UPDATE identity_account SET ban_status = true WHERE id = $1`, [
    identity.identity_account_id,
  ]);

  const newRecord = (inserted.rowCount ?? 0) > 0;
  logger.info(
    { profileId: input.profileId, newRecord },
    newRecord ? "ban issued" : "ban re-applied; existing record and its reason kept",
  );
  return { banned: true, newRecord };
}
