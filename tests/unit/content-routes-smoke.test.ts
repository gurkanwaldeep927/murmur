import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

/**
 * DB-free smoke coverage for the T15/T16/T17 routes.
 *
 * Everything asserted here is decided before any query runs, so this suite works with no
 * Postgres — which matters while the project has no disposable test database (see
 * scripts/sql-explain-check.ts). It pins the two things that would otherwise only be
 * caught by the DB-backed suites: that the content routes are actually registered on the
 * app, and that every one of them sits behind the session guard.
 */

let app: import("express").Express;

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  const { createApp } = await import("../../server/src/app.js");
  app = createApp();
});

describe("content routes are registered and guarded", () => {
  const guarded: [string, string][] = [
    ["post", "/questions"],
    ["post", "/questions/00000000-0000-4000-8000-000000000001/answers"],
    ["get", "/questions"],
    ["get", "/questions/00000000-0000-4000-8000-000000000001"],
    ["get", "/topics"],
  ];

  for (const [method, path] of guarded) {
    it(`test_R2_${method}_${path.replace(/[^a-z]/gi, "_")}_requires_a_session`, async () => {
      const res = await (method === "post"
        ? request(app).post(path).send({})
        : request(app).get(path));

      // 401, not 404: the route exists (so it is registered) and refuses (so it is
      // guarded). A 404 here would mean the router never mounted.
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("session_required");
    });
  }

  it("test_unregistered_route_still_404s", async () => {
    const res = await request(app).get("/definitely-not-a-route");
    expect(res.status).toBe(404);
  });
});

describe("moderation provider resolution", () => {
  it("test_R6_unconfigured_provider_resolves_to_hold_all", async () => {
    // The default this whole milestone runs on until T14b/M6 binds a vendor.
    const { resolveProviders, resetProvidersForTest } = await import(
      "../../server/src/modules/moderation/providers/index.js"
    );
    resetProvidersForTest();
    const before = process.env.MODERATION_PROVIDER;
    delete process.env.MODERATION_PROVIDER;

    const { tier1, tier2 } = resolveProviders();
    expect(tier1.name).toBe("hold-all");
    expect(tier2).toBeNull();

    if (before !== undefined) process.env.MODERATION_PROVIDER = before;
    resetProvidersForTest();
  });
});
