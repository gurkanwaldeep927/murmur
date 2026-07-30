import request from "supertest";
import { expect } from "vitest";
import type { Express } from "express";

/**
 * Drives a caller all the way to an authenticated session (A1 → A2 → /session/exchange),
 * so content tests can start from "a verified student is signed in" without restating
 * the identity flow.
 *
 * Emails must satisfy the T6 campus rule (local part ends in the 2-digit admission
 * year), or A2 returns `blocked_unparseable_year` and there is no session.
 */

export interface SignedInUser {
  sessionToken: string;
  profile: { id: string; pseudonym: string; year_badge: string };
}

export async function signIn(app: Express, email: string): Promise<SignedInUser> {
  await request(app).post("/verification/initiate").send({ email });

  const { memoryEmailProvider } = await import(
    "../../server/src/modules/notification/email-provider.js"
  );
  const otp = memoryEmailProvider?.lastToken(email.toLowerCase());
  if (!otp) throw new Error("no OTP captured — is EMAIL_PROVIDER=memory?");

  const confirmed = await request(app).post("/verification/confirm").send({ email, token: otp });
  expect(confirmed.status).toBe(200);

  const exchanged = await request(app)
    .post("/session/exchange")
    .set("authorization", `Bearer ${confirmed.body.sessionToken}`);
  expect(exchanged.status).toBe(200);

  return { sessionToken: exchanged.body.sessionToken, profile: exchanged.body.profile };
}

export function auth(user: SignedInUser): [string, string] {
  return ["authorization", `Bearer ${user.sessionToken}`];
}
