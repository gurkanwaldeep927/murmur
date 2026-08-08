import { withTransaction } from "../../db/pool.js";
import { errors } from "../../shared/error-envelope.js";
import {
  appendEvent,
  applyScoreDelta,
  findVoteTarget,
  hasUpvoted,
  incrementVoteCount,
  markAccepted,
  questionHasAcceptedAnswer,
} from "./reputation.repo.js";

/**
 * A6 — Submit Vote / Accept Answer (T22).
 *
 * Reputation is server-authoritative: the client sends WHICH answer, never how many points.
 * Every rule below is enforced here for its message and in the schema for its truth
 * (decisions/a6-vote-accept-semantics.md §5) — the pre-checks exist so a student gets a named
 * error, and the constraint translation exists so a request that beats the pre-check gets the
 * identical one.
 */

/**
 * `[ASSUMPTION]` — no upstream document sets these. The 1:15 ratio says solving someone's
 * problem outranks being agreeable, which is the behaviour R5 wants. Named here so a re-tune
 * is one edit; note that changing them does NOT move existing scores, because the ledger
 * stores the delta applied at the time (decisions/a6-vote-accept-semantics.md §4).
 */
export const UPVOTE_DELTA = 1;
export const ACCEPTED_ANSWER_DELTA = 15;

export interface VoteResult {
  answerId: string;
  voteCount: number;
  accepted: boolean;
  /** The subject's score AFTER the write, re-read rather than computed (A6 outputs). */
  authorReputationScore: number;
}

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = "23505";
/** `RAISE EXCEPTION` with no explicit errcode, i.e. the self-vote trigger. */
const RAISED_EXCEPTION = "P0001";

function pgCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

function pgConstraint(err: unknown): string | undefined {
  const c = (err as { constraint?: unknown } | null)?.constraint;
  return typeof c === "string" ? c : undefined;
}

/**
 * Translate a constraint the database refused into the same error the pre-check would have
 * produced. Anything unrecognised is rethrown untouched — swallowing it here would turn a
 * real defect into a plausible-looking 409, which is the shape of bug this project keeps
 * paying for.
 */
function translateWriteFailure(err: unknown): never {
  const code = pgCode(err);
  if (code === RAISED_EXCEPTION && /self-vote forbidden/i.test((err as Error).message)) {
    throw errors.selfVoteForbidden();
  }
  if (code === UNIQUE_VIOLATION) {
    const constraint = pgConstraint(err);
    if (constraint === "uniq_reputation_event_actor_answer_upvote") {
      throw errors.duplicateVoteForbidden();
    }
    if (constraint === "uniq_answer_accepted_per_question") {
      throw errors.answerAlreadyAccepted();
    }
  }
  throw err;
}

export async function upvoteAnswer(input: {
  actorProfileId: string;
  answerId: string;
}): Promise<VoteResult> {
  return withTransaction(async (client) => {
    const target = await findVoteTarget(client, input.answerId);
    // Unpublished content earns nothing. The plan's own RR-21 wording is
    // "reputation-on-published-content", and R5's premise is that reputation reflects
    // helpful contribution — an answer still held by the moderation gateway has not
    // contributed anything yet, and one that was blocked never will.
    //
    // The refusal is `answer_not_found` rather than a distinct code on purpose: a held or
    // blocked answer is invisible in the feed, and a different error here would confirm to
    // a caller guessing IDs that the row exists.
    if (!target || target.moderation_status !== "published") throw errors.answerNotFound();

    if (target.answer_author_profile_id === input.actorProfileId) {
      throw errors.selfVoteForbidden();
    }
    if (await hasUpvoted(client, input.actorProfileId, input.answerId)) {
      throw errors.duplicateVoteForbidden();
    }

    try {
      await appendEvent(client, {
        eventType: "upvote",
        delta: UPVOTE_DELTA,
        actorProfileId: input.actorProfileId,
        subjectProfileId: target.answer_author_profile_id,
        answerId: input.answerId,
      });
      const voteCount = await incrementVoteCount(client, input.answerId);
      const score = await applyScoreDelta(
        client,
        target.answer_author_profile_id,
        UPVOTE_DELTA,
      );
      return {
        answerId: input.answerId,
        voteCount,
        accepted: target.accepted,
        authorReputationScore: score,
      };
    } catch (err) {
      translateWriteFailure(err);
    }
  });
}

export async function acceptAnswer(input: {
  actorProfileId: string;
  answerId: string;
}): Promise<VoteResult> {
  return withTransaction(async (client) => {
    const target = await findVoteTarget(client, input.answerId);
    // Unpublished content earns nothing. The plan's own RR-21 wording is
    // "reputation-on-published-content", and R5's premise is that reputation reflects
    // helpful contribution — an answer still held by the moderation gateway has not
    // contributed anything yet, and one that was blocked never will.
    //
    // The refusal is `answer_not_found` rather than a distinct code on purpose: a held or
    // blocked answer is invisible in the feed, and a different error here would confirm to
    // a caller guessing IDs that the row exists.
    if (!target || target.moderation_status !== "published") throw errors.answerNotFound();

    // Only the person who asked can say it answered them (§1). Checked before the
    // already-accepted case on purpose: a stranger must not be able to learn whether a
    // question has been resolved by reading which error they get back.
    if (target.question_author_profile_id !== input.actorProfileId) {
      throw errors.acceptNotQuestionAuthor();
    }
    if (target.answer_author_profile_id === input.actorProfileId) {
      throw errors.selfVoteForbidden();
    }
    if (await questionHasAcceptedAnswer(client, target.question_id)) {
      throw errors.answerAlreadyAccepted();
    }

    try {
      await appendEvent(client, {
        eventType: "accepted_answer",
        delta: ACCEPTED_ANSWER_DELTA,
        actorProfileId: input.actorProfileId,
        subjectProfileId: target.answer_author_profile_id,
        answerId: input.answerId,
      });
      await markAccepted(client, input.answerId);
      const score = await applyScoreDelta(
        client,
        target.answer_author_profile_id,
        ACCEPTED_ANSWER_DELTA,
      );
      return {
        answerId: input.answerId,
        voteCount: target.vote_count,
        accepted: true,
        authorReputationScore: score,
      };
    } catch (err) {
      translateWriteFailure(err);
    }
  });
}
