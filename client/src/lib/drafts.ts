/**
 * Draft autosave (plan T28; UX F9).
 *
 * IMPORT-FREE BY DESIGN — see the note at the top of `format.ts`.
 *
 * ## Why drafts live on the phone and not in `content_draft`
 *
 * Migration 004 (T27) creates a `content_draft` table, and **nothing anywhere exposes it.**
 * There is no endpoint in `docs/03-trd.md`, no route in `server/src/`, and no task in
 * `docs/07-plan.md` that builds one. That is recorded in `docs/TASK-STATUS.md` rather than
 * invented around here.
 *
 * It changes nothing about T28, because a draft is a thing you write when you have no
 * signal: a draft store that needs the network to save is not a draft store. Local is the
 * correct home for the autosave itself either way.
 *
 * What is genuinely NOT built is the *server* half — the reason `content_draft.updated_at`
 * carries a last-write-wins comment in the schema is cross-device draft sync, and that has
 * no owner. Starting a question on a laptop does not continue it on a phone.
 *
 * ## The two keys, and why they are the migration's two indexes
 *
 * `uq_content_draft_one_question_per_profile` and
 * `uq_content_draft_one_answer_per_question` are what make autosave an upsert rather than
 * an insert-per-keystroke. The same two rules are reproduced here as the key function, so
 * the local store overwrites in exactly the places the table would have. Without it, "save
 * as you type" means a fresh draft every few seconds and a pile of them at reopen — silent,
 * because nothing errors and the store just grows.
 */

export type DraftEntityType = "question" | "answer";

export interface QuestionDraft {
  entityType: "question";
  /** Topic SLUG, not label — A3 takes slugs (README note 4). Null until one is picked. */
  topic: string | null;
  title: string;
  body: string;
  /** ISO-8601. The only thing that can say which of two drafts is newer. */
  updatedAt: string;
}

export interface AnswerDraft {
  entityType: "answer";
  parentQuestionId: string;
  body: string;
  updatedAt: string;
}

export type Draft = QuestionDraft | AnswerDraft;

/**
 * One draft slot per the migration's unique indexes: one question draft per profile, one
 * answer draft per question. Anything that maps to the same key overwrites.
 */
export function draftKeyOf(draft: Draft): string {
  return draft.entityType === "question" ? "question" : `answer:${draft.parentQuestionId}`;
}

/** True when the draft holds nothing worth keeping — an empty draft is a deleted one. */
export function isEmptyDraft(draft: Draft): boolean {
  if (draft.entityType === "answer") return draft.body.trim() === "";
  return draft.title.trim() === "" && draft.body.trim() === "" && draft.topic === null;
}

/**
 * Last-write-wins on `updatedAt`, matching `docs/05-schema.md` §4a.
 *
 * A tie keeps the INCUMBENT rather than the newcomer. Two saves inside the same millisecond
 * are the same typing session, and preferring the newcomer there would let a stale restore
 * (a second tab loading what it read at open) overwrite live keystrokes.
 */
export function mergeDraft(existing: Draft | null, incoming: Draft): Draft {
  if (!existing) return incoming;
  return incoming.updatedAt > existing.updatedAt ? incoming : existing;
}
