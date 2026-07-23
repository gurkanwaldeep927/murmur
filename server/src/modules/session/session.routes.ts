import { Router } from "express";
import { pool } from "../../db/pool.js";
import { errors } from "../../shared/error-envelope.js";
import { callerOf, requireSession } from "../../shared/require-session.js";
import { bearerFrom, issueSessionToken, verifyToken } from "../../shared/session.js";
import { findProfileById } from "../profile/profile.repo.js";

/**
 * Session endpoints (plan T12). Design: `decisions/oq-14-session-mechanism.md`.
 *
 *   POST /session/exchange  — bootstrap token (A2's response) -> 30-day session token
 *   GET  /session           — who am I? the PWA's boot-time session check
 *   POST /session/logout    — client-side discard; see the handler's note
 *
 * No new API contract was invented for the TRD to own: these serve the shell the UX
 * assumes in §5, which no TRD API modelled (that gap IS OQ-14).
 */

export const sessionRouter = Router();

/**
 * Exchange. The only acceptor of a bootstrap token — verified AS `bootstrap`, so a
 * session token cannot be replayed here and a bootstrap token cannot be used anywhere
 * else. The profile is re-read (not trusted from the token) so a user banned in the
 * 15 minutes between A2 and the exchange never gets a session credential.
 */
sessionRouter.post("/session/exchange", async (req, res, next) => {
  const raw = bearerFrom(req.header("authorization")) ?? (req.body as { token?: unknown })?.token;
  if (typeof raw !== "string" || raw === "") {
    return next(errors.sessionRequired("Verification is required before signing in."));
  }
  const payload = verifyToken(raw, "bootstrap");
  if (!payload) return next(errors.sessionInvalid());

  try {
    const profile = await findProfileById(pool, payload.sub);
    if (!profile) return next(errors.sessionInvalid());
    if (profile.status === "banned") return next(errors.accountBanned());
    if (profile.status === "suspended") return next(errors.accountSuspended());

    res.status(200).json({ sessionToken: issueSessionToken(profile.id), profile });
  } catch (err) {
    next(err);
  }
});

/**
 * Boot-time check for the PWA: confirms the stored token is still good and returns
 * the current profile (reputation/year badge may have moved since it was stored).
 * A 401 here is the client's signal to clear storage and show S1.
 */
sessionRouter.get("/session", requireSession, (req, res) => {
  res.status(200).json({ profile: callerOf(req) });
});

/**
 * Logout. Stateless tokens cannot be invalidated server-side without the token
 * blacklist the decision rules out (§1), so this is honest about what it does: the
 * client discards its copy, and the token dies at `exp`. It exists as an endpoint so
 * the client has one call to make, and so the analytics hook has somewhere to live.
 */
sessionRouter.post("/session/logout", (_req, res) => {
  res.status(204).end();
});
