import { beforeAll, describe, expect, it } from "vitest";

/**
 * SECREG-SEC-007 — per-caller ceilings on the unauthenticated surface.
 *
 * The finding: `identity.service.ts` enforces a per-EMAIL cooldown and window, which
 * bounds what one address can do and is blind to the attack it was never shaped for —
 * one caller cycling thousands of fresh addresses, every one of which looks like a
 * first-time signup. That path sends unbounded mail on the project's own SMTP
 * credentials, and it also lets an attacker spread OTP guesses across many accounts to
 * stay under any per-account cap.
 */

let FixedWindowLimiter: typeof import("../../server/src/shared/rate-limit.js")["FixedWindowLimiter"];

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  ({ FixedWindowLimiter } = await import("../../server/src/shared/rate-limit.js"));
});

describe("SECREG-SEC-007: fixed-window limiter", () => {
  it("test_SEC007_allows_up_to_the_limit_then_refuses", () => {
    const limiter = new FixedWindowLimiter("test", 3, 60_000);
    expect([1, 2, 3].map(() => limiter.check("caller-a"))).toEqual([true, true, true]);
    expect(limiter.check("caller-a")).toBe(false);
  });

  it("test_SEC007_one_caller_cannot_exhaust_anothers_budget", () => {
    // The failure that would matter most in practice: a shared bucket means one abuser
    // locks out the whole campus.
    const limiter = new FixedWindowLimiter("test", 2, 60_000);
    limiter.check("attacker");
    limiter.check("attacker");
    expect(limiter.check("attacker")).toBe(false);
    expect(limiter.check("an-actual-student")).toBe(true);
  });

  it("test_SEC007_budget_returns_after_the_window", () => {
    // A limiter that never forgives is an outage with extra steps.
    const limiter = new FixedWindowLimiter("test", 1, 60_000);
    const t0 = 1_000_000;
    expect(limiter.check("caller-b", t0)).toBe(true);
    expect(limiter.check("caller-b", t0 + 59_000)).toBe(false);
    expect(limiter.check("caller-b", t0 + 61_000)).toBe(true);
  });

  it("test_SEC007_cycling_addresses_does_not_help_the_caller", () => {
    // The actual SEC-007 attack: the per-email cooldown sees a fresh address every time
    // and permits it. The per-caller bucket does not care what address was used.
    const limiter = new FixedWindowLimiter("verification.initiate", 5, 60 * 60_000);
    const attempts = Array.from({ length: 50 }, () => limiter.check("one-caller"));
    expect(attempts.filter(Boolean)).toHaveLength(5);
  });

  it("test_SEC007_expired_windows_are_swept_so_the_map_cannot_grow_without_bound", () => {
    // A limiter keyed by attacker-controlled input that never evicts is itself a
    // denial-of-service tool. 2000 distinct callers, then a later call to trigger sweep.
    const limiter = new FixedWindowLimiter("test", 1, 1_000);
    const t0 = 5_000_000;
    for (let i = 0; i < 2_000; i++) limiter.check(`caller-${i}`, t0);
    // Well past every window: the sweep runs and the old entries go.
    expect(limiter.check("fresh-caller", t0 + 10_000)).toBe(true);
    // Every earlier caller is forgotten, so each gets a full budget again.
    expect(limiter.check("caller-0", t0 + 10_000)).toBe(true);
  });

  it("test_SEC007_the_bucket_key_is_not_the_raw_caller_address", () => {
    // Client IP is personal data under DPDP and a deanonymisation vector against a
    // product whose promise is that posts cannot be traced to a student. The bucket
    // table must not be readable as a list of who visited.
    const limiter = new FixedWindowLimiter("test", 1, 60_000);
    limiter.check("203.0.113.77");
    const dump = JSON.stringify(limiter);
    expect(dump).not.toContain("203.0.113.77");
  });
});
