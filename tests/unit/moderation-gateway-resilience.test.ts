import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderUnavailableError } from "../../server/src/modules/moderation/moderation.types.js";
import type {
  ClassifyInput,
  ModerationProvider,
  ProviderVerdict,
} from "../../server/src/modules/moderation/moderation.types.js";

/**
 * SECREG-RES-1 / SECREG-RES-3 — the two T63 resilience findings on the moderation gateway.
 *
 * Both are about the same invariant from a different angle: **an item that cannot be
 * classified must still end up in front of a human.** R6 AC3. Content that is held with no
 * route to a decision is invisible by construction — no user sees it, no query surfaces
 * it, and nothing alerts on it — so it is the failure most likely to go unnoticed.
 *
 * DB-free: `repo` is mocked so these run in the no-DB unit subset, and so the assertions
 * are about the gateway's control flow rather than about SQL.
 */

const recordVerdict = vi.fn();
const recordFailedAttempt = vi.fn();
const escalateToHuman = vi.fn();

vi.mock("../../server/src/modules/moderation/moderation.repo.js", () => ({
  recordVerdict: (...a: unknown[]) => recordVerdict(...a),
  recordFailedAttempt: (...a: unknown[]) => recordFailedAttempt(...a),
  escalateToHuman: (...a: unknown[]) => escalateToHuman(...a),
  openCase: vi.fn(),
}));

// applyVerdict opens a transaction; make it run the callback against a stub client whose
// UPDATEs succeed, so a *verdict* path does not need Postgres either.
vi.mock("../../server/src/db/pool.js", () => ({
  pool: {},
  withTransaction: async (fn: (c: unknown) => Promise<unknown>) =>
    fn({ query: async () => ({ rowCount: 1, rows: [] }) }),
}));

/** A provider that returns whatever it is handed — including things a vendor should not. */
function providerReturning(verdict: unknown, name = "rogue"): ModerationProvider {
  return {
    name,
    classify: async (_input: ClassifyInput) => verdict as ProviderVerdict,
  };
}

let classifyAndApply: typeof import("../../server/src/modules/moderation/moderation.gateway.js")["classifyAndApply"];
let setProvidersForTest: typeof import("../../server/src/modules/moderation/providers/index.js")["setProvidersForTest"];
let maxAttempts: number;

const REF = { type: "question", id: "00000000-0000-4000-8000-000000000001" } as const;
const INPUT: ClassifyInput = { text: "how are placements?", contentType: "question" };

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  ({ classifyAndApply } = await import(
    "../../server/src/modules/moderation/moderation.gateway.js"
  ));
  ({ setProvidersForTest } = await import(
    "../../server/src/modules/moderation/providers/index.js"
  ));
  ({ moderationMaxAttempts: maxAttempts } = (
    await import("../../server/src/config/index.js")
  ).config);
});

beforeEach(() => {
  recordVerdict.mockReset().mockResolvedValue(undefined);
  recordFailedAttempt.mockReset().mockResolvedValue(undefined);
  escalateToHuman.mockReset().mockResolvedValue(undefined);
});

describe("SECREG-RES-1: a malformed provider verdict is treated as no verdict", () => {
  const unusable: [string, unknown][] = [
    ["undefined tier", { tier: undefined, label: null, score: null, providerCaseRef: null, raw: {} }],
    ["a tier the enum does not contain", { tier: "probably_fine", label: null, score: null, providerCaseRef: null, raw: {} }],
    ["null instead of a verdict", null],
    ["a bare string", "auto_pass"],
  ];

  for (const [name, verdict] of unusable) {
    it(`test_RES1_${name.replace(/[^a-z]+/gi, "_")}_holds_instead_of_crashing`, async () => {
      setProvidersForTest(providerReturning(verdict));

      const outcome = await classifyAndApply(REF, "case-1", INPUT);

      // The old behaviour: TIER_TO_STATUS[undefined] -> undefined -> NOT NULL violation
      // deep in recordVerdict, surfacing as a 500 instead of a moderation decision.
      expect(outcome.held).toBe(true);
      expect(outcome.status).toBe("pending");
      expect(recordVerdict).not.toHaveBeenCalled();
      // Critically it took the *unavailable* path, so the attempt counts toward escalation.
      expect(recordFailedAttempt).toHaveBeenCalledOnce();
    });
  }

  it("test_RES1_a_well_formed_verdict_still_publishes", async () => {
    // The guard must not swallow good verdicts — otherwise it would quietly become a
    // second hold-all and nothing would ever publish even after T14b.
    setProvidersForTest(
      providerReturning({ tier: "auto_pass", label: null, score: null, providerCaseRef: null, raw: {} }),
    );

    const outcome = await classifyAndApply(REF, "case-ok", INPUT);

    expect(outcome.status).toBe("published");
    expect(outcome.held).toBe(false);
    expect(recordVerdict).toHaveBeenCalledOnce();
  });
});

describe("SECREG-RES-3: every failure advances the attempt counter", () => {
  /** A provider that fails in a way the gateway does NOT model — the RES-3 case. */
  const unexpectedFailure: ModerationProvider = {
    name: "explodes",
    classify: async () => {
      throw new TypeError("cannot read properties of undefined (reading 'tier')");
    },
  };

  it("test_RES3_a_non_provider_error_records_the_attempt_instead_of_rethrowing", async () => {
    setProvidersForTest(unexpectedFailure);

    // Previously this rethrew, skipping recordFailedAttempt entirely: the counter froze,
    // the ceiling was unreachable, and the retry worker re-ran the same failure forever
    // while the item stayed invisible with no path to a human.
    const outcome = await classifyAndApply(REF, "case-2", INPUT);

    expect(outcome.held).toBe(true);
    expect(recordFailedAttempt).toHaveBeenCalledOnce();
  });

  it("test_RES3_a_non_provider_error_still_escalates_at_the_ceiling", async () => {
    setProvidersForTest(unexpectedFailure);

    const outcome = await classifyAndApply(REF, "case-3", INPUT, maxAttempts - 1);

    // The property R6 AC3 actually depends on: the human queue is reachable by EVERY
    // route into the failure path, not just the one the gateway anticipated.
    expect(escalateToHuman).toHaveBeenCalledOnce();
    expect(outcome.riskTier).toBe("escalate");
    expect(outcome.held).toBe(true);
  });

  it("test_RES3_a_provider_outage_still_escalates_at_the_ceiling", async () => {
    // The path that always worked — kept so a future refactor cannot fix one and break
    // the other.
    setProvidersForTest({
      name: "down",
      classify: async () => {
        throw new ProviderUnavailableError("down", "connect ECONNREFUSED");
      },
    });

    const outcome = await classifyAndApply(REF, "case-4", INPUT, maxAttempts - 1);

    expect(escalateToHuman).toHaveBeenCalledOnce();
    expect(outcome.riskTier).toBe("escalate");
  });

  it("test_RES3_nothing_publishes_on_any_failure_path", async () => {
    // The invariant underneath both findings.
    for (const provider of [unexpectedFailure, providerReturning({ tier: "nonsense" })]) {
      setProvidersForTest(provider);
      const outcome = await classifyAndApply(REF, "case-5", INPUT);
      expect(outcome.status).not.toBe("published");
    }
  });

  it("test_RES3_bookkeeping_failure_still_reports_held_and_never_publishes", async () => {
    // If the database is unreachable the attempt cannot be recorded. That must not become
    // an exception that unwinds past the caller, and must certainly not publish.
    setProvidersForTest(unexpectedFailure);
    recordFailedAttempt.mockRejectedValueOnce(new Error("connection terminated"));

    const outcome = await classifyAndApply(REF, "case-6", INPUT);

    expect(outcome.held).toBe(true);
    expect(outcome.status).toBe("pending");
  });
});
