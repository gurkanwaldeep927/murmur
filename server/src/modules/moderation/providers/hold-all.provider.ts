import {
  ProviderUnavailableError,
  type ClassifyInput,
  type ModerationProvider,
  type ProviderVerdict,
} from "../moderation.types.js";

/**
 * The default provider when `MODERATION_PROVIDER` is unset — which is every
 * environment until T14b (M6) binds a real vendor.
 *
 * It classifies nothing. It always reports itself unavailable, so the gateway takes
 * its fail-closed branch and holds the content `pending`. Nothing publishes.
 *
 * This is R6 ("no UGC bypasses moderation") enforced structurally rather than stated:
 * there is no configuration of this service, and no ordering of its startup, in which
 * an absent provider results in published content. The plan's fourth revision (§1)
 * depends on exactly this property — it is what let T14 split so that T15/T16/T19/T56
 * could be built before a vendor was chosen.
 */
export const holdAllProvider: ModerationProvider = {
  name: "hold-all",

  classify(_input: ClassifyInput): Promise<ProviderVerdict> {
    return Promise.reject(
      new ProviderUnavailableError(
        "hold-all",
        "no moderation provider configured — holding content pending (fail-closed)",
      ),
    );
  },
};
