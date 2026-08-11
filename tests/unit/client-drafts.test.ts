import { beforeEach, describe, expect, it } from "vitest";
import { draftKeyOf, isEmptyDraft, mergeDraft } from "../../client/src/lib/drafts.js";
import { createDraftStore } from "../../client/src/drafts-store.js";
import type { KeyValueStorage } from "../../client/src/local-store.js";

/**
 * T28 — draft autosave.
 *
 * The bug this file exists to prevent is silent and cumulative: an autosave that INSERTS
 * instead of overwriting. Nothing errors; the store just grows, and reopening the composer
 * eventually faces a pile of drafts with no defensible way to pick one. Migration 004's own
 * header records that the frozen schema's two halves disagreed about exactly this — the DDL
 * declared no unique index and the index table required two. These tests hold the local
 * store to the index table's version.
 */

class FakeStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

let storage: FakeStorage;
beforeEach(() => {
  storage = new FakeStorage();
});

describe("the draft slots mirror migration 004's two unique indexes", () => {
  it("test_one_question_draft_per_profile", () => {
    // uq_content_draft_one_question_per_profile
    expect(
      draftKeyOf({ entityType: "question", topic: "a", title: "x", body: "y", updatedAt: "t" }),
    ).toBe(
      draftKeyOf({ entityType: "question", topic: "b", title: "z", body: "w", updatedAt: "t" }),
    );
  });

  it("test_one_answer_draft_per_question_and_not_one_per_profile", () => {
    // uq_content_draft_one_answer_per_question. Collapsing these to a single answer slot
    // would mean opening a second thread silently destroys the first thread's draft.
    const a = draftKeyOf({ entityType: "answer", parentQuestionId: "q1", body: "", updatedAt: "t" });
    const b = draftKeyOf({ entityType: "answer", parentQuestionId: "q2", body: "", updatedAt: "t" });
    expect(a).not.toBe(b);
    expect(a).toBe(
      draftKeyOf({ entityType: "answer", parentQuestionId: "q1", body: "other", updatedAt: "t" }),
    );
  });

  it("test_a_question_draft_and_an_answer_draft_never_share_a_slot", () => {
    expect(
      draftKeyOf({ entityType: "question", topic: null, title: "", body: "x", updatedAt: "t" }),
    ).not.toBe(
      draftKeyOf({ entityType: "answer", parentQuestionId: "q1", body: "x", updatedAt: "t" }),
    );
  });
});

describe("saving overwrites rather than appends", () => {
  it("test_typing_a_question_leaves_exactly_one_draft_however_many_saves_it_took", () => {
    const store = createDraftStore("profile-asha", storage);
    for (const body of ["W", "Wh", "Wha", "What"]) {
      store.save({
        entityType: "question",
        topic: "placements",
        title: "T",
        body,
        updatedAt: `2026-08-11T09:00:0${body.length}.000Z`,
      });
    }
    expect(store.all()).toHaveLength(1);
    const draft = store.read("question");
    expect(draft?.entityType === "question" && draft.body).toBe("What");
  });

  it("test_answering_two_different_questions_keeps_two_drafts", () => {
    const store = createDraftStore("profile-asha", storage);
    store.save({ entityType: "answer", parentQuestionId: "q1", body: "one", updatedAt: "2026-08-11T09:00:00.000Z" });
    store.save({ entityType: "answer", parentQuestionId: "q2", body: "two", updatedAt: "2026-08-11T09:00:01.000Z" });
    expect(store.all()).toHaveLength(2);
  });
});

describe("emptying and discarding", () => {
  it("test_an_emptied_composer_has_no_draft", () => {
    const store = createDraftStore("profile-asha", storage);
    store.save({ entityType: "question", topic: "placements", title: "T", body: "B", updatedAt: "2026-08-11T09:00:00.000Z" });
    store.save({ entityType: "question", topic: null, title: "  ", body: "", updatedAt: "2026-08-11T09:00:01.000Z" });
    expect(store.read("question")).toBeNull();
  });

  it("test_isEmptyDraft_reads_whitespace_as_empty", () => {
    expect(isEmptyDraft({ entityType: "answer", parentQuestionId: "q1", body: "   \n ", updatedAt: "t" })).toBe(true);
    expect(isEmptyDraft({ entityType: "answer", parentQuestionId: "q1", body: "hi", updatedAt: "t" })).toBe(false);
  });

  it("test_discarding_a_slot_that_is_not_there_is_not_an_error", () => {
    expect(createDraftStore("profile-asha", storage).discard("question")).toBe(true);
  });
});

describe("two tabs writing the same slot", () => {
  it("test_the_later_write_wins", () => {
    const older = { entityType: "question", topic: null, title: "old", body: "b", updatedAt: "2026-08-11T09:00:00.000Z" } as const;
    const newer = { entityType: "question", topic: null, title: "new", body: "b", updatedAt: "2026-08-11T09:00:05.000Z" } as const;
    expect(mergeDraft(older, newer)).toBe(newer);
  });

  it("test_a_tie_keeps_the_incumbent_so_a_stale_restore_cannot_overwrite_live_typing", () => {
    const held = { entityType: "question", topic: null, title: "live", body: "b", updatedAt: "2026-08-11T09:00:00.000Z" } as const;
    const arriving = { entityType: "question", topic: null, title: "stale", body: "b", updatedAt: "2026-08-11T09:00:00.000Z" } as const;
    expect(mergeDraft(held, arriving)).toBe(held);
  });
});

describe("drafts are the most private thing the product holds", () => {
  it("test_the_second_student_on_a_phone_does_not_open_the_composer_onto_the_first_ones_draft", () => {
    // A half-written thought is more private than a published post: the student never chose
    // to show it to anyone. Migration 004 says the same about the server-side table.
    const asha = createDraftStore("profile-asha", storage);
    const bilal = createDraftStore("profile-bilal", storage);
    asha.save({ entityType: "question", topic: null, title: "personal", body: "b", updatedAt: "2026-08-11T09:00:00.000Z" });
    expect(bilal.read("question")).toBeNull();
    expect(asha.read("question")).not.toBeNull();
  });
});
