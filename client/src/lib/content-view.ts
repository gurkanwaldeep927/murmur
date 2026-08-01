/**
 * The content wire types and the state mappings the S5–S8 screens render from (T19).
 *
 * IMPORT-FREE BY DESIGN — see the note at the top of `format.ts`. This module carries the
 * R6-critical decisions ("is this item safe to show as live?", "can this be answered?"),
 * so it is deliberately the part of the client the root test suite can execute.
 *
 * The shapes below mirror `questionView()` / `answerView()` in
 * `server/src/modules/content/content.routes.ts`, NOT the snake_case rows in
 * `content.repo.ts`. The serializer is the boundary: it renames most fields to camelCase
 * but leaves the author projection snake_case, and that asymmetry is real.
 */

export type ModerationStatus = "pending" | "published" | "blocked";

export interface AuthorView {
  pseudonym: string;
  year_badge: string;
  reputation_score: number;
}

export interface TopicRef {
  slug: string;
  label: string;
}

export interface QuestionView {
  id: string;
  title: string;
  body: string;
  topic: TopicRef;
  moderationStatus: ModerationStatus;
  publishedAt: string | null;
  answerCount: number;
  createdAt: string;
  author: AuthorView;
}

export interface AnswerView {
  id: string;
  questionId: string;
  body: string;
  moderationStatus: ModerationStatus;
  accepted: boolean;
  voteCount: number;
  createdAt: string;
  author: AuthorView;
}

/** A3/A4's response body (`submissionResponse` in content.routes.ts). */
export interface SubmissionResult {
  id: string;
  moderationStatus: ModerationStatus;
  pendingReview: boolean;
  message: string;
  replayed?: true;
}

/**
 * Which of S7's three thread states to render.
 *
 * There is no author check here on purpose. `findQuestionById` selects
 * `WHERE moderation_status = 'published' OR author_profile_id = $viewer`, so if a
 * non-published question came back at all, the viewer IS its author. Re-deriving that
 * client-side (by comparing pseudonyms, say) would add a second, weaker copy of an
 * authorization rule the server already enforces — and the weaker copy is the one that
 * eventually disagrees.
 */
export function questionViewState(q: { moderationStatus: ModerationStatus }): ModerationStatus {
  return q.moderationStatus;
}

/**
 * What S6/S8 show after a submit. A3/A4 answer 202 for held content and 201 otherwise,
 * and `pendingReview` restates it in the body; both are checked because agreeing on
 * "held" is the single thing RR-5 depends on. If they ever disagree, treat it as held —
 * showing a live post as pending is a cosmetic error, the reverse is an R6 breach.
 */
export function submissionOutcome(res: SubmissionResult): ModerationStatus {
  if (res.pendingReview || res.moderationStatus === "pending") return "pending";
  return res.moderationStatus;
}

/**
 * Whether S7 may offer "Answer this". A4 refuses any parent that is not published
 * (`parent_question_not_found`, deliberately indistinguishable from a missing question so
 * answering cannot confirm that held content exists), so offering the affordance on a
 * held or blocked thread would produce a guaranteed failure.
 */
export function canAnswer(q: { moderationStatus: ModerationStatus }): boolean {
  return q.moderationStatus === "published";
}

/**
 * Whether a feed row is safe to render. The browse endpoint returns published rows only,
 * so this is a belt-and-braces filter over data the server already narrowed — cheap, and
 * it means a future endpoint change cannot silently start publishing held content
 * through S5.
 */
export function feedSafe<T extends { moderationStatus: ModerationStatus }>(rows: T[]): T[] {
  return rows.filter((r) => r.moderationStatus === "published");
}
