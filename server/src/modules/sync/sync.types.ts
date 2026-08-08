import { z } from "zod";
import { REPORT_REASONS } from "../grievance/grievance.slas.js";

/**
 * The wire shape of A10's batch (T29).
 *
 * Payloads are validated per entity type rather than accepted as opaque jsonb. The column is
 * jsonb and the temptation is to trust it and let the downstream service complain — but a
 * malformed payload discovered three calls deep surfaces as an unexpected error, and an
 * unexpected error is treated as TRANSIENT by design (sync.service.ts). A post that can never
 * succeed would then be retried forever instead of being told, once, that it was refused.
 */

const uuid = z.string().uuid();

export const questionPayload = z.object({
  topic: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  body: z.string().min(1).max(20_000),
});

export const answerPayload = z
  .object({
    // Either the server id (the question was already live when they answered it) or the local
    // id the phone invented (both were written offline). Exactly one — see the refinement.
    questionId: uuid.optional(),
    parentClientLocalId: uuid.optional(),
    body: z.string().min(1).max(20_000),
  })
  .refine((p) => (p.questionId ? 1 : 0) + (p.parentClientLocalId ? 1 : 0) === 1, {
    message: "an answer names its question either by server id or by client local id, not both",
  });

export const votePayload = z.object({
  answerId: uuid,
  // No score. The client sends WHICH answer and WHAT KIND; the server decides what it is
  // worth. Offline changes nothing about that.
  kind: z.enum(["upvote", "accept"]),
});

export const reportPayload = z
  .object({
    questionId: uuid.optional(),
    answerId: uuid.optional(),
    reason: z.enum(REPORT_REASONS),
    isAnonymous: z.boolean().optional(),
  })
  .refine((p) => (p.questionId ? 1 : 0) + (p.answerId ? 1 : 0) === 1, {
    message: "a report names exactly one question or one answer",
  });

/**
 * A queued write. `clientLocalId` is the phone's own id for its outbox row and is what every
 * result is keyed by; `idempotencyKey` is what A3/A4 use to recognise a replay of the same
 * post. They are two different things — see sync.repo.ts.
 */
const base = {
  clientLocalId: uuid,
  idempotencyKey: uuid,
  clientCreatedAt: z.coerce.date(),
};

export const syncItemSchema = z.discriminatedUnion("entityType", [
  z.object({ ...base, entityType: z.literal("question"), payload: questionPayload }),
  z.object({ ...base, entityType: z.literal("answer"), payload: answerPayload }),
  z.object({ ...base, entityType: z.literal("vote"), payload: votePayload }),
  z.object({ ...base, entityType: z.literal("report"), payload: reportPayload }),
]);

export type SyncItemInput = z.infer<typeof syncItemSchema>;
