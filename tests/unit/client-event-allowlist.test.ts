import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLIENT_EVENT_TYPES } from "../../server/src/modules/analytics/client-events.js";

/**
 * T45 — every event the client sends is one the server will actually accept.
 *
 * `client-events.ts` says it in a comment: *"Keep it in step with the `emitEvent(...)` calls in
 * `client/src/`. A name missing here is a dropped metric."* A comment is what this project has
 * repeatedly discovered does not hold — the placeholder pepper, the console mailer, the blank
 * encryption key were all guarded by one.
 *
 * The failure this catches is the quietest kind there is. A client shipping an event the
 * allowlist does not contain gets a 400 it never looks at, because `emitEvent` is
 * fire-and-forget by design. Nothing breaks, nothing is logged client-side, and the metric is
 * simply absent — discovered at T46 (M6), with the milestone that produced it long closed.
 *
 * Static, so it needs no browser, no database, and no running client.
 */

const CLIENT_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/src",
);

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return tsFilesUnder(full);
    return full.endsWith(".ts") && !full.endsWith(".d.ts") ? [full] : [];
  });
}

/**
 * `emitEvent("some.name")` with a literal argument. Deliberately only literals: a name built
 * at runtime cannot be checked here, and the assertion below turns that into a visible failure
 * rather than a silent gap in this test's own coverage.
 */
const LITERAL_CALL = /emitEvent\(\s*["'`]([^"'`]+)["'`]/g;
const ANY_CALL = /emitEvent\(/g;
/** The declaration in api.ts, and the one call that forwards a name it was given. */
const KNOWN_NON_LITERAL_CALLS = 0;

describe("the client's event names and the server's allowlist", () => {
  const files = tsFilesUnder(CLIENT_SRC);

  it("finds the client source, so an empty sweep cannot pass vacuously", () => {
    // Without this the whole suite would go green if the path were ever wrong — which is the
    // failure mode of every check that iterates over something it found for itself.
    expect(files.length).toBeGreaterThan(5);
  });

  const emitted = new Map<string, string>();
  let nonLiteralCalls = 0;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    // The declaration itself is `export function emitEvent(`, not a call.
    const declarations = /(export\s+)?function\s+emitEvent\(/g.test(source) ? 1 : 0;
    const calls = source.match(ANY_CALL)?.length ?? 0;
    let literals = 0;
    for (const m of source.matchAll(LITERAL_CALL)) {
      emitted.set(m[1]!, path.relative(CLIENT_SRC, file));
      literals += 1;
    }
    nonLiteralCalls += calls - declarations - literals;
  }

  it("sends only names the server accepts", () => {
    const unknown = [...emitted].filter(([name]) => !CLIENT_EVENT_TYPES.has(name));
    // Named in the failure, so the fix is obvious without opening either file.
    expect(
      unknown.map(([name, file]) => `${name} (sent from ${file})`),
    ).toEqual([]);
  });

  it("has no event name built at runtime, which this check could not see", () => {
    // `startActivityPing(document, emitEvent)` passes the function itself and sends
    // PING_EVENT_TYPE, which is asserted separately below. Anything else constructing a name
    // dynamically would be invisible to the sweep above, so it fails here instead of quietly
    // reducing what this test covers.
    expect(nonLiteralCalls).toBe(KNOWN_NON_LITERAL_CALLS);
  });

  it("covers the one name passed indirectly", async () => {
    const { PING_EVENT_TYPE } = await import("../../client/src/activity-ping.js");
    expect(CLIENT_EVENT_TYPES.has(PING_EVENT_TYPE)).toBe(true);
  });

  it("still carries the whole registration funnel", () => {
    // The funnel T45 exists to record. Asserted by name rather than by count, so removing one
    // reads as the metric it is rather than as an off-by-one.
    for (const name of [
      "client.registration.verification_initiated",
      "client.registration.verification_resent",
      "client.registration.verification_confirmed",
    ]) {
      expect(emitted.has(name)).toBe(true);
    }
  });
});
