import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readEvents, waitForEvents } from "../helpers/analytics.js";

/**
 * T45 — the sign-up funnel is actually recorded.
 *
 * The events themselves were written back in M1. What was never written is anything that
 * checks they fire — the same hole T51 found in the M2 hooks, where the only mention of
 * `analytics_event` in the whole suite was the line that empties it. An emit is one line in a
 * branch that a refactor removes without a single test going red, and the loss surfaces at T46
 * (M6) with the milestone that produced it long closed.
 *
 * Every branch of A1/A2 is exercised here, including the two that produce no account at all.
 * The `activation` and `registration penetration` metrics R8 promises are computed from exactly
 * these rows, so a missing one is a metric that reads zero for ever while the thing it counts
 * is happening.
 *
 * Requires DATABASE_URL pointing at a DISPOSABLE test Postgres — the harness truncates.
 */

const PEPPER = "v1:t45-pepper";

let app: import("express").Express;
let truncateAll: () => Promise<void>;
let closeDb: () => Promise<void>;
let pool: import("pg").Pool;
let hashNormalizedEmail: (normalized: string) => string;
let normalizeEmail: (raw: string) => { normalized: string; domain: string } | null;

beforeAll(async () => {
  process.env.EMAIL_HASH_PEPPER_ACTIVE = PEPPER;
  process.env.SESSION_SIGNING_KEY ??= "v1:test-session-key";
  process.env.CAMPUS_EMAIL_DOMAINS = "nitj.ac.in";
  process.env.EMAIL_PROVIDER = "memory";
  process.env.MODERATION_PROVIDER = "fixture";
  if (!process.env.DATABASE_URL) {
    throw new Error("T45 funnel tests require DATABASE_URL (disposable test Postgres)");
  }
  const db = await import("../helpers/test-db.js");
  ({ truncateAll, closeDb, pool } = db);
  ({ hashNormalizedEmail, normalizeEmail } = await import(
    "../../server/src/shared/email-identity.js"
  ));
  const { createApp } = await import("../../server/src/app.js");
  await db.migrateTestDb();
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

const initiate = (email: string) =>
  request(app).post("/verification/initiate").send({ email });

const confirm = (email: string, token: string) =>
  request(app).post("/verification/confirm").send({ email, token });

async function otpFor(email: string): Promise<string> {
  const { memoryEmailProvider } = await import(
    "../../server/src/modules/notification/email-provider.js"
  );
  const key = normalizeEmail(email)?.normalized ?? email.toLowerCase();
  const otp = memoryEmailProvider?.lastToken(key);
  if (!otp) throw new Error(`no OTP captured for ${email}`);
  return otp;
}

/** A ban keyed exactly as A1/A2/A11 key it (T50). */
async function banEmail(raw: string): Promise<void> {
  const normalized = normalizeEmail(raw)!.normalized;
  await pool.query(
    `INSERT INTO ban_record (id, email_hash, ban_reason) VALUES ($1, $2, 'test')`,
    [randomUUID(), hashNormalizedEmail(normalized)],
  );
}

const OK = "t45.student.24@nitj.ac.in";

describe("the top of the funnel", () => {
  it("records that someone asked for a code", async () => {
    await initiate(OK);
    const rows = await waitForEvents(pool, "registration.verification_initiated");
    expect(rows).toHaveLength(1);
    // No actor: there is no profile yet, and there must not be an email here either. This is
    // the denominator of registration penetration, and it is anonymous by construction.
    expect(rows[0]!.actor_profile_id).toBeNull();
  });

  it("records a resend separately from a first request", async () => {
    await initiate(OK);
    await waitForEvents(pool, "registration.verification_initiated");
    // The cooldown is real; wait it out rather than reaching past it, so this exercises the
    // path a student actually takes.
    const { config } = await import("../../server/src/config/index.js");
    await pool.query(
      `UPDATE identity_account
          SET verification_token_sent_at = now() - make_interval(secs => $1::double precision)`,
      [config.verificationResendCooldownSeconds + 5],
    );
    await initiate(OK);

    await waitForEvents(pool, "registration.verification_resent");
    // Counted apart, because a funnel that merges them cannot tell "asked once" from "asked
    // four times because the mail never arrived" — which is a delivery problem wearing a
    // conversion problem's clothes.
    expect(await readEvents(pool, "registration.verification_initiated")).toHaveLength(1);
  });
});

describe("the bottom of the funnel", () => {
  it("records a confirmation AND an activation, both attributed", async () => {
    await initiate(OK);
    const res = await confirm(OK, await otpFor(OK));
    expect(res.status).toBe(200);

    const confirmed = await waitForEvents(pool, "registration.verification_confirmed");
    const activated = await waitForEvents(pool, "activation.profile_created");
    expect(confirmed).toHaveLength(1);
    expect(activated).toHaveLength(1);

    // Both carry the profile, which is what makes D30 cohorts computable at all — an
    // activation with no actor can be counted but never followed.
    const { rows } = await pool.query<{ id: string }>(`SELECT id FROM pseudonymous_profile`);
    expect(activated[0]!.actor_profile_id).toBe(rows[0]!.id);
    expect(confirmed[0]!.actor_profile_id).toBe(rows[0]!.id);
  });

  it("makes activation computable as a ratio, which is the metric R8 asks for", async () => {
    // Two people ask; one finishes. The number this proves is 50%, and it is only provable
    // because both ends of the funnel are recorded.
    await initiate(OK);
    await initiate("t45.quitter.24@nitj.ac.in");
    await confirm(OK, await otpFor(OK));

    await waitForEvents(pool, "registration.verification_initiated", 2);
    await waitForEvents(pool, "activation.profile_created", 1);
    const initiated = await readEvents(pool, "registration.verification_initiated");
    const activated = await readEvents(pool, "activation.profile_created");
    expect(activated.length / initiated.length).toBe(0.5);
  });
});

describe("the branches that produce no account, which are the ones a refactor drops", () => {
  it("records a year that could not be read", async () => {
    // The local part carries no 2-digit admission year, so A2 blocks rather than guessing.
    const noYear = "t45.noyear@nitj.ac.in";
    await initiate(noYear);
    const res = await confirm(noYear, await otpFor(noYear));
    expect(res.body.outcome).toBe("blocked_unparseable_year");

    const rows = await waitForEvents(pool, "registration.blocked_unparseable_year");
    expect(rows).toHaveLength(1);
    // The metadata distinguishes "we have no rule for this domain" from "the rule ran and
    // found nothing" — two very different things to do about it, and useless if merged.
    expect(rows[0]!.metadata).toHaveProperty("noRuleForDomain");
    // Still anonymous: the whole point of this branch is that no profile was created.
    expect(rows[0]!.actor_profile_id).toBeNull();
    // And nothing activated, so a blocked student cannot inflate the activation rate.
    expect(await readEvents(pool, "activation.profile_created")).toHaveLength(0);
  });

  it("records a registration refused because the address is banned", async () => {
    const banned = "t45.banned.24@nitj.ac.in";
    await banEmail(banned);
    await initiate(banned);
    const res = await confirm(banned, await otpFor(banned));
    expect(res.body.outcome).toBe("refused_banned");

    expect(await waitForEvents(pool, "registration.refused_banned")).toHaveLength(1);
    expect(await readEvents(pool, "activation.profile_created")).toHaveLength(0);
  });

  it("records an exhausted guess budget, deliberately with no actor", async () => {
    const target = "t45.grind.24@nitj.ac.in";
    await initiate(target);
    const { config } = await import("../../server/src/config/index.js");
    for (let i = 0; i < config.verificationMaxConfirmAttempts; i += 1) {
      await confirm(target, "000000");
    }

    const rows = await waitForEvents(pool, "registration.verification_attempts_exhausted");
    expect(rows).toHaveLength(1);
    // No actor, and that is the finding rather than an omission: whoever burned the budget
    // may well not be the address's owner. Attributing it would put an attacker's behaviour
    // on a real student's record.
    expect(rows[0]!.actor_profile_id).toBeNull();
  });
});

describe("what the funnel must never contain", () => {
  it("records no email address anywhere in the funnel's rows", async () => {
    // The product's whole promise, checked against the bytes actually stored rather than
    // against the code that stored them — the same shape as the T50 non-disclosure test and
    // the pool-password test, both of which found real leaks by reading the output.
    await initiate(OK);
    await confirm(OK, await otpFor(OK));
    await waitForEvents(pool, "activation.profile_created");

    const { rows } = await pool.query<{ dump: string }>(
      `SELECT coalesce(string_agg(event_type || ' ' || coalesce(metadata::text, ''), ' '), '')
         AS dump FROM analytics_event`,
    );
    expect(rows[0]!.dump).not.toContain("@");
    expect(rows[0]!.dump.toLowerCase()).not.toContain("t45.student");
    expect(rows[0]!.dump).not.toContain("nitj.ac.in");
  });
});
