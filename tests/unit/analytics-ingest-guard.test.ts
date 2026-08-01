import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  METADATA_MAX_KEYS,
  METADATA_MAX_VALUE_LENGTH,
  sanitizeMetadata,
} from "../../server/src/modules/analytics/client-events.js";

/**
 * SECREG-PRV-7 / SECREG-SEC-009 — the unauthenticated event ingest.
 *
 * `POST /events` is the app's only unauthenticated write, and it has to be: the
 * registration funnel it measures happens before anyone has a session (R8). As written it
 * accepted a caller-supplied `actorProfileId`, any `eventType` string, and an open
 * `Record<string, unknown>` of metadata — into a table nothing ever deletes from (PRV-1).
 *
 * DB-free: every assertion here is decided before `persistEvent` is reached, so this runs
 * in the no-DB unit subset alongside content-routes-smoke.
 */

let app: import("express").Express;
let limiter: (typeof import("../../server/src/shared/rate-limit.js"))["eventsLimiter"];

const VALID_EVENT = "client.registration.verification_initiated";

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  // Generous ceiling so the limiter does not interfere with the other assertions.
  process.env.RATE_LIMIT_EVENTS_PER_HOUR ??= "10000";
  app = (await import("../../server/src/app.js")).createApp();
  ({ eventsLimiter: limiter } = await import("../../server/src/shared/rate-limit.js"));
});

beforeEach(() => limiter.reset());

describe("SECREG-PRV-7: attribution cannot be asserted by the caller", () => {
  it("test_PRV7_a_client_supplied_actorProfileId_is_refused", async () => {
    // The whole finding in one request: an anonymous caller attributing an event to
    // someone else's profile. Every per-user metric was forgeable by anyone.
    const res = await request(app)
      .post("/events")
      .send({
        eventType: VALID_EVENT,
        actorProfileId: "00000000-0000-4000-8000-000000000001",
      });
    expect(res.status).toBe(400);
  });

  it("test_PRV7_an_anonymous_event_is_still_accepted", async () => {
    // It must stay open: the registration funnel happens before anyone has a session.
    const res = await request(app).post("/events").send({ eventType: VALID_EVENT });
    expect(res.status).toBe(202);
  });

  it("test_PRV7_a_garbage_bearer_token_does_not_reject_the_event", async () => {
    // Attribution is best-effort. An unusable token means anonymous, not an error —
    // otherwise an expired session would start losing funnel data.
    const res = await request(app)
      .post("/events")
      .set("authorization", "Bearer not-a-real-token")
      .send({ eventType: VALID_EVENT });
    expect(res.status).toBe(202);
  });
});

describe("SECREG-PRV-7: event names are enumerated, not free text", () => {
  it("test_PRV7_an_unknown_event_type_is_refused", async () => {
    const res = await request(app).post("/events").send({ eventType: "attacker.made.this.up" });
    expect(res.status).toBe(400);
  });

  it("test_PRV7_every_event_the_client_actually_emits_is_accepted", async () => {
    // Guards the other direction: an allowlist that rejects real traffic is a silently
    // missing metric. These names are the emitEvent() calls in client/src.
    for (const eventType of [
      "client.registration.verification_initiated",
      "client.registration.verification_resent",
      "client.registration.verification_confirmed",
      "client.content.question_submitted",
      "client.content.answer_submitted",
    ]) {
      const res = await request(app).post("/events").send({ eventType });
      expect(res.status, eventType).toBe(202);
    }
  });

  it("test_PRV7_a_server_side_event_name_is_not_accepted_over_the_network", async () => {
    // Server instrumentation writes directly via emit(); accepting its names here would
    // let a caller forge "registration.verification_confirmed" and corrupt the funnel.
    const res = await request(app).post("/events").send({ eventType: "registration.verification_confirmed" });
    expect(res.status).toBe(400);
  });
});

describe("SECREG-PRV-7: metadata is bounded", () => {
  it("test_PRV7_an_email_address_in_metadata_is_refused", async () => {
    // The one that matters most: this table is append-only and nothing deletes from it,
    // so an accepted address is retained indefinitely — in the one database whose entire
    // design goal is to not contain them.
    const res = await request(app)
      .post("/events")
      .send({ eventType: VALID_EVENT, metadata: { note: "contact me at someone@nitj.ac.in" } });
    expect(res.status).toBe(400);
  });

  it("test_PRV7_nested_objects_are_refused", () => {
    // The easiest way to smuggle bulk content past a per-value length cap.
    expect(sanitizeMetadata({ nested: { a: 1 } }).ok).toBe(false);
    expect(sanitizeMetadata({ arr: [1, 2, 3] }).ok).toBe(false);
  });

  it("test_PRV7_key_count_and_value_length_are_capped", () => {
    const tooManyKeys = Object.fromEntries(
      Array.from({ length: METADATA_MAX_KEYS + 1 }, (_, i) => [`k${i}`, 1]),
    );
    expect(sanitizeMetadata(tooManyKeys).ok).toBe(false);
    expect(sanitizeMetadata({ big: "x".repeat(METADATA_MAX_VALUE_LENGTH + 1) }).ok).toBe(false);
  });

  it("test_PRV7_ordinary_primitive_metadata_still_works", () => {
    // T51 needs this endpoint to keep functioning; a sanitizer that refuses everything
    // would close the finding by breaking the feature.
    const result = sanitizeMetadata({ moderationStatus: "pending", count: 3, ok: true });
    expect(result).toEqual({ ok: true, value: { moderationStatus: "pending", count: 3, ok: true } });
  });
});

describe("SECREG-SEC-007: the ingest has a ceiling", () => {
  it("test_SEC007_events_endpoint_refuses_past_its_per_caller_budget", async () => {
    const { FixedWindowLimiter } = await import("../../server/src/shared/rate-limit.js");
    const tiny = new FixedWindowLimiter("t", 2, 60_000);
    expect([tiny.check("c"), tiny.check("c"), tiny.check("c")]).toEqual([true, true, false]);
  });
});
