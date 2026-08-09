import { describe, expect, it, vi } from "vitest";
import { createInventoryPool } from "../../scripts/db-inventory.js";

/**
 * TASK-STATUS problem #4, second half — the hand-run inventory script builds its own pool.
 *
 * The service pool was fixed on 7 August and this script was recorded as still holding the
 * same hole rather than being fixed in passing. Closed 9 August; this is the test that keeps
 * it closed.
 *
 * Same two assertions as `db-pool-error-handler.test.ts`, for the same two distinct failures:
 *
 *  1. **The listener exists at all.** The defect was its absence, so the assertion is on the
 *     registration and not only on behaviour — this is the line that fails if someone deletes
 *     it. Without it Node's EventEmitter contract throws the `error` event, and the script's
 *     `main().catch()` cannot catch it: an event is not a rejection.
 *  2. **The password never reaches the output.** A pg connection error references the `Client`
 *     that raised it, and a `Client` holds `connectionParameters.password` parsed out of
 *     `DATABASE_URL`. The assertion is against the *written text*, not the object, because the
 *     leak happens at the moment of writing.
 *
 * DB-free by construction: constructing a `pg.Pool` opens no socket, and importing the script
 * runs nothing — its `main()` is behind a direct-invocation guard for exactly this reason.
 */

/** The canary. If this string ever reaches the console, the disclosure bug is back. */
const PASSWORD_CANARY = "inventory-password-canary-must-not-appear-in-output";

const UNUSED_DSN = `postgresql://unused:${PASSWORD_CANARY}@127.0.0.1:1/unused`;

/** An error shaped the way pg raises one on a dying connection: it carries the client. */
function connectionError(): Error {
  return Object.assign(new Error("Connection terminated unexpectedly"), {
    code: "ECONNRESET",
    client: {
      connectionParameters: {
        user: "postgres.projectref",
        password: PASSWORD_CANARY,
        host: "aws-0-ap-southeast-2.pooler.supabase.com",
        database: "postgres",
      },
    },
  });
}

describe("db-inventory script pool: idle-connection errors", () => {
  it("test_inventory_pool_has_an_error_listener_attached", async () => {
    const pool = createInventoryPool(UNUSED_DSN);
    try {
      expect(pool.listenerCount("error")).toBeGreaterThan(0);
    } finally {
      await pool.end();
    }
  });

  it("test_inventory_pool_error_does_not_escape_the_process", async () => {
    const pool = createInventoryPool(UNUSED_DSN);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // With no listener this call throws. That it returns is the availability half.
      expect(() => pool.emit("error", connectionError(), {} as never)).not.toThrow();
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      await pool.end();
    }
  });

  it("test_inventory_pool_error_never_writes_the_database_password", async () => {
    const pool = createInventoryPool(UNUSED_DSN);
    const written: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        // Serialize the way a console actually renders its arguments. Asserting on the
        // object would pass even if the object still held the connection.
        written.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    try {
      pool.emit("error", connectionError(), {} as never);
      expect(written.join("\n")).not.toContain(PASSWORD_CANARY);
      // and the line is still useful
      expect(written.join("\n")).toContain("ECONNRESET");
    } finally {
      spy.mockRestore();
      await pool.end();
    }
  });
});
