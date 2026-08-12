import "dotenv/config";
import { pool } from "../src/db/pool.js";
import { hashEmail } from "../src/shared/email-identity.js";

/**
 * Admin one-off: hard-delete an identity by email (dev/data-cleanup use).
 * Computes email_hash via the SAME T50 procedure the app uses, then removes the
 * pseudonymous_profile (FK child) before the identity_account. Transactional.
 *
 *   Usage: echo user@nitj.ac.in | tsx server/scripts/admin-delete-identity.ts
 *
 * ## Why the address arrives on stdin and never as an argument (SEC-016, T62)
 *
 * It used to be `argv[2]`, and it used to print the address back in three places. Both
 * halves leak the one thing this product exists to hide, and neither leak is in the
 * database — they are in places nobody thinks of as storage:
 *
 *   - an argument is visible to every other process on the box for as long as the script
 *     runs (`ps`, `/proc/<pid>/cmdline`, Windows' process list), and
 *   - it is written to the shell's history file, where it persists after the account it
 *     names has been deleted. Deleting the row and leaving the address in `.bash_history`
 *     is not a deletion.
 *
 * stdin is read by this process only and is never recorded anywhere. The trade is a
 * slightly less obvious invocation, which is why the usage line above spells it out.
 *
 * Output identifies the account by `email_hash` prefix, not by address: the operator
 * already knows which address they typed, so echoing it back adds nothing and puts a live
 * campus address into terminal scrollback and CI logs. This is the same reasoning that put
 * `req.remoteAddress` on the logger's redact list (PRV-5), and the same failure that leaked
 * the database password on 2026-08-05 — a value nobody meant to persist, persisted by a
 * console line.
 */

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trim();
}

if (process.argv[2]) {
  // Refuse rather than accept-and-warn. Accepting it would mean the leak already happened
  // by the time this line runs, and a warning does not un-write a history file.
  console.error(
    "Refusing an address on the command line: it lands in shell history and the process list.\n" +
      "Pass it on stdin instead:\n" +
      "  echo user@nitj.ac.in | tsx server/scripts/admin-delete-identity.ts",
  );
  process.exit(2);
}

if (process.stdin.isTTY) {
  console.error(
    "usage: echo <email> | tsx server/scripts/admin-delete-identity.ts\n" +
      "(reads the address from stdin so it is never written to shell history)",
  );
  process.exit(1);
}

const email = await readStdin();
if (!email) {
  console.error("No address on stdin. usage: echo <email> | tsx server/scripts/admin-delete-identity.ts");
  process.exit(1);
}

const h = hashEmail(email);
if (!h) {
  // Deliberately does not echo the malformed value — a typo'd campus address is still a
  // campus address, and this is the branch most likely to be hit and screenshotted.
  console.error("Malformed email on stdin (it is not echoed back on purpose).");
  process.exit(1);
}

/** Enough to correlate with a database row, far too little to reverse. */
const hashRef = `${h.hash.slice(0, 12)}…`;

const client = await pool.connect();
try {
  await client.query("BEGIN");
  const acct = await client.query<{ id: string }>(
    "SELECT id FROM identity_account WHERE email_hash = $1",
    [h.hash],
  );
  if (acct.rows.length === 0) {
    await client.query("ROLLBACK");
    console.log(`No identity_account found for email_hash ${hashRef} — nothing to delete.`);
  } else {
    const id = acct.rows[0]!.id;
    const prof = await client.query<{ pseudonym: string }>(
      "DELETE FROM pseudonymous_profile WHERE identity_account_id = $1 RETURNING pseudonym",
      [id],
    );
    await client.query("DELETE FROM identity_account WHERE id = $1", [id]);
    await client.query("COMMIT");
    console.log(
      `Deleted identity_account ${id} (email_hash ${hashRef}); profiles removed: ${
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
