import { describe, expect, it } from "vitest";
import { isSelfEvidentTestDatabase } from "../helpers/test-db.js";

/**
 * SEC-017 (T62 fix-list) — the destructive-test guard was a naming heuristic.
 *
 * `truncateAll()` destroys every row in every table. Route 1 of its guard used to be
 * `db.includes("test")` with **no host test at all**, so any reachable database anywhere
 * whose name merely contained the substring `test` was auto-authorised — no variable set,
 * no prompt, no output.
 *
 * That was not hypothetical in this repository. `DATABASE_URL` points at the live Supabase
 * instance holding real student accounts (SEC-002 / SEC-021), so the only thing standing
 * between a mistyped test command and every real row was the spelling of a database name.
 *
 * Route 1 now requires the name AND a loopback host. A local Postgres cannot be a
 * production database — nobody runs a campus's live data on the test runner's own machine —
 * so on loopback the name is evidence. Off loopback it is a guess about somebody else's
 * server, and the operator has to name the connection explicitly instead.
 *
 * These assertions exist because a guard nobody has watched refuse is not evidence. That
 * lesson has now been applied six times in this project.
 */

describe("SEC-017: route 1 requires a loopback host, not just a test-shaped name", () => {
  it("test_SEC017_ci_connection_is_still_self_evident", () => {
    // The one case that MUST keep working, or CI stops running the DB-backed suites and
    // the tightening has cost more than it bought. This is ci.yml's exact DATABASE_URL.
    expect(isSelfEvidentTestDatabase("localhost", "murmur_test")).toBe(true);
  });

  it("test_SEC017_other_loopback_spellings_are_accepted", () => {
    // A guard that only understands one spelling of localhost sends people to the escape
    // hatch for no security gain, and a widely-used escape hatch stops being a guard.
    expect(isSelfEvidentTestDatabase("127.0.0.1", "murmur_test")).toBe(true);
    expect(isSelfEvidentTestDatabase("127.0.0.2", "murmur_test")).toBe(true);
    expect(isSelfEvidentTestDatabase("::1", "murmur_test")).toBe(true);
    expect(isSelfEvidentTestDatabase("[::1]", "murmur_test")).toBe(true);
    expect(isSelfEvidentTestDatabase("LOCALHOST", "MURMUR_TEST")).toBe(true);
  });

  it("test_SEC017_a_remote_database_named_test_is_no_longer_self_evident", () => {
    // The finding itself. Every one of these would previously have been TRUNCATEd on the
    // strength of its name alone.
    expect(isSelfEvidentTestDatabase("db.abcdefghij.supabase.co", "murmur_test")).toBe(false);
    expect(isSelfEvidentTestDatabase("staging.example.com", "testing")).toBe(false);
    expect(isSelfEvidentTestDatabase("10.0.0.5", "app_test")).toBe(false);
  });

  it("test_SEC017_the_live_supabase_shape_is_refused", () => {
    // Supabase names every database `postgres`, which is why route 2 exists at all — and
    // why the name check can never accidentally pass there.
    expect(isSelfEvidentTestDatabase("db.abcdefghij.supabase.co", "postgres")).toBe(false);
    expect(isSelfEvidentTestDatabase("aws-0-ap-south-1.pooler.supabase.com", "postgres")).toBe(
      false,
    );
  });

  it("test_SEC017_substring_matching_is_still_the_weak_part_and_is_bounded_by_the_host", () => {
    // `latest` contains "test" and is nothing of the kind. On loopback that is tolerable —
    // the blast radius is a database on this machine. Off loopback it is exactly the
    // accident the host condition now prevents, and this pins that asymmetry deliberately
    // rather than leaving it as an unstated consequence.
    expect(isSelfEvidentTestDatabase("localhost", "latest")).toBe(true);
    expect(isSelfEvidentTestDatabase("prod.example.com", "latest")).toBe(false);
  });

  it("test_SEC017_a_loopback_host_alone_is_not_enough", () => {
    // The condition is AND, not OR. A local database with a real-looking name still has to
    // be named explicitly — a developer's own dev database is not disposable to them.
    expect(isSelfEvidentTestDatabase("localhost", "murmur")).toBe(false);
    expect(isSelfEvidentTestDatabase("127.0.0.1", "postgres")).toBe(false);
  });
});
