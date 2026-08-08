import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * T23 — the ban check must fail CLOSED.
 *
 * Until T23 this function caught Postgres 42P01 (undefined_table) and returned "not
 * banned", because the lookup was built in M1 while `ban_record` only arrived with
 * migration 003 in M3. That was correct exactly until the table existed. It exists now.
 *
 * This test is the pin. If anyone reintroduces a catch around the lookup — for any
 * sympathetic reason, "so registration doesn't break" being the most likely — the result
 * is a path where a database problem silently readmits every banned person, with nothing
 * reporting it. That is the failure shape this project has paid for five times
 * (docs/TASK-STATUS.md, problems 8–11e): the guard stops working and its silence reads
 * exactly like success.
 *
 * No database: the whole claim is about what happens when the query fails, so a stub
 * client that fails is a better instrument than a real one that works.
 */

let checkBanByNormalizedEmail: typeof import("../../server/src/modules/identity/ban-check.js").checkBanByNormalizedEmail;

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE ??= "v1:test-pepper";
  ({ checkBanByNormalizedEmail } = await import(
    "../../server/src/modules/identity/ban-check.js"
  ));
});

function clientThatFailsWith(code: string) {
  const err = Object.assign(new Error(`relation "ban_record" does not exist`), { code });
  return { query: vi.fn().mockRejectedValue(err) } as never;
}

function clientReturning(rows: Array<{ ban_reason: string | null }>) {
  return { query: vi.fn().mockResolvedValue({ rows }) } as never;
}

describe("A11 ban check", () => {
  it("propagates a missing ban_record instead of answering 'not banned'", async () => {
    await expect(
      checkBanByNormalizedEmail(clientThatFailsWith("42P01"), "someone@nitj.ac.in"),
    ).rejects.toThrow(/ban_record/);
  });

  it("propagates any other database failure too", async () => {
    await expect(
      checkBanByNormalizedEmail(clientThatFailsWith("53300"), "someone@nitj.ac.in"),
    ).rejects.toThrow();
  });

  it("issues no SAVEPOINT — the probe it protected is gone", async () => {
    // Not cosmetic: the savepoint cost a round trip on every registration, and its
    // presence is the tell that the swallow-the-error path came back.
    const client = clientReturning([]);
    await checkBanByNormalizedEmail(client, "someone@nitj.ac.in");
    const statements = (client as unknown as { query: { mock: { calls: unknown[][] } } }).query.mock
      .calls.map((c) => String(c[0]));
    expect(statements).toHaveLength(1);
    expect(statements[0]).not.toMatch(/SAVEPOINT/i);
  });

  it("reports a match with its reason, and a clean miss without one", async () => {
    expect(await checkBanByNormalizedEmail(clientReturning([]), "a@nitj.ac.in")).toEqual({
      banned: false,
      reason: null,
    });
    expect(
      await checkBanByNormalizedEmail(clientReturning([{ ban_reason: "harassment" }]), "a@nitj.ac.in"),
    ).toEqual({ banned: true, reason: "harassment" });
  });

  it("asks about every pepper version, not only the active one", async () => {
    // RR-13: a ban written before a pepper rotation must still match afterwards.
    const client = clientReturning([]);
    await checkBanByNormalizedEmail(client, "someone@nitj.ac.in");
    const params = (client as unknown as { query: { mock: { calls: unknown[][] } } }).query.mock
      .calls[0]![1] as string[][];
    expect(Array.isArray(params[0])).toBe(true);
    expect(params[0]!.length).toBeGreaterThanOrEqual(1);
  });
});
