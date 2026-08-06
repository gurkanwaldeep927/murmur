import crypto from "node:crypto";
import { config } from "../config/index.js";

/**
 * Application-layer encryption for identity_account.email_encrypted — the raw email
 * retained transiently for resend (S2) and manual-fallback review, then nulled once
 * verification_status = 'verified'. Never returned by any API (NFR identity
 * non-disclosure); schema §6, assumptions[email_encrypted].
 *
 * AES-256-GCM. Ciphertext layout (bytea): [12-byte IV][16-byte auth tag][ciphertext].
 *
 * If no key is configured, encryption is a no-op returning null so the spine still runs
 * without one. Since SEC-011 that state is reachable ONLY under NODE_ENV development or
 * test: `config/index.ts` refuses to boot anywhere else with the key unset, and validates
 * its length there rather than here, so a bad key fails at startup and not mid-sign-up.
 */

function key(): Buffer | null {
  if (!config.emailEncryptionKey) return null;
  // Length already checked at boot; re-checked here so this function stays correct on its
  // own terms if it is ever called with a key from somewhere else.
  const k = Buffer.from(config.emailEncryptionKey, "base64");
  if (k.length !== 32) {
    throw new Error("EMAIL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return k;
}

export function encryptEmail(raw: string): Buffer | null {
  const k = key();
  if (!k) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decryptEmail(blob: Buffer): string {
  const k = key();
  if (!k) throw new Error("EMAIL_ENCRYPTION_KEY not configured — cannot decrypt");
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
