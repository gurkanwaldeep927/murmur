import { Router } from "express";
import { z } from "zod";
import { persistEvent } from "./analytics.service.js";
import { CLIENT_EVENT_TYPES, sanitizeMetadata } from "./client-events.js";
import { logger } from "../../shared/logger.js";
import { eventsLimiter, rateLimit } from "../../shared/rate-limit.js";
import { bearerFrom, verifyToken } from "../../shared/session.js";

/**
 * A12 — Analytics Event Ingest. POST /events.
 *
 * This is the app's ONLY unauthenticated write, and it has to be: the registration funnel
 * it measures happens before anyone has a session (R8). PRV-7 / SEC-009 found what that
 * cost as originally written — three separate problems, all fixed here:
 *
 *  1. **`actorProfileId` was accepted from the request body.** Any anonymous caller could
 *     attribute events to any profile id they liked, so every per-user metric was
 *     forgeable by anyone who could reach the endpoint. Attribution now comes only from a
 *     verified session token; the body field is refused outright rather than ignored, so
 *     a client still sending it finds out.
 *  2. **`eventType` was a free string.** Unbounded label cardinality, and any name at all
 *     could be written into the ledger the T46 metric audit reads. Now an allowlist.
 *  3. **`metadata` was `Record<string, unknown>`.** The table is append-only and nothing
 *     deletes from it (PRV-1), so it was an indefinite store for arbitrary caller-supplied
 *     data — including the raw email addresses this product exists to keep out of the
 *     database. Now flat primitives, bounded, with email-shaped strings refused.
 *
 * Malformed events are rejected and logged but never allowed to fail the primary action;
 * since this IS the primary action for a direct call, it still returns 202 on accepted
 * events and 400 only for a malformed body.
 */

const eventSchema = z.object({
  eventType: z.string().min(1).max(120),
  occurredAt: z.coerce.date().optional(),
  metadata: z.unknown().optional(),
  // Present so an old client sending it gets a clear 400 instead of silent attribution
  // loss. It is never read.
  actorProfileId: z.undefined({
    invalid_type_error: "actorProfileId is derived from the session and cannot be supplied",
  }),
});

export const analyticsRouter = Router();

/**
 * Attribution, derived — never asserted by the caller. An absent or unusable token is not
 * an error: anonymous funnel events are the normal case for this endpoint.
 */
function actorFrom(authorization: string | undefined): string | null {
  const token = bearerFrom(authorization);
  if (!token) return null;
  return verifyToken(token, "session")?.sub ?? null;
}

analyticsRouter.post("/events", rateLimit(eventsLimiter), (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.info({ issues: parsed.error.issues }, "analytics event rejected (malformed)");
    res.status(400).json({ error: { code: "validation_failed", message: "Malformed event" } });
    return;
  }

  if (!CLIENT_EVENT_TYPES.has(parsed.data.eventType)) {
    // Logged at info with the name, so a client shipping a new event that nobody added
    // to the allowlist is diagnosable rather than a silently missing metric.
    logger.info({ eventType: parsed.data.eventType }, "analytics event rejected (unknown type)");
    res.status(400).json({ error: { code: "validation_failed", message: "Unknown event type" } });
    return;
  }

  const metadata = sanitizeMetadata(parsed.data.metadata);
  if (!metadata.ok) {
    logger.info({ reason: metadata.reason }, "analytics event rejected (metadata)");
    res.status(400).json({ error: { code: "validation_failed", message: "Malformed event" } });
    return;
  }

  // Fire-and-forget: acknowledge immediately; persistence errors are logged, not surfaced.
  persistEvent({
    eventType: parsed.data.eventType,
    actorProfileId: actorFrom(req.header("authorization")),
    occurredAt: parsed.data.occurredAt,
    metadata: metadata.value,
  }).catch((err) =>
    logger.warn({ err, eventType: parsed.data.eventType }, "analytics ingest persist failed"),
  );
  res.status(202).json({ accepted: true });
});
