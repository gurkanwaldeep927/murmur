import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * SECREG-RR13-LOOKUP — regression seed for the T60 security gate's pepper finding.
 *
 * The defect this pins: `identity_account` lookups used `hashNormalizedEmail`, which
 * hashes with the ACTIVE pepper only, while `ban_record` lookups already used
 * `candidateHashes` (active + retired). Rotating the pepper — which RR-13 requires, and
 * which the T60 gate forced by finding the live pepper was the committed sample value —
 * would therefore have made A1/A2 stop recognising every existing account, letting a
 * registered student register a second time. RR-7's failure mode, reached through the
 * rotation RR-13 mandates.
 *
 * These assertions are about *which hashes are offered to the lookup*, so they need no
 * database — which matters, since none is currently reachable.
 */

const V1 = "v1:pepper-one";
const V2 = "v2:pepper-two";
const EMAIL = "someone.24@nitj.ac.in";

beforeAll(() => {
  process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
});

/** Load a fresh module graph with a specific pepper configuration. */
async function loadWithPeppers(active: string, retired: string) {
  vi.resetModules();
  process.env.EMAIL_HASH_PEPPER_ACTIVE = active;
  process.env.EMAIL_HASH_PEPPER_RETIRED = retired;
  return import("../../server/src/shared/email-identity.js");
}

describe("SECREG-RR13-LOOKUP: pepper rotation must not orphan existing accounts", () => {
  it("test_RR13_hash_written_under_v1_is_still_offered_after_rotating_to_v2", async () => {
    // Before rotation: v1 is active, and this is what got stored.
    const before = await loadWithPeppers(V1, "");
    const stored = before.hashNormalizedEmail(EMAIL);
    expect(stored.startsWith("v1$")).toBe(true);

    // After rotation: v2 active, v1 retired.
    const after = await loadWithPeppers(V2, V1);

    // New writes move to v2 …
    expect(after.hashNormalizedEmail(EMAIL).startsWith("v2$")).toBe(true);

    // … but the lookup set still contains the exact hash already in the table.
    // This is the assertion that fails if a lookup uses hashNormalizedEmail alone.
    expect(after.candidateHashes(EMAIL)).toContain(stored);
  });

  it("test_RR13_active_only_hash_would_have_missed_it", async () => {
    // States the bug directly, so the test explains itself if it ever regresses.
    const before = await loadWithPeppers(V1, "");
    const stored = before.hashNormalizedEmail(EMAIL);

    const after = await loadWithPeppers(V2, V1);
    expect(after.hashNormalizedEmail(EMAIL)).not.toBe(stored);
  });

  it("test_RR13_candidate_set_covers_multiple_retired_generations", async () => {
    const v0 = await loadWithPeppers("v0:pepper-zero", "");
    const oldest = v0.hashNormalizedEmail(EMAIL);
    const v1 = await loadWithPeppers(V1, "");
    const middle = v1.hashNormalizedEmail(EMAIL);

    const now = await loadWithPeppers(V2, `${V1},v0:pepper-zero`);
    const candidates = now.candidateHashes(EMAIL);
    expect(candidates).toContain(oldest);
    expect(candidates).toContain(middle);
    expect(candidates).toContain(now.hashNormalizedEmail(EMAIL));
  });

  it("test_RR13_identity_and_ban_lookups_use_the_same_candidate_procedure", async () => {
    // The drift RR-7 exists to prevent: both call sites must widen identically.
    const svc = await import("../../server/src/modules/identity/identity.service.js");
    const ban = await import("../../server/src/modules/identity/ban-check.js");
    expect(typeof svc.initiateVerification).toBe("function");
    expect(typeof ban.checkBanByNormalizedEmail).toBe("function");

    const fs = await import("node:fs/promises");
    const serviceSrc = await fs.readFile(
      new URL("../../server/src/modules/identity/identity.service.ts", import.meta.url),
      "utf8",
    );
    const banSrc = await fs.readFile(
      new URL("../../server/src/modules/identity/ban-check.ts", import.meta.url),
      "utf8",
    );
    // Neither lookup may narrow back to the active pepper alone.
    expect(serviceSrc).toContain("candidateHashes");
    expect(banSrc).toContain("candidateHashes");
    expect(serviceSrc).not.toContain("findByEmailHash(");
  });
});
