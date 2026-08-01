import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { holdAllProvider } from "../../server/src/modules/moderation/providers/hold-all.provider.js";
import { fixtureProvider } from "../../server/src/modules/moderation/providers/fixture.provider.js";
import { ProviderUnavailableError } from "../../server/src/modules/moderation/moderation.types.js";

/**
 * T14a provider-port unit tests. DB-free by design — these pin the two adapters that
 * exist before any vendor is bound (T14b/M6), so they must run in the no-DB unit subset.
 */

describe("hold-all provider (the unconfigured default)", () => {
  it("test_R6_holdall_never_returns_a_verdict", async () => {
    await expect(
      holdAllProvider.classify({ text: "anything at all", contentType: "question" }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("test_R6_holdall_refuses_benign_content_too", async () => {
    // The point worth pinning: it is not a filter with a permissive default. There is no
    // input for which it returns a verdict, which is what makes "nothing publishes
    // without a provider" a property of the code rather than of the content.
    for (const text of ["", "hello", "how are placements at NITJ?"]) {
      await expect(
        holdAllProvider.classify({ text, contentType: "question" }),
      ).rejects.toBeInstanceOf(ProviderUnavailableError);
    }
  });
});

describe("fixture provider (test-only)", () => {
  it("test_fixture_defaults_to_auto_pass_when_unmarked", async () => {
    const v = await fixtureProvider.classify({
      text: "Which companies visit for core mechanical roles?",
      contentType: "question",
    });
    expect(v.tier).toBe("auto_pass");
  });

  it("test_fixture_honours_each_marker", async () => {
    const cases = [
      ["[[moderation:pass]] fine", "auto_pass"],
      ["[[moderation:block]] abusive", "auto_block"],
      ["[[moderation:escalate]] ambiguous", "escalate"],
    ] as const;
    for (const [text, tier] of cases) {
      const v = await fixtureProvider.classify({ text, contentType: "answer" });
      expect(v.tier).toBe(tier);
    }
  });

  it("test_fixture_timeout_marker_raises_provider_unavailable", async () => {
    await expect(
      fixtureProvider.classify({ text: "[[moderation:timeout]]", contentType: "question" }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("test_fixture_is_deterministic", async () => {
    const input = { text: "[[moderation:escalate]] same input", contentType: "question" } as const;
    const a = await fixtureProvider.classify(input);
    const b = await fixtureProvider.classify(input);
    expect(a.tier).toBe(b.tier);
    expect(a.score).toBe(b.score);
  });
});

/**
 * SECREG-RES-2 — provider resolution must happen at process startup.
 *
 * `resolve()` throws a deliberate, loud error for an unknown or test-only provider, and
 * its comment says it "fails at startup". Nothing called it at startup: resolution was
 * lazy, inside `classifyTiered`, so a deployment naming a provider that does not exist
 * booted green, passed its health check, and broke only when a student first posted.
 *
 * The assertion is structural because the defect was structural — the logic was already
 * correct, it just was not reachable from the entrypoints. Nothing else in the suite can
 * observe "was this called before the port opened".
 */
describe("SECREG-RES-2: providers are bound at startup", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const entrypoints = ["server/src/index.ts", "server/src/worker/index.ts"];

  for (const file of entrypoints) {
    it(`test_RES2_${file.replace(/[^a-z]+/gi, "_")}_binds_providers_before_serving`, () => {
      const src = readFileSync(`${root}${file}`, "utf8");
      expect(src).toContain("initModerationProviders");
    });
  }

  it("test_RES2_the_init_seam_is_exported", async () => {
    const mod = await import("../../server/src/modules/moderation/providers/index.js");
    expect(typeof mod.initModerationProviders).toBe("function");
  });
});
