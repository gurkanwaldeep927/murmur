import "dotenv/config";
import { pool } from "../src/db/pool.js";
import { hashEmail } from "../src/shared/email-identity.js";

/**
 * Admin one-off: hard-delete an identity by email (dev/data-cleanup use).
 * Computes email_hash via the SAME T50 procedure the app uses, then removes the
 * pseudonymous_profile (FK child) before the identity_account. Transactional.
 *   Usage: tsx server/scripts/admin-delete-identity.ts <email>
 */
const email = process.argv[2];
if (!email) {
  console.error("usage: tsx server/scripts/admin-delete-identity.ts <email>");
  process.exit(1);
}

const h = hashEmail(email);
if (!h) {
  console.error(`malformed email: ${email}`);
  process.exit(1);
}

const client = await pool.connect();
try {
  await client.query("BEGIN");
  const acct = await client.query<{ id: string }>(
    "SELECT id FROM identity_account WHERE email_hash = $1",
    [h.hash],
  );
  if (acct.rows.length === 0) {
    await client.query("ROLLBACK");
    console.log(`No identity_account found for ${email} — nothing to delete.`);
  } else {
    const id = acct.rows[0]!.id;
    const prof = await client.query<{ pseudonym: string }>(
      "DELETE FROM pseudonymous_profile WHERE identity_account_id = $1 RETURNING pseudonym",
      [id],
    );
    await client.query("DELETE FROM identity_account WHERE id = $1", [id]);
    await client.query("COMMIT");
    console.log(
      `Deleted identity_account ${id} (${email}); profiles removed: ${
        prof.rows.map((r) => r.pseudonym).join(", ") || "none"
      }`,
    );
  }
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
  await pool.end();
}
