import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * T12 unit coverage for the session-token primitive
 * (`decisions/oq-14-session-mechanism.md`). Database-free by design: these pin the
 * properties the whole authenticated shell rests on — a forged or type-confused token
 * must never verify, and a token must carry no identity material.
 *
 * The DB-backed half of T12 (live profile-status revocation in `requireSession`) is
 * integration-tested separately; it cannot be asserted here.
 */

beforeAll(() => {
  process.env.SESSION_SIGNING_KEY = "v1:test-session-key-active";
  process.env.SESSION_SIGNING_KEY_RETIRED = "";
  process.env.SESSION_TTL_DAYS = "30";
  process.env.SESSION_REFRESH_AFTER_DAYS = "7";
  process.env.EMAIL_HASH_PEPPER_ACTIVE = "v1:test-pepper-active";
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost/murmur_test";
  process.env.CAMPUS_EMAIL_DOMAINS = "example-college.edu";
});

const PROFILE = "11111111-2222-3333-4444-555555555555";
const load = () => import("../../server/src/shared/session.js");

describe("issue/verify round trip", () => {
  it("verifies a session token it just issued", async () => {
    const { issueSessionToken, verifyToken } = await load();
    const payload = verifyToken(issueSessionToken(PROFILE), "session");
    expect(payload?.sub).toBe(PROFILE);
    expect(payload?.typ).toBe("session");
  });

  it("verifies a bootstrap token as bootstrap", async () => {
    const { issueBootstrapToken, verifyToken } = await load();
    expect(verifyToken(issueBootstrapToken(PROFILE), "bootstrap")?.sub).toBe(PROFILE);
  });
});

describe("type confusion (decision §2)", () => {
  it("refuses a bootstrap token presented as a session token", async () => {
    const { issueBootstrapToken, verifyToken } = await load();
    expect(verifyToken(issueBootstrapToken(PROFILE), "session")).toBeNull();
  });

  it("refuses a session token presented at the bootstrap exchange", async () => {
    const { issueSessionToken, verifyToken } = await load();
    expect(verifyToken(issueSessionToken(PROFILE), "bootstrap")).toBeNull();
  });
});

describe("forgery", () => {
  it("refuses a token whose payload was edited to another profile", async () => {
    const { issueSessionToken, verifyToken } = await load();
    const [body, sig] = issueSessionToken(PROFILE).split(".");
    const tampered = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
    tampered.sub = "99999999-9999-9999-9999-999999999999";
    const forged = `${Buffer.from(JSON.stringify(tampered)).toString("base64url")}.${sig}`;
    expect(verifyToken(forged, "session")).toBeNull();
  });

  it("refuses an unsigned/'none'-style token", async () => {
    const { verifyToken } = await load();
    const body = Buffer.from(
      JSON.stringify({ sub: PROFILE, typ: "session", iat: Date.now(), exp: Date.now() + 1000 }),
    ).toString("base64url");
    expect(verifyToken(`${body}.`, "session")).toBeNull();
    expect(verifyToken(body, "session")).toBeNull();
    expect(verifyToken(`${body}.deadbeef`, "session")).toBeNull();
  });

  it("refuses garbage and empty input without throwing", async () => {
    const { verifyToken } = await load();
    for (const bad of ["", ".", "..", "a.b", "not-a-token"]) {
      expect(verifyToken(bad, "session")).toBeNull();
    }
  });
});

describe("expiry", () => {
  it("refuses a token past its exp", async () => {
    const { issueSessionToken, verifyToken } = await load();
    const token = issueSessionToken(PROFILE, -1000); // already expired
    expect(verifyToken(token, "session")).toBeNull();
  });

  it("expires an untouched session at the configured TTL", async () => {
    vi.useFakeTimers();
    try {
      const { issueSessionToken, verifyToken } = await load();
      const token = issueSessionToken(PROFILE);
      vi.advanceTimersByTime(29 * 86_400_000);
      expect(verifyToken(token, "session")).not.toBeNull();
      vi.advanceTimersByTime(2 * 86_400_000); // now past day 30
      expect(verifyToken(token, "session")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("sliding refresh (decision §3)", () => {
  it("does not refresh a fresh token, does refresh one past the threshold", async () => {
    const { issueSessionToken, verifyToken, shouldRefresh } = await load();
    const payload = verifyToken(issueSessionToken(PROFILE), "session")!;
    expect(shouldRefresh(payload)).toBe(false);
    expect(shouldRefresh(payload, Date.now() + 6 * 86_400_000)).toBe(false);
    expect(shouldRefresh(payload, Date.now() + 8 * 86_400_000)).toBe(true);
  });

  it("never refreshes a bootstrap token", async () => {
    const { issueBootstrapToken, verifyToken, shouldRefresh } = await load();
    const payload = verifyToken(issueBootstrapToken(PROFILE), "bootstrap")!;
    expect(shouldRefresh(payload, Date.now() + 30 * 86_400_000)).toBe(false);
  });
});

describe("key rotation (RR-13 parity, decision §5)", () => {
  it("still verifies tokens signed with the retired key, and issues with the active one", async () => {
    vi.resetModules();
    process.env.SESSION_SIGNING_KEY = "v1:old-key";
    const before = await import("../../server/src/shared/session.js");
    const oldToken = before.issueSessionToken(PROFILE);

    vi.resetModules();
    process.env.SESSION_SIGNING_KEY = "v2:new-key";
    process.env.SESSION_SIGNING_KEY_RETIRED = "v1:old-key";
    const after = await import("../../server/src/shared/session.js");

    expect(after.verifyToken(oldToken, "session")?.sub).toBe(PROFILE);
    const newToken = after.issueSessionToken(PROFILE);

    // The new token must NOT verify under the old key alone — proving it was signed
    // with the active key rather than the retired one.
    vi.resetModules();
    process.env.SESSION_SIGNING_KEY = "v1:old-key";
    process.env.SESSION_SIGNING_KEY_RETIRED = "";
    const oldOnly = await import("../../server/src/shared/session.js");
    expect(oldOnly.verifyToken(newToken, "session")).toBeNull();
  });

  it("is not signed with the email-hash pepper (M1 key reuse retired)", async () => {
    vi.resetModules();
    process.env.SESSION_SIGNING_KEY = "v1:session-only-key";
    process.env.SESSION_SIGNING_KEY_RETIRED = "";
    process.env.EMAIL_HASH_PEPPER_ACTIVE = "v1:pepper-only-key";
    const { issueSessionToken } = await import("../../server/src/shared/session.js");
    const token = issueSessionToken(PROFILE);
    const body = token.split(".")[0]!;
    const { createHmac } = await import("node:crypto");
    const withPepper = createHmac("sha256", "pepper-only-key").update(body).digest("base64url");
    expect(token.split(".")[1]).not.toBe(withPepper);
  });
});

describe("identity non-disclosure (NFR)", () => {
  it("carries the profile id and nothing else — no email, hash, or account id", async () => {
    vi.resetModules();
    process.env.SESSION_SIGNING_KEY = "v1:test-session-key-active";
    const { issueSessionToken } = await import("../../server/src/shared/session.js");
    const body = issueSessionToken(PROFILE).split(".")[0]!;
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    expect(Object.keys(decoded).sort()).toEqual(["exp", "iat", "sub", "typ"]);
    const asText = JSON.stringify(decoded).toLowerCase();
    for (const term of ["@", "email", "identity_account", "hash"]) {
      expect(asText).not.toContain(term);
    }
  });
});

describe("bearerFrom", () => {
  it("extracts a bearer credential and rejects other schemes", async () => {
    const { bearerFrom } = await load();
    expect(bearerFrom("Bearer abc.def")).toBe("abc.def");
    expect(bearerFrom("  Bearer abc.def  ")).toBe("abc.def");
    expect(bearerFrom("Basic abc")).toBeNull();
    expect(bearerFrom("abc")).toBeNull();
    expect(bearerFrom(undefined)).toBeNull();
  });
});
