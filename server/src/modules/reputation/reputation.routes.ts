import { Router } from "express";
import { z } from "zod";
import { errors } from "../../shared/error-envelope.js";
import { callerOf, requireSession } from "../../shared/require-session.js";
import { acceptAnswer, upvoteAnswer, type VoteResult } from "./reputation.service.js";

/**
 * A6 `POST /answers/:id/vote` and `POST /answers/:id/accept` (T22).
 *
 * Behind `requireSession`, which is where the ban/suspend guard lives — the "banned or
 * suspended actor forbidden" error A6 names is satisfied there and is deliberately not
 * re-implemented here (shared/require-session.ts).
 *
 * These are new routes on a new router. The A3/A4/A5 handlers and the session middleware are
 * untouched by this task, because T62 is an open gate over exactly that surface and reshaping
 * it in front of the gate would only make its findings staler.
 */

export const reputationRouter = Router();

/** No identity crosses this boundary: the response names the answer, never its author. */
function voteView(result: VoteResult) {
  return {
    answerId: result.answerId,
    voteCount: result.voteCount,
    accepted: result.accepted,
    authorReputationScore: result.authorReputationScore,
  };
}

const answerIdSchema = z.string().uuid();

reputationRouter.post("/answers/:id/vote", requireSession, async (req, res, next) => {
  const answerId = answerIdSchema.safeParse(req.params.id);
  if (!answerId.success) return next(errors.answerNotFound());
  try {
    const result = await upvoteAnswer({
      actorProfileId: callerOf(req).id,
      answerId: answerId.data,
    });
    res.status(200).json(voteView(result));
  } catch (err) {
    next(err);
  }
});

reputationRouter.post("/answers/:id/accept", requireSession, async (req, res, next) => {
  const answerId = answerIdSchema.safeParse(req.params.id);
  if (!answerId.success) return next(errors.answerNotFound());
  try {
    const result = await acceptAnswer({
      actorProfileId: callerOf(req).id,
      answerId: answerId.data,
    });
    res.status(200).json(voteView(result));
  } catch (err) {
    next(err);
  }
});
