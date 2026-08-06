import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PING_EVENT_TYPE,
  PING_MIN_INTERVAL_MS,
  startActivityPing,
  type VisibilityDocument,
} from "../../client/src/activity-ping.js";

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
 * The module takes its document and its sender as arguments, so this suite needs neither a
 * DOM nor a module mock — it hands over a fake and reads what came back.
 */

interface FakeDoc extends VisibilityDocument {
  visibilityState: string;
  fire: () => void;
}

function fakeDocument(): FakeDoc {
  const listeners = new Set<() => void>();
  return {
    visibilityState: "visible",
    addEventListener: (_type, fn) => void listeners.add(fn),
    removeEventListener: (_type, fn) => void listeners.delete(fn),
    fire: () => listeners.forEach((fn) => fn()),
  };
}

const sent = vi.fn();
let doc: FakeDoc;
let now: number;

beforeEach(() => {
  sent.mockClear();
  now = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  doc = fakeDocument();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("T51: client activity ping", () => {
  it("test_R8_returning_to_the_foreground_after_an_hour_pings", () => {
    startActivityPing(doc, sent);

    now += PING_MIN_INTERVAL_MS;
    doc.fire();

    expect(sent).toHaveBeenCalledTimes(1);
    // The name must be on the server's CLIENT_EVENT_TYPES allowlist or the ingest route
    // answers 400 and the metric is silently missing (PRV-7 / SEC-009).
    expect(sent).toHaveBeenCalledWith("client.session.ping");
    expect(PING_EVENT_TYPE).toBe("client.session.ping");
  });

  it("test_R8_app_switching_within_the_hour_writes_nothing", () => {
    startActivityPing(doc, sent);

    for (let i = 0; i < 20; i += 1) {
      now += 60_000; // a minute apart — twenty minutes of flipping between apps
      doc.fire();
    }

    expect(sent).not.toHaveBeenCalled();
  });

  it("test_R8_going_to_the_background_is_not_activity", () => {
    startActivityPing(doc, sent);

    doc.visibilityState = "hidden";
    now += PING_MIN_INTERVAL_MS * 2;
    doc.fire();

    expect(sent).not.toHaveBeenCalled();
  });

  it("test_R8_the_clock_restarts_after_each_ping", () => {
    startActivityPing(doc, sent);

    now += PING_MIN_INTERVAL_MS;
    doc.fire();
    now += PING_MIN_INTERVAL_MS - 1;
    doc.fire(); // one millisecond short — must not fire
    expect(sent).toHaveBeenCalledTimes(1);

    now += 1;
    doc.fire();
    expect(sent).toHaveBeenCalledTimes(2);
  });

  it("test_R8_boot_does_not_double_count_the_session_resumed_the_server_just_wrote", () => {
    // The clock starts at mount, not at zero: the server has just recorded
    // `session.resumed` for this same app open, and a ping on the first foreground event
    // would count one open twice.
    startActivityPing(doc, sent);

    doc.fire();

    expect(sent).not.toHaveBeenCalled();
  });

  it("test_R8_teardown_stops_the_listener", () => {
    const stop = startActivityPing(doc, sent);
    stop();

    now += PING_MIN_INTERVAL_MS * 3;
    doc.fire();

    expect(sent).not.toHaveBeenCalled();
  });
});
