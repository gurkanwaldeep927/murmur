import type { DbClient, Queryable } from "../../db/pool.js";
import { generatePseudonym } from "./pseudonym.js";

/**
 * Pseudonymous Profile Manager persistence (owns pseudonymous_profile).
 * Other modules reach this table only through these functions (architecture §2).
 */

export interface PublicProfile {
  id: string;
  pseudonym: string;
  year_badge: string;
  reputation_score: number;
  status: "active" | "suspended" | "banned";
}

/**
 * Load a profile by its own id — the per-request lookup behind `requireSession`.
 * This is what makes stateless session tokens revocable: `status` is read live on
 * every authenticated request, so a ban lands on the next one
 * (decisions/oq-14-session-mechanism.md §4). Soft-deleted profiles read as absent.
 *
 * Selects public fields only; identity_account_id is never selected back out
 * (NFR identity non-disclosure).
 */
export async function findProfileById(
  client: Queryable,
  profileId: string,
): Promise<PublicProfile | null> {
  const { rows } = await client.query<PublicProfile>(
    `SELECT id, pseudonym, year_badge, reputation_score, status
       FROM pseudonymous_profile
      WHERE id = $1 AND deleted_at IS NULL`,
    [profileId],
  );
  return rows[0] ?? null;
}

/**
 * Create the 1-1 profile for a freshly verified identity account, retrying on the
 * (rare) pseudonym collision. Returns only user-facing fields — the internal
 * identity_account_id link is never selected back out (NFR identity non-disclosure).
 */
export async function createProfile(
  client: DbClient,
  identityAccountId: string,
  yearBadge: string,
): Promise<PublicProfile> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const pseudonym = generatePseudonym();
    try {
      const { rows } = await client.query<PublicProfile>(
        `INSERT INTO pseudonymous_profile (identity_account_id, pseudonym, year_badge)
         VALUES ($1, $2, $3)
         RETURNING id, pseudonym, year_badge, reputation_score, status`,
        [identityAccountId, pseudonym, yearBadge],
      );
      return rows[0]!;
    } catch (err) {
      // 23505 = unique_violation. Retry only on the pseudonym collision; a collision
      // on identity_account_id means the profile already exists — rethrow.
      const code = (err as { code?: string }).code;
      if (code === "23505" && attempt < maxAttempts) continue;
      throw err;
    }
  }
  throw new Error("could not generate a unique pseudonym after retries");
}
