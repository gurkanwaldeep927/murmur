import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_BATCH_ITEMS } from "../../client/src/lib/outbox.js";

/**
 * T28 — the numbers and codes the client and the server must agree on.
 *
 * Same shape as `client-api-proxy.test.ts`, and for the same reason: the gap is between two
 * files that never reference each other, so nothing but a string comparison can see it.
 * Every failure here is silent in production.
 *
 *  - **The batch cap.** Over it, A10 answers a WHOLE-BATCH 400. Not a partial success — the
 *    entire batch stays queued, every time, for ever. The outbox would simply stop draining
 *    and nothing would say why.
 *  - **The entity types.** A type the server's discriminated union does not carry fails the
 *    same whole-batch validation, taking every unrelated post in the batch with it.
 *  - **`account_banned`.** The one code that makes the client take its queue terminal. If the
 *    server ever renamed it, the client would fall through to `unreachable` and a banned
 *    student's phone would retry the same refused posts for ever — the exact failure
 *    `sync.routes.ts` wrote down as the client's obligation.
 */

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string): string => readFileSync(`${root}${p}`, "utf8");

const syncService = read("server/src/modules/sync/sync.service.ts");
const syncTypes = read("server/src/modules/sync/sync.types.ts");
const errorEnvelope = read("server/src/shared/error-envelope.ts");
const clientApi = read("client/src/api.ts");
const clientOutbox = read("client/src/lib/outbox.ts");

describe("the batch cap", () => {
  it("test_the_client_cap_equals_the_servers_MAX_BATCH_ITEMS", () => {
    const match = /export const MAX_BATCH_ITEMS\s*=\s*(\d+)/.exec(syncService);
    expect(match, "could not find MAX_BATCH_ITEMS in sync.service.ts").not.toBeNull();
    expect(MAX_BATCH_ITEMS).toBe(Number(match![1]));
  });

  it("test_the_batch_schema_still_enforces_the_cap_the_client_is_matching", () => {
    // If the route stopped bounding the array, the constant above would be advisory and this
    // whole agreement would be decorative.
    expect(read("server/src/modules/sync/sync.routes.ts")).toMatch(/\.max\(MAX_BATCH_ITEMS\)/);
  });
});

describe("the entity types", () => {
  function serverEntityTypes(): string[] {
    return [...syncTypes.matchAll(/entityType:\s*z\.literal\(\s*["'`]([a-z_]+)["'`]\s*\)/g)]
      .map((m) => m[1]!)
      .sort();
  }

  function clientEntityTypes(): string[] {
    const match = /export type OutboxEntityType =([^;]+);/.exec(clientOutbox);
    expect(match, "could not find OutboxEntityType in client/src/lib/outbox.ts").not.toBeNull();
    return [...match![1]!.matchAll(/["'`]([a-z_]+)["'`]/g)].map((m) => m[1]!).sort();
  }

  it("finds both lists, so an empty sweep cannot pass vacuously", () => {
    expect(serverEntityTypes().length).toBeGreaterThan(0);
    expect(clientEntityTypes().length).toBeGreaterThan(0);
  });

  it("test_the_client_and_the_server_carry_the_same_entity_types", () => {
    expect(clientEntityTypes()).toEqual(serverEntityTypes());
  });
});

describe("the code that makes the client stop retrying", () => {
  it("test_account_banned_is_still_the_servers_403_code", () => {
    expect(errorEnvelope).toMatch(/new AppError\(403,\s*"account_banned"/);
  });

  it("test_the_client_reads_that_exact_code_and_that_exact_status", () => {
    expect(clientApi).toMatch(/err\.status === 403 && err\.apiError\.code === "account_banned"/);
  });

  it("test_the_client_does_not_treat_any_403_as_a_ban", () => {
    // A different 403 must not silently destroy a student's queued posts. The check is
    // narrowed to the one code, and this asserts nobody has widened it.
    expect(clientApi).not.toMatch(/reason:\s*"banned"\s*\};?\s*\n\s*\}\s*\n\s*if \(err\.status === 403\)/);
  });
});
