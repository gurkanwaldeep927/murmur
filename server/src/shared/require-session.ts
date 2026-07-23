import type { NextFunction, Request, Response } from "express";
import { pool } from "../db/pool.js";
import { findProfileById } from "../modules/profile/profile.repo.js";
import type { PublicProfile } from "../modules/profile/profile.repo.js";
import { errors } from "./error-envelope.js";
import { bearerFrom, issueSessionToken, shouldRefresh, verifyToken } from "./session.js";

/**
 * The authentication gate for every route behind the authenticated shell (S5–S17).
 * Design: `decisions/oq-14-session-mechanism.md`.
 *
 * Route handlers never parse a token themselves — they read `req.profile`. Their
 * ban/suspend guards (e.g. T15/T16's on A3/A4) are satisfied here rather than being
 * re-implemented per route, which is what makes the guard impossible to forget.
 *
 * Two things happen on every authenticated request:
 *   1. the token is verified AS a session token (a bootstrap token is refused), and
 *   2. the caller's profile is loaded LIVE, so `status` is the revocation authority
 *      and a ban takes effect on the very next request (decision §4).
 */

declare module "express-serve-static-core" {
  interface Request {
    /** The authenticated caller. Present only after `requireSession`. */
    profile?: PublicProfile;
  }
}

export const SESSION_REFRESH_HEADER = "X-Session-Refresh";

export async function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearerFrom(req.header("authorization"));
  if (!token) return next(errors.sessionRequired());

  const payload = verifyToken(token, "session");
  if (!payload) return next(errors.sessionInvalid());

  let profile: PublicProfile | null;
  try {
    profile = await findProfileById(pool, payload.sub);
  } catch (err) {
    return next(err);
  }

  // Signed for a profile that no longer exists (or was soft-deleted): treat as an
  // expired session, not as a server error — the client clears and re-verifies.
  if (!profile) return next(errors.sessionInvalid());

  // Terminal states. Deliberately NOT a 401: sending a banned user back through S1
  // would present registration, which A11's ban check exists to refuse (decision §6).
  if (profile.status === "banned") return next(errors.accountBanned());
  if (profile.status === "suspended") return next(errors.accountSuspended());

  // Sliding refresh — additive; a client that ignores the header just expires at exp.
  if (shouldRefresh(payload)) {
    res.setHeader(SESSION_REFRESH_HEADER, issueSessionToken(profile.id));
  }

  req.profile = profile;
  next();
}

/** Narrowing helper for handlers that run behind `requireSession`. */
export function callerOf(req: Request): PublicProfile {
  if (!req.profile) {
    // A programming error (route registered without the middleware), not user input.
    throw new Error("requireSession must run before this handler");
  }
  return req.profile;
}
