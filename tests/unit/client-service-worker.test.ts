import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const origin = "https://murmur.example";
interface WorkerRequest {
  url: string;
  method: string;
  mode: string;
  destination: string;
}
type CacheKey = string | WorkerRequest;
const keyOf = (key: CacheKey): string => new URL(typeof key === "string" ? key : key.url, origin).href;

function workerHarness() {
  const handlers = new Map<string, (event: unknown) => void>();
  const entries = new Map<string, Response>();
  const networkCalls: string[] = [];
  const precacheCalls: string[][] = [];
  const fixtures = new Map<string, string>();
  let network: (request: WorkerRequest) => Promise<Response> = async () => new Response("asset");
  const cache = {
    match: async (key: CacheKey) => entries.get(keyOf(key))?.clone(),
    put: async (key: CacheKey, response: Response) => { entries.set(keyOf(key), response.clone()); },
    addAll: async (urls: string[]) => {
      precacheCalls.push([...urls]);
      for (const url of urls) entries.set(keyOf(url), new Response(fixtures.get(keyOf(url)) ?? "fixture"));
    },
  };
  runInNewContext(readFileSync(new URL("../../client/public/service-worker.js", import.meta.url), "utf8"), {
    URL,
    self: {
      location: { origin, href: `${origin}/service-worker.js` },
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
      skipWaiting: () => undefined,
      clients: { claim: () => undefined },
    },
    caches: {
      open: async () => cache,
      match: cache.match,
      keys: async () => ["murmur-shell-v1"],
      delete: async () => true,
    },
    fetch: async (request: WorkerRequest) => {
      networkCalls.push(request.url);
      return network(request);
    },
  });
  return {
    entries,
    fixtures,
    precacheCalls,
    networkCalls,
    async install() {
      const tasks: Promise<unknown>[] = [];
      handlers.get("install")!({ waitUntil: (value: Promise<unknown>) => tasks.push(Promise.resolve(value)) });
      await Promise.all(tasks);
    },
    setNetwork: (next: typeof network) => { network = next; },
    async dispatch(overrides: Partial<WorkerRequest> = {}) {
      const request: WorkerRequest = { url: `${origin}/assets/app.js`, method: "GET", mode: "no-cors", destination: "script", ...overrides };
      let response: Promise<Response> | undefined;
      const tasks: Promise<unknown>[] = [];
      handlers.get("fetch")!({
        request,
        respondWith: (value: Promise<Response>) => { response = Promise.resolve(value); },
        waitUntil: (value: Promise<unknown>) => tasks.push(Promise.resolve(value)),
      });
      if (!response) return { intercepted: false as const };
      const resolved = await response;
      await Promise.all(tasks);
      return { intercepted: true as const, response: resolved };
    },
  };
}

describe("regression OFFLINE-SHELL-1: real service worker offline shell", () => {
  it("regression_OFFLINE-SHELL-1_install_precaches_hashed_bundles_before_first_controlled_load", async () => {
    const h = workerHarness();
    h.fixtures.set(`${origin}/index.html`, '<html><script type="module" src="/assets/index-abc123.js"></script><link rel="stylesheet" href="/assets/index-def456.css"><link href="https://fonts.example/assets/font.css" rel="stylesheet"></html>');
    h.fixtures.set(`${origin}/assets/index-abc123.js`, "javascript bundle");
    h.fixtures.set(`${origin}/assets/index-def456.css`, "stylesheet bundle");
    await h.install();
    const requested = h.precacheCalls.flat().map((url) => keyOf(url));
    expect(requested).toContain(`${origin}/assets/index-abc123.js`);
    expect(requested).toContain(`${origin}/assets/index-def456.css`);
    expect(requested).not.toContain("https://fonts.example/assets/font.css");
    h.setNetwork(async () => { throw new Error("offline before first controlled load"); });
    for (const [path, destination, contents] of [["index-abc123.js", "script", "javascript bundle"], ["index-def456.css", "style", "stylesheet bundle"]] as const) {
      const result = await h.dispatch({ url: `${origin}/assets/${path}`, destination });
      expect(result.intercepted).toBe(true);
      if (!result.intercepted) throw new Error("Installed asset was not intercepted");
      expect(await result.response.text()).toBe(contents);
    }
    expect(h.networkCalls).toEqual([]);
  });
  it.each(["script", "style", "image", "font", "manifest", "worker"])(
    "regression_OFFLINE-SHELL-1_successful_same_origin_%s_is_available_offline",
    async (destination) => {
      const h = workerHarness();
      const url = `${origin}/assets/app-${destination}`;
      h.setNetwork(async () => new Response(`contents-${destination}`, { status: 200 }));
      const online = await h.dispatch({ url, destination });
      expect(online.intercepted).toBe(true);
      if (!online.intercepted) throw new Error("Asset was not intercepted");
      expect(await online.response.text()).toBe(`contents-${destination}`);
      h.setNetwork(async () => { throw new Error("offline"); });
      const offline = await h.dispatch({ url, destination });
      expect(offline.intercepted).toBe(true);
      if (!offline.intercepted) throw new Error("Offline asset was not intercepted");
      expect(await offline.response.text()).toBe(`contents-${destination}`);
    },
  );

  it("regression_OFFLINE-SHELL-1_offline_spa_navigation_uses_cached_index", async () => {
    const h = workerHarness();
    h.entries.set(`${origin}/index.html`, new Response("<html>app shell</html>"));
    h.setNetwork(async () => { throw new Error("offline"); });
    const result = await h.dispatch({ url: `${origin}/questions/a-question`, mode: "navigate", destination: "document" });
    expect(result.intercepted).toBe(true);
    if (!result.intercepted) throw new Error("SPA navigation was not intercepted");
    expect(await result.response.text()).toBe("<html>app shell</html>");
  });

  it("regression_OFFLINE-SHELL-1_unsuccessful_asset_response_does_not_poison_cache", async () => {
    const h = workerHarness();
    h.setNetwork(async () => new Response("temporary failure", { status: 500 }));
    const result = await h.dispatch();
    expect(result.intercepted).toBe(true);
    if (!result.intercepted) throw new Error("Asset was not intercepted");
    expect(result.response.status).toBe(500);
    expect(h.entries.size).toBe(0);
  });

  it.each(["/session", "/topics", "/health", "/questions", "/api/session", "/anything-new"])(
    "regression_OFFLINE-SHELL-1_fetch_xhr_%s_uses_default_network_without_interception",
    async (path) => {
      const h = workerHarness();
      expect(await h.dispatch({ url: `${origin}${path}`, mode: "cors", destination: "" })).toEqual({ intercepted: false });
      expect(h.networkCalls).toEqual([]);
      expect(h.entries.size).toBe(0);
    },
  );

  it.each(["POST", "PUT", "PATCH", "DELETE", "HEAD"])(
    "regression_OFFLINE-SHELL-1_non_get_%s_is_not_intercepted",
    async (method) => {
      const h = workerHarness();
      expect(await h.dispatch({ method })).toEqual({ intercepted: false });
      expect(h.networkCalls).toEqual([]);
    },
  );

  it("regression_OFFLINE-SHELL-1_cross_origin_asset_is_not_intercepted", async () => {
    const h = workerHarness();
    expect(await h.dispatch({ url: "https://cdn.example/app.js" })).toEqual({ intercepted: false });
    expect(h.networkCalls).toEqual([]);
    expect(h.entries.size).toBe(0);
  });
});
