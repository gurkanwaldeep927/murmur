import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "server/src/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 30000,
    // Load .env before any test file evaluates.
    //
    // Without this the DB-backed suites could not run locally at all: each one checks
    // process.env.DATABASE_URL in beforeAll and throws, and that check runs *before* the
    // dynamic import of tests/helpers/test-db.js which is the only thing that would have
    // pulled in server/src/config (the sole importer of "dotenv/config"). The suites
    // therefore failed on a database that was configured and reachable.
    //
    // CI is unaffected: it exports DATABASE_URL as a real environment variable, and dotenv
    // never overwrites values already present in process.env.
    setupFiles: ["dotenv/config"],
    // Run test FILES one at a time.
    //
    // tests/integration/* and tests/nfr/* share a single database and each calls
    // truncateAll() in beforeEach. Run in parallel — vitest's default — they delete each
    // other's rows mid-test: a suite's pending verification row disappears before it can
    // confirm (400), its profile vanishes between request and assertion (401), or content
    // is truncated before a count runs (0 where 5 was expected). The failures move around
    // between runs because it is a race, not a defect in the code under test.
    //
    // The durable alternative is a schema or database per worker. That is worth doing when
    // the suite grows; today the whole run is dominated by round-trip latency to a remote
    // Postgres, so serialising costs little and removes a whole class of false failure.
    fileParallelism: false,
  },
});
