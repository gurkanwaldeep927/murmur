import type { DbClient, DbPool } from "../../db/pool.js";

/**
 * Identity & Verification Service persistence (owns identity_account).
 * Only this module touches identity_account; raw email / hashes never leave here
 * in any user-facing shape (architecture §2, NFR identity non-disclosure).
 */

export interface IdentityAccountRow {
  id: string;
  email_hash: string;
  verification_status: "pending" | "verified" | "blocked_unparseable_year";
  derived_enrollment_year: number | null;
  verification_token_hash: string | null;
  verification_token_expires_at: Date | null;
  verification_attempt_count: number;
  last_verification_sent_at: Date | null;
  ban_status: boolean;
}

const SELECT_COLS = `id, email_hash, verification_status, derived_enrollment_year,
  verification_token_hash, verification_token_expires_at, verification_attempt_count,
  last_verification_sent_at, ban_status`;

export async function findByEmailHash(
  db: DbPool | DbClient,
  emailHash: string,
): Promise<IdentityAccountRow | null> {
  const { rows } = await db.query<IdentityAccountRow>(
    `SELECT ${SELECT_COLS} FROM identity_account WHERE email_hash = $1 AND deleted_at IS NULL`,
    [emailHash],
  );
  return rows[0] ?? null;
}

export interface CreatePendingInput {
  emailHash: string;
  emailEncrypted: Buffer | null;
  tokenHash: string;
  tokenExpiresAt: Date;
}

/** Create a fresh pending account with the first verification token issued. */
export async function createPending(
  db: DbPool | DbClient,
  input: CreatePendingInput,
): Promise<IdentityAccountRow> {
  const { rows } = await db.query<IdentityAccountRow>(
    `INSERT INTO identity_account
       (email_hash, email_encrypted, verification_token_hash, verification_token_expires_at,
        verification_attempt_count, last_verification_sent_at)
     VALUES ($1, $2, $3, $4, 1, now())
     RETURNING ${SELECT_COLS}`,
    [input.emailHash, input.emailEncrypted, input.tokenHash, input.tokenExpiresAt],
  );
  return rows[0]!;
}

/**
 * Re-issue a token for an existing pending account (resend path). The caller passes
 * the new attempt count explicitly: incremented within the rate window, or reset to 1
 * when the window has elapsed.
 */
export async function reissueToken(
  db: DbPool | DbClient,
  id: string,
  tokenHash: string,
  tokenExpiresAt: Date,
  attemptCount: number,
): Promise<void> {
  await db.query(
    `UPDATE identity_account
        SET verification_token_hash = $2,
            verification_token_expires_at = $3,
            verification_attempt_count = $4,
            last_verification_sent_at = now()
      WHERE id = $1`,
    [id, tokenHash, tokenExpiresAt, attemptCount],
  );
}

/** Mark an account verified with its derived year; clears transient token + raw email. */
export async function markVerified(
  client: DbClient,
  id: string,
  derivedYear: number,
): Promise<void> {
  await client.query(
    `UPDATE identity_account
        SET verification_status = 'verified',
            derived_enrollment_year = $2,
            verification_token_hash = NULL,
            verification_token_expires_at = NULL,
            email_encrypted = NULL
      WHERE id = $1`,
    [id, derivedYear],
  );
}

/** Mark an account blocked because the enrollment year could not be parsed (never guessed). */
export async function markBlockedUnparseable(client: DbClient, id: string): Promise<void> {
  await client.query(
    `UPDATE identity_account
        SET verification_status = 'blocked_unparseable_year',
            verification_token_hash = NULL,
            verification_token_expires_at = NULL
      WHERE id = $1`,
    [id],
  );
}
