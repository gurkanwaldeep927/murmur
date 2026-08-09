/**
 * The fields of a pool error that are safe to log. TASK-STATUS problem #4.
 *
 * **Why this is its own module.** Two places construct a `pg.Pool` and therefore two places
 * need this: the service pool (`./pool.ts`) and the hand-run inventory script
 * (`scripts/db-inventory.ts`). The script cannot import `./pool.ts` — that module constructs
 * the service pool as a side effect and pulls in `config`, which refuses to start without a
 * full environment. Copying three lines into the script under a "keep these in step" comment
 * was the obvious alternative and is exactly the pattern that has failed this project four
 * times; one module with two importers has nothing to keep in step.
 *
 * `./pool.ts` re-exports this so existing importers and their tests are unaffected.
 *
 * **Why a hand-built object rather than a serializer.** A pg error raised on a connection
 * carries a reference back to the client that raised it, and a pg `Client` holds
 * `connectionParameters` — including the password parsed out of `DATABASE_URL`. Any reporter
 * that walks the error's own properties therefore prints the database password in clear text;
 * that was observed in test output on 2026-08-05. Copying two scalars out is the only shape
 * that cannot regress into serializing the connection.
 */
export function poolErrorFields(err: unknown): { message: string; code?: string } {
  if (!(err instanceof Error)) return { message: String(err) };
  // `code` is pg/libuv's error code (ECONNRESET, 57P01 admin shutdown, ...) — the field
  // that makes the log line actionable. It is a string on pg errors, guarded because the
  // type says `unknown` for a plain Error.
  const code = (err as { code?: unknown }).code;
  return {
    message: err.message,
    ...(typeof code === "string" ? { code } : {}),
  };
}
