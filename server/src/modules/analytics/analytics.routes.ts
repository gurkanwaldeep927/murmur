import { Router } from "express";
import { z } from "zod";
import { persistEvent } from "./analytics.service.js";
import { logger } from "../../shared/logger.js";

/**
 * A12 — Analytics Event Ingest. POST /events. public + session.
 * Malformed events are rejected+logged but never allowed to fail the primary action;
 * since this IS the primary action for a direct /events call, we still return 202 on
 * accepted events and 400 only for a malformed body (logged, not thrown upstream).
 */

const eventSchema = z.object({
  eventType: z.string().min(1).max(120),
  actorProfileId: z.string().uuid().optional().nullable(),
  occurredAt: z.coerce.date().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const analyticsRouter = Router();

analyticsRouter.post("/events", (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.info({ issues: parsed.error.issues }, "analytics event rejected (malformed)");
    res.status(400).json({ error: { code: "validation_failed", message: "Malformed event" } });
    return;
  }
  // Fire-and-forget: acknowledge immediately; persistence errors are logged, not surfaced.
  persistEvent(parsed.data).catch((err) =>
    logger.warn({ err, eventType: parsed.data.eventType }, "analytics ingest persist failed"),
  );
  res.status(202).json({ accepted: true });
});
