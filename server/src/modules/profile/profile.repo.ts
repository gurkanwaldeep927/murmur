import type { DbClient } from "../../db/pool.js";
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
