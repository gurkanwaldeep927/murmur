import { beforeAll, describe, expect, it } from "vitest";

/**
 * T50 / RR-7 unit coverage for the shared email-normalization + keyed-HMAC utility.
 * These run without a database — they pin the exact normalization contract whose drift
 * would let a banned user re-register (the failure mode T50 exists to prevent).
 */

// The module reads config at import time (pepper), so set env before importing.
beforeAll(() => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE = "v1:test-pepper-active";
  process.env.EMAIL_HASH_PEPPER_RETIRED = "v0:test-pepper-retired";
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost/murmur_test";
  process.env.CAMPUS_EMAIL_DOMAINS = "example-college.edu";
});

describe("normalizeEmail", () => {
  it("lowercases and trims", async () => {
    const { normalizeEmail } = await import("../../server/src/shared/email-identity.js");
    expect(normalizeEmail("  Foo@Example-College.EDU ")?.normalized).toBe("foo@example-college.edu");
  });

  it("strips plus-addressing in the local part", async () => {
    const { normalizeEmail } = await import("../../server/src/shared/email-identity.js");
    expect(normalizeEmail("foo+tag@example-college.edu")?.normalized).toBe("foo@example-college.edu");
  });

  it("rejects malformed addresses with null", async () => {
    const { normalizeEmail } = await import("../../server/src/shared/email-identity.js");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("@example-college.edu")).toBeNull();
    expect(normalizeEmail("foo@")).toBeNull();
    expect(normalizeEmail("foo@bar")).toBeNull();
  });
});

describe("hashNormalizedEmail (RR-7: no normalization drift)", () => {
  it("is deterministic and identical for aliased forms of the same address", async () => {
    const { hashEmail } = await import("../../server/src/shared/email-identity.js");
    const a = hashEmail("Student+spam@Example-College.edu");
    const b = hashEmail("student@example-college.edu");
    expect(a).not.toBeNull();
    expect(a!.hash).toBe(b!.hash);
    expect(a!.hash).toMatch(/^v1\$[0-9a-f]{64}$/);
  });

  it("differs for different addresses", async () => {
    const { hashEmail } = await import("../../server/src/shared/email-identity.js");
    expect(hashEmail("a@example-college.edu")!.hash).not.toBe(
      hashEmail("b@example-college.edu")!.hash,
    );
  });
});

describe("candidateHashes (RR-13: rotation-safe matching)", () => {
  it("includes both active and retired pepper hashes", async () => {
    const { candidateHashes } = await import("../../server/src/shared/email-identity.js");
    const hashes = candidateHashes("student@example-college.edu");
    expect(hashes.some((h) => h.startsWith("v1$"))).toBe(true);
    expect(hashes.some((h) => h.startsWith("v0$"))).toBe(true);
  });
});

describe("isCampusDomain", () => {
  it("accepts the configured campus domain and rejects others", async () => {
    const { isCampusDomain } = await import("../../server/src/shared/email-identity.js");
    expect(isCampusDomain("example-college.edu")).toBe(true);
    expect(isCampusDomain("gmail.com")).toBe(false);
  });
});
