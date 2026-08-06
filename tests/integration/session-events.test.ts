import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

/**
 * T51 — session instrumentation, the source of PRD R8's WAU density and D30 cohorts.
 *
 * Before T51 the session path emitted nothing at all: `session.routes.ts` carried a
 * comment saying the logout endpoint existed "so the analytics hook has somewhere to
 * live", and no hook was ever written. Both metrics had zero source data, and nothing
 * anywhere reported that — the gap would have surfaced at T46 (M6), long after the
 * milestones that were supposed to produce the data had closed.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

const TEST_EMAIL = "t51.session.24@nitj.ac.in";

let app: import("express").Express;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;
let signIn: typeof import("../helpers/auth.js").signIn;
let waitForEvents: typeof import("../helpers/analytics.js").waitForEvents;
let readEvents: typeof import("../helpers/analytics.js").readEvents;

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  if (!process.env.DATABASE_URL) {
    throw new Error("T51 session-event tests require DATABASE_URL (disposable test Postgres)");
  }
  const db = await import("../helpers/test-db.js");
  ({ truncateAll, closeDb, pool } = db);
  ({ signIn } = await import("../helpers/auth.js"));
  ({ waitForEvents, readEvents } = await import("../helpers/analytics.js"));
  const { createApp } = await import("../../server/src/app.js");
  await db.migrateTestDb();
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe("T51 — session lifecycle events (PRD R8: WAU, D30)", () => {
  it("test_R8_sign_in_emits_session_started_attributed_to_the_profile", async () => {
    const user = await signIn(app, TEST_EMAIL);

    const rows = await waitForEvents(pool, "session.started");

    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor_profile_id).toBe(user.profile.id);
    // No metadata: the table is append-only (PRV-1) and this is the highest-volume event
    // the server emits, so anything added here would be retained forever.
    expect(rows[0]!.metadata).toBeNull();
  });

  it("test_R8_app_boot_check_emits_session_resumed", async () => {
    const user = await signIn(app, TEST_EMAIL);

    const booted = await request(app)
      .get("/session")
      .set("authorization", `Bearer ${user.sessionToken}`);
    expect(booted.status).toBe(200);

    const rows = await waitForEvents(pool, "session.resumed");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor_profile_id).toBe(user.profile.id);
  });

  it("test_R8_wau_counts_distinct_profiles_not_events", async () => {
    // The metric is "how many DISTINCT people were active", so one person opening the app
    // three times must count once. Pinning it here stops T46 from being written against
    // a raw event count, which would silently overstate WAU by the reopen rate.
    const user = await signIn(app, TEST_EMAIL);
    for (let i = 0; i < 3; i += 1) {
      await request(app).get("/session").set("authorization", `Bearer ${user.sessionToken}`);
    }

    await waitForEvents(pool, "session.resumed", 3);

    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(DISTINCT actor_profile_id) AS n
         FROM analytics_event
        WHERE event_type IN ('session.started', 'session.resumed')`,
    );
    expect(rows[0]!.n).toBe("1");
  });

  it("test_R8_a_rejected_session_emits_nothing", async () => {
    // A 401 is not activity. If a bad token produced an event, WAU would count anyone
    // probing the endpoint — including an attacker replaying dead tokens.
    const rejected = await request(app).get("/session").set("authorization", "Bearer not-a-token");
    expect(rejected.status).toBe(401);

    await new Promise((r) => setTimeout(r, 250));
    expect(await readEvents(pool, "session.resumed")).toHaveLength(0);
    expect(await readEvents(pool, "session.started")).toHaveLength(0);
  });

  it("test_R8_logout_is_deliberately_not_instrumented", async () => {
    // Documented absence, not an oversight (see session-events.ts): logout runs without
    // requireSession, so there is no attributable actor, and adding the middleware to get
    // one would turn a 204 into a 401 for a client holding an expired token. This test
    // exists so that reasoning is re-examined deliberately rather than by accident.
    const user = await signIn(app, TEST_EMAIL);
    const out = await request(app)
      .post("/session/logout")
      .set("authorization", `Bearer ${user.sessionToken}`);
    expect(out.status).toBe(204);

    await new Promise((r) => setTimeout(r, 250));
    const { rows } = await pool.query<{ event_type: string }>(
      `SELECT event_type FROM analytics_event WHERE event_type LIKE 'session.%'`,
    );
    expect(rows.map((r) => r.event_type)).toEqual(["session.started"]);
  });
});
