import type { NormalizedEmail } from "../../shared/email-identity.js";

/**
 * Derived-year-badge parsing (R1 AC2, TRD risk "year parsing", plan T6/T8).
 *
 * The AUTHORITATIVE ruleset is a founder-documented, campus-specific artifact —
 * plan task T6, a HUMAN deliverable, with a fixture set of real-format examples.
 * This file is the *mechanism* T8 wires in: a pluggable rule interface plus a
 * deliberately conservative placeholder.
 *
 * HARD CONTRACT (R1 acceptance criterion, verbatim): when the enrollment year
 * cannot be reliably parsed, registration is BLOCKED (or routed to manual review),
 * NEVER defaulted to a guessed year. So `parseEnrollmentYear` returns `null` on any
 * ambiguity — a null is the block signal, not an error to paper over.
 *
 * === WIRING IN THE REAL RULESET (T6) ===
 * Replace/extend `CAMPUS_RULES` with the founder's documented rules and add the
 * fixture examples to tests/nfr as `test_R1AC2_*`. Do NOT loosen the null-on-ambiguity
 * contract to make a fixture pass — an unparseable format must stay blocked.
 */

export interface YearRule {
  /** Domain this rule applies to (lowercased). */
  domain: string;
  /**
   * Extract a 4-digit enrollment year from a normalized email, or null if this
   * rule cannot confidently parse it.
   */
  parse(normalized: NormalizedEmail): number | null;
}

const currentYear = () => new Date().getUTCFullYear();

/** Reject implausible years so a spurious digit-match can't become a badge. */
function plausibleYear(year: number): number | null {
  const now = currentYear();
  // Enrollment years within a sane window (no future beyond next intake, no ancient).
  if (year < now - 12 || year > now + 1) return null;
  return year;
}

/**
 * NIT Jalandhar student email rule (founder-documented, T6). Student local parts end
 * with a 2-digit admission year segment, e.g. `gurkanwaldeeps.mc.24@nitj.ac.in` -> 24
 * -> 2024. The year is the FINAL dot-separated token; anything that doesn't match this
 * shape returns null (blocked and routed to manual review, never guessed — R1 AC2).
 */
const nitjRule: YearRule = {
  domain: "nitj.ac.in",
  parse(normalized) {
    const local = normalized.normalized.split("@", 1)[0] ?? "";
    const m = /\.(\d{2})$/.exec(local);
    if (!m) return null;
    // Two-digit admission year -> 20YY. plausibleYear() rejects anything outside a
    // sane enrollment window, so an out-of-range digit-match can't become a badge.
    return plausibleYear(2000 + Number.parseInt(m[1]!, 10));
  },
};

const CAMPUS_RULES: YearRule[] = [nitjRule];

export interface YearParseResult {
  /** The derived enrollment year, or null when it could not be reliably parsed. */
  year: number | null;
  /** True when no rule exists for the domain at all (distinct from "rule ran, no match"). */
  noRuleForDomain: boolean;
}

export function parseEnrollmentYear(normalized: NormalizedEmail): YearParseResult {
  const rule = CAMPUS_RULES.find((r) => r.domain === normalized.domain);
  if (!rule) return { year: null, noRuleForDomain: true };
  return { year: rule.parse(normalized), noRuleForDomain: false };
}
