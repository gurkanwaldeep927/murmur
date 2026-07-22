import crypto from "node:crypto";

/**
 * Pseudonym generation for the Pseudonymous Profile Manager (TRD §4, R2).
 * Produces a persistent, human-readable handle unlinked to the real identity.
 * Uniqueness is enforced by the pseudonymous_profile.pseudonym UNIQUE constraint;
 * the service retries generation on collision.
 */

const ADJECTIVES = [
  "quiet", "brave", "clever", "swift", "calm", "bold", "keen", "bright", "steady", "witty",
  "mellow", "nimble", "candid", "eager", "gentle", "lucid", "plucky", "rapid", "sunny", "vivid",
];

const NOUNS = [
  "otter", "falcon", "cedar", "harbor", "quartz", "meadow", "lantern", "pixel", "comet", "willow",
  "cobalt", "ember", "delta", "maple", "orbit", "pebble", "raven", "sable", "tundra", "zephyr",
];

function pick<T>(arr: readonly T[]): T {
  const i = crypto.randomInt(0, arr.length);
  return arr[i]!;
}

/** Generate a candidate pseudonym, e.g. "quiet-otter-4821". */
export function generatePseudonym(): string {
  const n = crypto.randomInt(1000, 10000);
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${n}`;
}
