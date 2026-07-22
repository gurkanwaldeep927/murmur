import pino from "pino";
import { config } from "../config/index.js";

/**
 * Structured logger. Identity/PII fields (email, email_hash, tokens) are NEVER
 * logged — NFR "identity non-disclosure" applies to logs as well as API responses
 * (privacy-agent T61 baseline). Log identifiers (profile ids), never raw email.
 */
export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      "email",
      "*.email",
      "email_encrypted",
      "*.email_encrypted",
      "email_hash",
      "*.email_hash",
      "token",
      "*.token",
      "verification_token_hash",
      "*.verification_token_hash",
    ],
    censor: "[redacted]",
  },
});
