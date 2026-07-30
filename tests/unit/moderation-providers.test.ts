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
