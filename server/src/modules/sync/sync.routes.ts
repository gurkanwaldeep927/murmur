import { Router } from "express";
import { z } from "zod";
import { errors } from "../../shared/error-envelope.js";
import { callerOf, requireSession } from "../../shared/require-session.js";
import { MAX_BATCH_ITEMS, syncBatch } from "./sync.service.js";
import { syncItemSchema } from "./sync.types.js";

/**
 * A10 `POST /sync/batch` (T29).
 *
 * Behind `requireSession`, and that placement decides something the contract leaves open.
 * TRD apis[A10] lists "banned actor" among the PER-ITEM rejection reasons, which would mean
 * letting a banned caller's batch through and refusing each item individually. It is refused
 * as a whole instead, by the same gate every other authenticated route uses: a ban applies to
 * the actor, not to a post, so there is no per-item variation to report — and bypassing that
 * gate to produce a prettier response body would mean writing a second ban check, which is
 * exactly the duplication `requireSession` exists to prevent.
 *
 * **This puts an obligation on the client (T28/T31):** a `403 account_banned` here means the
 * queue must move to a terminal rejected state locally. A phone that retries on 403 would
 * carry those posts forever. Written down because nothing in the response can say it.
 *
 * A3/A4/A5 and the session middleware are untouched by this task — T62 is an open gate over
 * that surface. This adds a route that CALLS them, which is also why sync cannot bypass
 * moderation: it has no publish path of its own.
 */

export const syncRouter = Router();

const batchSchema = z.object({
  items: z.array(syncItemSchema).min(1).max(MAX_BATCH_ITEMS),
});

syncRouter.post("/sync/batch", requireSession, async (req, res, next) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    // A whole-batch 400 only for a batch that is not a batch — empty, over the ceiling, or an
    // item whose shape is unreadable. Anything the server can understand well enough to
    // process gets a per-item outcome instead, because partial failure is the normal case here
    // and an all-or-nothing refusal would cost a student their other posts.
    return next(
      errors.validation(
        `A sync batch is 1–${MAX_BATCH_ITEMS} items, each with a local id, an entity type, ` +
          `an idempotency key and a payload.`,
      ),
    );
  }

  // Two items in one batch claiming the same local id cannot both be honoured: the second
  // would silently return the first's result, and the phone would mark two different posts as
  // one. Refused up front, where it can still be reported honestly.
  const localIds = new Set(parsed.data.items.map((i) => i.clientLocalId));
  if (localIds.size !== parsed.data.items.length) {
    return next(errors.validation("Two items in this batch share a client local id."));
  }

  try {
    const results = await syncBatch({
      ownerProfileId: callerOf(req).id,
      items: parsed.data.items,
    });
    // 200, not 207. Every item reporting its own outcome IS this endpoint's success case —
    // "partial-batch failure is expected, not exceptional" (TRD apis[A10]) — and a status code
    // implying something went wrong would invite a client to treat the whole batch as failed.
    res.status(200).json({ results });
  } catch (err) {
    next(err);
  }
});
