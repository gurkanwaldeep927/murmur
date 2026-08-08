import type { DbClient, Queryable } from "../../db/pool.js";

/**
 * Sync outbox persistence (T29) — owns `sync_queue_item`.
 *
 * The table is the product's answer to "no offline post is ever silently lost" (the NFR T58
 * tests and T32's reconciliation job audits). Everything here exists to keep that true:
 *
 *  - a queued item is RECORDED before it is processed, so a crash mid-batch leaves evidence;
 *  - a terminal status is only ever written for a reason that is genuinely terminal;
 *  - a transient failure leaves the item `pending`, because "rejected" is forever.
 */

export type SyncEntityType = "question" | "answer" | "vote" | "report";
export type SyncStatus = "pending" | "syncing" | "synced" | "conflict" | "rejected";

export interface QueueRow {
  id: string;
  client_local_id: string;
  entity_type: SyncEntityType;
  sync_status: SyncStatus;
  server_assigned_id: string | null;
  error_reason: string | null;
  retry_count: number;
}

const QUEUE_COLUMNS = `id, client_local_id, entity_type, sync_status, server_assigned_id,
                       error_reason, retry_count`;

/**
 * Record the item, or return the row that is already there.
 *
 * `ON CONFLICT DO NOTHING` plus a follow-up read rather than an upsert: a replayed item must
 * NOT have its payload overwritten. The first submission is the authoritative one — a client
 * that re-sends with different content is not editing, it is confused, and quietly accepting
 * the second version would make the outbox disagree with what was actually processed.
 */
export async function recordItem(
  client: DbClient,
  input: {
    ownerProfileId: string;
    clientLocalId: string;
    idempotencyKey: string;
    entityType: SyncEntityType;
    payload: unknown;
    clientCreatedAt: Date;
  },
): Promise<{ row: QueueRow; created: boolean }> {
  const inserted = await client.query<QueueRow>(
    `INSERT INTO sync_queue_item
       (owner_profile_id, client_local_id, idempotency_key, entity_type, payload,
        client_created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (owner_profile_id, client_local_id) DO NOTHING
     RETURNING ${QUEUE_COLUMNS}`,
    [
      input.ownerProfileId,
      input.clientLocalId,
      input.idempotencyKey,
      input.entityType,
      JSON.stringify(input.payload),
      input.clientCreatedAt,
    ],
  );
  if (inserted.rows[0]) return { row: inserted.rows[0], created: true };

  const existing = await client.query<QueueRow>(
    `SELECT ${QUEUE_COLUMNS} FROM sync_queue_item
      WHERE owner_profile_id = $1 AND client_local_id = $2`,
    [input.ownerProfileId, input.clientLocalId],
  );
  return { row: existing.rows[0]!, created: false };
}

/** A terminal success: the item landed, and this is the id the server gave it. */
export async function markSynced(
  client: Queryable,
  id: string,
  serverAssignedId: string,
): Promise<void> {
  await client.query(
    `UPDATE sync_queue_item
        SET sync_status = 'synced', server_assigned_id = $2, error_reason = NULL,
            last_attempt_at = now()
      WHERE id = $1`,
    [id, serverAssignedId],
  );
}

/**
 * A terminal refusal. Only for reasons that cannot become true later — a topic that does not
 * exist, a parent that was itself refused, a vote on your own answer.
 *
 * `error_reason` holds the stable error CODE, not a sentence: S12 renders the explanation, and
 * a message written here would be a second copy of it that drifts.
 */
export async function markRejected(
  client: Queryable,
  id: string,
  reason: string,
): Promise<void> {
  await client.query(
    `UPDATE sync_queue_item
        SET sync_status = 'rejected', error_reason = $2, last_attempt_at = now()
      WHERE id = $1`,
    [id, reason],
  );
}

/**
 * A failure that is NOT terminal: the item stays `pending` and the attempt is counted.
 *
 * This is the distinction the whole reliability NFR rests on. A database blip, a rate-limit
 * ceiling, a provider timeout — none of those mean the student's post was bad, and writing
 * `rejected` for one would destroy a post that was never going to be refused. "Rejected" is
 * forever; "pending" can still become either.
 */
export async function markAttemptFailed(
  client: Queryable,
  id: string,
  reason: string,
): Promise<void> {
  await client.query(
    `UPDATE sync_queue_item
        SET retry_count = retry_count + 1, last_attempt_at = now(), error_reason = $2
      WHERE id = $1`,
    [id, reason],
  );
}

/**
 * The server id an earlier queued item was given — the ID-MAPPING the schema's write-model
 * fork (§4a) says this table exists for.
 *
 * An answer written offline names its parent by the local id the PHONE invented, because the
 * question it answers had no server id at the time. This is the only thing that can translate
 * one into the other.
 */
export async function resolveLocalId(
  client: Queryable,
  ownerProfileId: string,
  clientLocalId: string,
): Promise<QueueRow | null> {
  const { rows } = await client.query<QueueRow>(
    `SELECT ${QUEUE_COLUMNS} FROM sync_queue_item
      WHERE owner_profile_id = $1 AND client_local_id = $2`,
    [ownerProfileId, clientLocalId],
  );
  return rows[0] ?? null;
}

/**
 * Queue items that have been sitting non-terminal too long — the reconciliation T32 owns.
 *
 * Written here with T29 rather than left for T32 because the offline NFR is "100% of queued
 * writes reach a terminal state; none silently lost", and a claim like that is worth nothing
 * without the query that could disprove it. T32 adds the alerting around it.
 */
export async function findStuckItems(
  client: Queryable,
  olderThanMs: number,
): Promise<{ id: string; entity_type: string; retry_count: number; created_at: Date }[]> {
  const { rows } = await client.query<{
    id: string;
    entity_type: string;
    retry_count: number;
    created_at: Date;
  }>(
    `SELECT id, entity_type, retry_count, created_at
       FROM sync_queue_item
      WHERE sync_status IN ('pending', 'syncing')
        AND created_at < now() - make_interval(secs => $1::double precision)
      ORDER BY created_at`,
    [olderThanMs / 1000],
  );
  return rows;
}
