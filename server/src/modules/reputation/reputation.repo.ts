import type { DbClient, Queryable } from "../../db/pool.js";

/**
 * Reputation persistence (T22) — owns `reputation_event` and the cached aggregates derived
 * from it (`answer.vote_count`, `answer.accepted`, `pseudonymous_profile.reputation_score`).
 *
 * The ledger is the source of truth; the cached columns are a read optimisation, written in
 * the same transaction as the ledger row (decisions/oq-schema-aggregates-and-vote-enforcement.md).
 *
 * Nothing here returns an identity reference. `author_profile_id` is needed INSIDE this module
 * to decide who may vote and who gets credited, and it never crosses the route boundary
 * (NFR identity non-disclosure).
 */

export interface VoteTarget {
  answer_id: string;
  question_id: string;
  answer_author_profile_id: string;
  question_author_profile_id: string;
  accepted: boolean;
  vote_count: number;
  moderation_status: string;
}

/**
 * Everything the vote rules need, in one read. Deliberately one query rather than three:
 * the checks that follow must all be made against the same snapshot, and inside the
 * transaction that will write the ledger row.
 */
export async function findVoteTarget(
  client: Queryable,
  answerId: string,
): Promise<VoteTarget | null> {
  const { rows } = await client.query<VoteTarget>(
    `SELECT a.id                AS answer_id,
            a.question_id       AS question_id,
            a.author_profile_id AS answer_author_profile_id,
            q.author_profile_id AS question_author_profile_id,
            a.accepted          AS accepted,
            a.vote_count        AS vote_count,
            a.moderation_status AS moderation_status
       FROM answer a
       JOIN question q ON q.id = a.question_id
      WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [answerId],
  );
  return rows[0] ?? null;
}

export async function hasUpvoted(
  client: Queryable,
  actorProfileId: string,
  answerId: string,
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM reputation_event
      WHERE event_type = 'upvote' AND actor_profile_id = $1 AND answer_id = $2
      LIMIT 1`,
    [actorProfileId, answerId],
  );
  return rows.length > 0;
}

/**
 * Whether the question already has an accepted answer — asked of the QUESTION, not of the
 * answer being accepted. One accepted answer per question (decisions/a6-vote-accept-semantics
 * §3), so the row that blocks a second accept is usually a different answer entirely.
 */
export async function questionHasAcceptedAnswer(
  client: Queryable,
  questionId: string,
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM answer WHERE question_id = $1 AND accepted LIMIT 1`,
    [questionId],
  );
  return rows.length > 0;
}

export interface LedgerWrite {
  eventType: "upvote" | "accepted_answer" | "violation_penalty";
  delta: number;
  actorProfileId: string | null;
  subjectProfileId: string;
  answerId: string;
}

/** Append to the ledger. Never updated afterwards — the row IS the history. */
export async function appendEvent(client: DbClient, write: LedgerWrite): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO reputation_event
       (event_type, delta, actor_profile_id, subject_profile_id, answer_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [write.eventType, write.delta, write.actorProfileId, write.subjectProfileId, write.answerId],
  );
  return rows[0]!.id;
}

/**
 * Move the subject's cached score by the same delta that just entered the ledger, and return
 * the new value so the response reports what was actually stored rather than what the caller
 * computed. A6's outputs name "updated visible reputation score", and re-reading is the only
 * way that number cannot drift from the row.
 */
export async function applyScoreDelta(
  client: DbClient,
  subjectProfileId: string,
  delta: number,
): Promise<number> {
  const { rows } = await client.query<{ reputation_score: number }>(
    `UPDATE pseudonymous_profile
        SET reputation_score = reputation_score + $2
      WHERE id = $1
      RETURNING reputation_score`,
    [subjectProfileId, delta],
  );
  return rows[0]!.reputation_score;
}

export async function incrementVoteCount(client: DbClient, answerId: string): Promise<number> {
  const { rows } = await client.query<{ vote_count: number }>(
    `UPDATE answer SET vote_count = vote_count + 1 WHERE id = $1 RETURNING vote_count`,
    [answerId],
  );
  return rows[0]!.vote_count;
}

export async function markAccepted(client: DbClient, answerId: string): Promise<void> {
  await client.query(`UPDATE answer SET accepted = true WHERE id = $1`, [answerId]);
}

// ---------------------------------------------------------------------------
// Reconciliation — required of this task by the T21 decision.
// ---------------------------------------------------------------------------

export interface ScoreDrift {
  profile_id: string;
  cached: number;
  ledger: number;
}

export interface VoteCountDrift {
  answer_id: string;
  cached: number;
  ledger: number;
}

/**
 * Every profile whose cached `reputation_score` disagrees with the sum of its ledger.
 *
 * Synchronous cache updates were chosen over a recomputation job precisely because a job can
 * die quietly; the price of that choice is that a bug in the write path can leave the two
 * disagreeing. This is what makes such a disagreement FINDABLE. An empty result is the only
 * evidence that the cache is honest — and it is only evidence if something also proves this
 * query notices when it is not, which the T22 tests do by corrupting a row on purpose.
 *
 * Profiles with no ledger rows are included via the LEFT JOIN, so a cache that drifted upward
 * from zero is caught rather than skipped.
 */
export async function findScoreDrift(client: Queryable): Promise<ScoreDrift[]> {
  const { rows } = await client.query<ScoreDrift>(
    `SELECT p.id AS profile_id,
            p.reputation_score AS cached,
            COALESCE(SUM(e.delta), 0)::int AS ledger
       FROM pseudonymous_profile p
       LEFT JOIN reputation_event e ON e.subject_profile_id = p.id
      GROUP BY p.id, p.reputation_score
     HAVING p.reputation_score <> COALESCE(SUM(e.delta), 0)::int
      ORDER BY p.id`,
  );
  return rows;
}

/** The same check for `answer.vote_count` against the ledger's upvote rows. */
export async function findVoteCountDrift(client: Queryable): Promise<VoteCountDrift[]> {
  const { rows } = await client.query<VoteCountDrift>(
    `SELECT a.id AS answer_id,
            a.vote_count AS cached,
            count(e.id)::int AS ledger
       FROM answer a
       LEFT JOIN reputation_event e
         ON e.answer_id = a.id AND e.event_type = 'upvote'
      GROUP BY a.id, a.vote_count
     HAVING a.vote_count <> count(e.id)::int
      ORDER BY a.id`,
  );
  return rows;
}
