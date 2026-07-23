import { Router } from "express";
import { z } from "zod";
import { AppError, errors } from "../../shared/error-envelope.js";
import { confirmVerification, initiateVerification } from "./identity.service.js";

/**
 * A1 POST /verification/initiate, A2 POST /verification/confirm. Both public.
 * The route layer validates shape and maps service outcomes to HTTP; all identity
 * secrets stay inside the service (NFR identity non-disclosure).
 */

export const identityRouter = Router();

const initiateSchema = z.object({
  email: z.string().min(3).max(254),
});

identityRouter.post("/verification/initiate", async (req, res, next) => {
  const parsed = initiateSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(errors.validation("Email is required."));
  }
  try {
    const result = await initiateVerification(parsed.data.email);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

const confirmSchema = z.object({
  email: z.string().min(3).max(254),
  token: z.string().min(4).max(12),
});

identityRouter.post("/verification/confirm", async (req, res, next) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(errors.validation("Email and verification code are required."));
  }
  try {
    const result = await confirmVerification(parsed.data.email, parsed.data.token);
    switch (result.outcome) {
      case "verified":
        // S4 success state. Only public profile fields + the short-lived bootstrap
        // token the client exchanges for a session (T12) — no raw email.
        res.status(200).json({
          outcome: "verified",
          profile: result.profile,
          sessionToken: result.sessionToken,
        });
        return;
      case "blocked_unparseable_year":
        // S4 blocked state (R1 AC2) — distinct, never a guessed year.
        res.status(422).json({
          outcome: "blocked_unparseable_year",
          message:
            "We couldn't verify your enrollment year automatically. Your registration is under manual review.",
        });
        return;
      case "refused_banned":
        // S4 refused state (R5). Deliberately does not disclose ban specifics.
        res.status(403).json({
          outcome: "refused",
          message: "This account can't be registered.",
        });
        return;
    }
  } catch (err) {
    next(err);
  }
});

// Re-export for the central error handler's type guard.
export { AppError };
