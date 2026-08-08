import crypto from "node:crypto";
import { config } from "../config/index.js";

/**
 * T50 — the single email-normalization + keyed-HMAC procedure.
 *
 * `identity_account.email_hash` (A1 duplicate check, A2 write) and
 * `ban_record.email_hash` (A11 ban lookup) MUST be produced by this one function.
 * Normalization drift between call sites is the exact failure mode RR-7 /
 * TRD risk "email-hash matching" exists to prevent — so there is deliberately
 * no second hashing path anywhere in the codebase.
 *
 * Normalization (schema §6):
 *   1. trim + lowercase
 *   2. strip plus-addressing in the local part (foo+bar@x -> foo@x)
 *   3. strip dots in the local part for domains that treat them as aliases
 *      (Gmail-style); campus domains are configurable but default to alias-stripping
 *      OFF unless the domain is known to alias, to avoid over-collapsing distinct
 *      college addresses.
 *
 * Hashing: keyed HMAC-SHA256 with a server-held pepper. The pepper is VERSIONED
 * (v<n>:<secret>) so it can be rotated without silently breaking existing matches
 * (RR-13). New writes always use the active version; `matchesAnyPepper` lets the
 * ban/duplicate lookup also try retired versions during a dual-hash rollout
 * (see runbooks/pepper-rotation.md).
 */

// Domains whose local parts alias dots away (e.g. Gmail). Campus domains are added
// here only when the founder confirms the address scheme aliases dots (T6 ruleset).
const DOT_ALIASING_DOMAINS = new Set<string>(["gmail.com", "googlemail.com"]);

export interface NormalizedEmail {
  /** The full normalized address (local@domain). */
  normalized: string;
  /** Lowercased domain, for the campus allowlist check. */
  domain: string;
}

/** Returns null if the input is not a syntactically valid single email address. */
export function normalizeEmail(rawInput: string): NormalizedEmail | null {
  const trimmed = rawInput.trim().toLowerCase();
  // Minimal, strict single-address shape check. Full RFC parsing is deliberately
  // avoided; A1 treats a null return as `email_malformed`.
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  const localRaw = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!/^[a-z0-9.-]+$/.test(domain) || !domain.includes(".") || domain.includes("..")) return null;
  if (domain.startsWith("-") || domain.startsWith(".") || domain.endsWith("-") || domain.endsWith("."))
    return null;
  if (localRaw.length === 0 || /\s/.test(localRaw)) return null;

  // Strip plus-addressing.
  let local = localRaw.split("+", 1)[0] ?? localRaw;
  if (local.length === 0) return null;
  // Strip dot-aliasing only for known dot-aliasing domains.
  if (DOT_ALIASING_DOMAINS.has(domain)) {
    local = local.replace(/\./g, "");
    if (local.length === 0) return null;
  }
  return { normalized: `${local}@${domain}`, domain };
}

interface PepperVersion {
  version: string;
  secret: string;
}

function parsePepper(spec: string): PepperVersion | null {
  const idx = spec.indexOf(":");
  if (idx <= 0) return null;
  return { version: spec.slice(0, idx), secret: spec.slice(idx + 1) };
}

function activePepper(): PepperVersion {
  const p = parsePepper(config.emailHashPepperActive);
  if (!p) {
    throw new Error(
      "EMAIL_HASH_PEPPER_ACTIVE must be formatted as v<n>:<secret> (e.g. v1:...)",
    );
  }
  return p;
}

function retiredPeppers(): PepperVersion[] {
  return config.emailHashPepperRetired
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parsePepper)
    .filter((p): p is PepperVersion => p !== null);
}

function hmac(secret: string, normalized: string): string {
  return crypto.createHmac("sha256", secret).update(normalized).digest("hex");
}

/**
 * Compute the email_hash for a normalized email using the ACTIVE pepper.
 * Format: v<n>$<hexdigest> — the version prefix lets rotation identify which
 * pepper produced a stored hash.
 */
export function hashNormalizedEmail(normalized: string): string {
  const p = activePepper();
  return `${p.version}$${hmac(p.secret, normalized)}`;
}

/** Convenience: normalize then hash. Returns null if the email is malformed. */
export function hashEmail(rawInput: string): { hash: string; normalized: NormalizedEmail } | null {
  const normalized = normalizeEmail(rawInput);
  if (!normalized) return null;
  return { hash: hashNormalizedEmail(normalized.normalized), normalized };
}

/**
 * Compute every candidate hash (active + retired peppers) for a normalized email.
 * Ban/duplicate lookups compare against all of these during a pepper rotation so a
 * match against an existing hash written under an older pepper is never missed
 * (RR-13 dual-hash strategy).
 */
export function candidateHashes(normalized: string): string[] {
  const versions = [activePepper(), ...retiredPeppers()];
  return versions.map((p) => `${p.version}$${hmac(p.secret, normalized)}`);
}

/**
 * The version prefix of the pepper new hashes are written under (the `v<n>` in
 * `v<n>$<digest>`). Exposed so callers can tell whether a STORED hash predates the current
 * rotation without re-hashing anything — T24's ban issuance needs exactly that, and the
 * alternative was hashing a dummy string just to read its prefix.
 */
export function activePepperVersion(): string {
  return activePepper().version;
}

/** Is `domain` in the configured single-campus allowlist? */
export function isCampusDomain(domain: string): boolean {
  return config.campusEmailDomains.includes(domain.toLowerCase());
}
