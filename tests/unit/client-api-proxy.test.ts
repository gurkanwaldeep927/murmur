import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every API path the client calls must be forwarded by the vite dev proxy.
 *
 * This exists because of a real bug on 2026-08-02. `/session` was never in the proxy
 * list, so `POST /session/exchange` was answered by the vite dev server itself with
 * `index.html`. The client got a 200 full of HTML, `JSON.parse` threw, an empty catch
 * swallowed it, and the only symptom was the user seeing their pseudonym and batch badge
 * and then landing straight back on the sign-up screen. `/topics` was missing too, which
 * would have broken S6's topic chips the same way.
 *
 * Nothing else could catch it: the routes exist, the tests pass, typecheck passes, CI
 * passes — the gap is between two config files that never referenced each other. So the
 * check is a string comparison between them, which is all it needs to be.
 */

const root = fileURLToPath(new URL("../../", import.meta.url));
const apiSource = readFileSync(`${root}client/src/api.ts`, "utf8");
const viteConfig = readFileSync(`${root}client/vite.config.ts`, "utf8");

/**
 * Every root-relative path literal in the client's API module, reduced to its first
 * segment.
 *
 * Both call shapes have to be covered: the direct `fetch(`${API_BASE}/session/exchange`)`
 * form AND the far more common `post("/verification/initiate", …)` / `get(`/questions…`)`
 * form, where the path is an argument to a helper that prepends API_BASE itself. An
 * earlier version of this matched only the first shape, found 2 paths out of 6, and would
 * have passed while missing the exact route that broke.
 */
function pathsCalledByClient(): string[] {
  const found = new Set<string>();
  const patterns = [
    /["'`](\/[a-zA-Z0-9\-_/]*)/g, // helper args:  post("/verification/initiate", …)
    /\$\{API_BASE\}(\/[a-zA-Z0-9\-_/]*)/g, // direct fetch: `${API_BASE}/session/exchange`
  ];
  for (const pattern of patterns) {
    for (const m of apiSource.matchAll(pattern)) {
      const first = m[1]!.split("/")[1];
      if (first) found.add(`/${first}`);
    }
  }
  return [...found].sort();
}

/** Every prefix listed in the dev-server proxy table. */
function prefixesProxied(): string[] {
  const block = /proxy:\s*\{([\s\S]*?)\n\s*\},/.exec(viteConfig);
  if (!block) throw new Error("could not locate the proxy block in client/vite.config.ts");
  return [...block[1]!.matchAll(/"(\/[a-zA-Z0-9\-_]+)"\s*:/g)].map((m) => m[1]!).sort();
}

describe("vite dev proxy covers the client's API surface", () => {
  it("test_every_api_path_the_client_calls_is_proxied_in_dev", () => {
    const proxied = prefixesProxied();
    const missing = pathsCalledByClient().filter((p) => !proxied.includes(p));

    // A missing prefix does not fail loudly at runtime — vite serves index.html and the
    // failure surfaces as a JSON parse error somewhere unrelated. Name them here instead.
    expect(missing, `not forwarded by the dev proxy: ${missing.join(", ")}`).toEqual([]);
  });

  it("test_the_paths_that_regressed_are_pinned_explicitly", () => {
    const proxied = prefixesProxied();
    // /session broke sign-in; /topics would have broken the composer. Pinned by name so
    // a future edit to the proxy table cannot quietly drop them again.
    expect(proxied).toContain("/session");
    expect(proxied).toContain("/topics");
    expect(proxied).toContain("/questions");
    expect(proxied).toContain("/verification");
  });

  it("test_the_extractors_actually_found_something", () => {
    // Guards against the regexes silently matching nothing and the suite passing vacuously
    // — the failure mode that makes a check like this worse than none at all.
    expect(pathsCalledByClient().length).toBeGreaterThanOrEqual(4);
    expect(prefixesProxied().length).toBeGreaterThanOrEqual(4);
  });
});
