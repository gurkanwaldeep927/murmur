import { describe, expect, it } from "vitest";
import {
  canAnswer,
  feedSafe,
  questionViewState,
  submissionOutcome,
  type ModerationStatus,
  type SubmissionResult,
} from "../../client/src/lib/content-view.js";
import {
  answerErrorCopy,
  askErrorCopy,
  isAccountBlocked,
  isSessionDead,
} from "../../client/src/lib/content-errors.js";

/**
 * The client half of R6's fail-closed posture (T19).
 *
 * The server guarantees that held content never reaches another user; these pin the
 * client's side of it — that a held item is never *rendered* as live, and that the app
 * never offers an action the API will refuse. Kept as pure functions specifically so this
 * suite can execute them without a DOM.
 */

const submission = (over: Partial<SubmissionResult> = {}): SubmissionResult => ({
  id: "00000000-0000-4000-8000-000000000001",
  moderationStatus: "published",
  pendingReview: false,
  message: "Posted.",
  ...over,
});

describe("question view state", () => {
  it("test_R6_a_pending_question_never_maps_to_a_published_view_state", () => {
    expect(questionViewState({ moderationStatus: "pending" })).toBe("pending");
    expect(questionViewState({ moderationStatus: "blocked" })).toBe("blocked");
    expect(questionViewState({ moderationStatus: "published" })).toBe("published");
  });

  it("test_R6_the_feed_drops_anything_not_published", () => {
    const rows: { id: string; moderationStatus: ModerationStatus }[] = [
      { id: "a", moderationStatus: "published" },
      { id: "b", moderationStatus: "pending" },
      { id: "c", moderationStatus: "blocked" },
    ];
    expect(feedSafe(rows).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("submission outcome", () => {
  it("test_R6_a_202_hold_is_reported_as_pending_not_posted", () => {
    // The posture the app actually runs in until T14b: hold-all holds everything.
    const held = submission({
      moderationStatus: "pending",
      pendingReview: true,
      message: "Your post is being reviewed. It'll appear once it's cleared.",
    });
    expect(submissionOutcome(held)).toBe("pending");
  });

  it("test_R6_disagreement_between_the_two_hold_signals_resolves_to_pending", () => {
    // Showing a live post as pending is cosmetic; the reverse is an R6 breach. If the
    // flag and the status ever disagree, the safe reading wins.
    expect(submissionOutcome(submission({ pendingReview: true }))).toBe("pending");
  });

  it("test_a_blocked_submission_is_reported_as_blocked", () => {
    expect(
      submissionOutcome(submission({ moderationStatus: "blocked", pendingReview: false })),
    ).toBe("blocked");
  });

  it("test_a_cleared_submission_is_reported_as_published", () => {
    expect(submissionOutcome(submission())).toBe("published");
  });
});

describe("answerability", () => {
  it("test_R6_only_a_published_question_is_answerable", () => {
    // A4 refuses any non-published parent with parent_question_not_found, so offering
    // "Answer this" on a held thread would be a guaranteed failure.
    expect(canAnswer({ moderationStatus: "published" })).toBe(true);
    expect(canAnswer({ moderationStatus: "pending" })).toBe(false);
    expect(canAnswer({ moderationStatus: "blocked" })).toBe(false);
  });
});

describe("error routing", () => {
  it("test_only_a_401_sends_the_user_back_through_registration", () => {
    expect(isSessionDead(401)).toBe(true);
    // 403 is terminal, NOT a reason to re-register (oq-14 decision §6) — presenting S1 to
    // a banned user offers the registration A11 exists to refuse.
    expect(isSessionDead(403)).toBe(false);
  });

  it("test_suspended_and_banned_are_treated_as_account_states", () => {
    expect(isAccountBlocked("account_suspended")).toBe(true);
    expect(isAccountBlocked("account_banned")).toBe(true);
    expect(isAccountBlocked("session_required")).toBe(false);
  });

  it("test_composer_errors_fall_back_to_the_server_message_rather_than_a_guess", () => {
    // Codes the designer's mock never covered must surface the server's own words, not a
    // sentence invented client-side.
    expect(askErrorCopy("some_new_code", "Server said this.")).toBe("Server said this.");
    expect(answerErrorCopy("some_new_code", "Server said this.")).toBe("Server said this.");
  });

  it("test_known_codes_use_the_designers_copy", () => {
    expect(askErrorCopy("account_suspended")).toMatch(/can't post right now/);
    expect(answerErrorCopy("parent_question_not_found")).toMatch(/taken down while you were writing/);
  });
});
