import {
  ProviderUnavailableError,
  type ClassifyInput,
  type ModerationProvider,
  type ProviderVerdict,
} from "../moderation.types.js";

/**
 * Deterministic test double. **Test environment only** — `resolveProvider()` refuses to
 * construct it unless NODE_ENV === "test", so it cannot be switched on in development,
 * staging, or production even by setting MODERATION_PROVIDER=fixture.
 *
 * Why it exists: with only the hold-all default, no test could exercise the auto-pass or
 * auto-block branches of the gateway, and T15/T16/T19/T56 would be untestable until a
 * vendor was chosen — which would defeat the point of the T14a/T14b split. This is the
 * narrowest thing that unblocks them: it is not a bypass, because it produces verdicts
 * the gateway then applies through exactly the same code as a real provider's.
 *
 * Verdicts are driven by a marker in the text so a test states its intent inline:
 *   [[moderation:pass]]      → auto_pass
 *   [[moderation:block]]     → auto_block
 *   [[moderation:escalate]]  → escalate
 *   [[moderation:timeout]]   → ProviderUnavailableError (the outage drill's lever)
 * With no marker, content auto-passes — so a test that says nothing about moderation
 * gets published content and reads clearly.
 */

const MARKER = /\[\[moderation:(pass|block|escalate|timeout)\]\]/i;

export const fixtureProvider: ModerationProvider = {
  name: "fixture",

  classify(input: ClassifyInput): Promise<ProviderVerdict> {
    const marker = MARKER.exec(input.text)?.[1]?.toLowerCase();

    if (marker === "timeout") {
      return Promise.reject(
        new ProviderUnavailableError("fixture", "fixture provider: simulated timeout"),
      );
    }

    const tier =
      marker === "block" ? "auto_block" : marker === "escalate" ? "escalate" : "auto_pass";

    return Promise.resolve({
      tier,
      label: `fixture_${tier}`,
      score: tier === "auto_pass" ? 0.01 : tier === "escalate" ? 0.5 : 0.99,
      providerCaseRef: null,
      raw: { provider: "fixture", marker: marker ?? "none", contentType: input.contentType },
    });
  },
};
