import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T51 — the client half of the WAU signal.
 *
 * `session.resumed` is emitted server-side when the PWA boots and calls `GET /session`.
 * That is the only session signal there is, and a PWA is installed precisely so it does
 * not have to be reopened: a tab left running for a week produces one event and reads as
 * inactive for the following six days. WAU would under-report exactly the most engaged
 * users, which is the wrong direction for a metric meant to prove the product is used.
 *
 * The throttle is the part worth pinning. `analytics_event` is append-only (PRV-1), so an
 * unthrottled listener would write a permanent row every time a user flipped between apps.
 *
 * The suite runs under `environment: "node"`, so `document` is stubbed rather than
 * provided by jsdom, and `./api` is mocked so nothing reaches the network.
 */

const emitEvent = vi.fn();
vi.mock("../../client/src/api", () => ({ emitEvent: (...args: unknown[]) => emitEvent(...args) }));

interface FakeDoc {
  visibilityState: "visible" | "hidden";
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
  fire: (type: string) => void;
}

function fakeDocument(): FakeDoc {
  const listeners = new Map<string, Set<() => void>>();
  return {
    visibilityState: "visible",
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    fire(type) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
  };
}

let doc: FakeDoc;
let now: number;

beforeEach(() => {
  emitEvent.mockClear();
  now = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  doc = fakeDocument();
  (globalThis as { document?: unknown }).document = doc;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { document?: unknown }).document;
});

const load = () => import("../../client/src/activity-ping.js");

describe("T51: client activity ping", () => {
  it("test_R8_returning_to_the_foreground_after_an_hour_pings", async () => {
    const { startActivityPing, PING_MIN_INTERVAL_MS } = await load();
    startActivityPing();

    now += PING_MIN_INTERVAL_MS;
    doc.fire("visibilitychange");

    expect(emitEvent).toHaveBeenCalledTimes(1);
    // The event name must be on the server's CLIENT_EVENT_TYPES allowlist or the ingest
    // route returns 400 and the metric is silently missing (PRV-7 / SEC-009).
    expect(emitEvent).toHaveBeenCalledWith("client.session.ping");
  });

  it("test_R8_app_switching_within_the_hour_writes_nothing", async () => {
    const { startActivityPing } = await load();
    startActivityPing();

    for (let i = 0; i < 20; i += 1) {
      now += 60_000; // a minute apart — twenty minutes of flipping between apps
      doc.fire("visibilitychange");
    }

    expect(emitEvent).not.toHaveBeenCalled();
  });

  it("test_R8_going_to_the_background_is_not_activity", async () => {
    const { startActivityPing, PING_MIN_INTERVAL_MS } = await load();
    startActivityPing();

    doc.visibilityState = "hidden";
    now += PING_MIN_INTERVAL_MS * 2;
    doc.fire("visibilitychange");

    expect(emitEvent).not.toHaveBeenCalled();
  });

  it("test_R8_the_clock_restarts_after_each_ping", async () => {
    const { startActivityPing, PING_MIN_INTERVAL_MS } = await load();
    startActivityPing();

    now += PING_MIN_INTERVAL_MS;
    doc.fire("visibilitychange");
    now += PING_MIN_INTERVAL_MS - 1;
    doc.fire("visibilitychange"); // one millisecond short — must not fire
    expect(emitEvent).toHaveBeenCalledTimes(1);

    now += 1;
    doc.fire("visibilitychange");
    expect(emitEvent).toHaveBeenCalledTimes(2);
  });

  it("test_R8_boot_does_not_double_count_the_session_resumed_the_server_just_wrote", async () => {
    // The clock starts at mount, not at zero: the server has just recorded
    // `session.resumed` for this same app open, and a ping on the first foreground event
    // would count one open twice.
    const { startActivityPing } = await load();
    startActivityPing();

    doc.fire("visibilitychange");

    expect(emitEvent).not.toHaveBeenCalled();
  });

  it("test_R8_teardown_stops_the_listener", async () => {
    const { startActivityPing, PING_MIN_INTERVAL_MS } = await load();
    const stop = startActivityPing();
    stop();

    now += PING_MIN_INTERVAL_MS * 3;
    doc.fire("visibilitychange");

    expect(emitEvent).not.toHaveBeenCalled();
  });
});
