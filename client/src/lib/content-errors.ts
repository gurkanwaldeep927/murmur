/**
 * API error code -> the copy the S6/S8 composers show, mirroring `emailErrorCopy()` in
 * `../screens/email-entry.ts` (T10's pattern).
 *
 * IMPORT-FREE BY DESIGN — see the note at the top of `format.ts`.
 *
 * Every string here is the designer's, taken from the `.dc.html` sources' own error
 * branches. Where a code has no designer string (the API grew branches the mock never
 * covered) the server's `message` is used instead at the call site rather than a
 * sentence invented here — see docs/design-prompts/T19-round-3.md.
 */

/** S6 AskComposer's error strings. */
export function askErrorCopy(code: string, serverMessage?: string): string {
  switch (code) {
    case "account_suspended":
    case "account_banned":
      // Designer's copy, verbatim from "S6 AskComposer.dc.html".
      return "Your account can't post right now. Check My Profile for details — and if something feels wrong, the grievance officer is one tap away.";
    case "topic_invalid":
      // Designer's copy for the missing-topic case, verbatim.
      return "Pick a topic so the right seniors find it.";
    case "rate_limited":
      return "Lots of tries in a row — take a short breather and try again in a minute.";
    case "validation_failed":
    case "idempotency_key_conflict":
      return serverMessage ?? "That didn't go through. Give it another look and try again.";
    default:
      return serverMessage ?? "Something went wrong posting that. Please try again in a moment.";
  }
}

/** S8 AnswerComposer's error strings. */
export function answerErrorCopy(code: string, serverMessage?: string): string {
  switch (code) {
    case "parent_question_not_found":
      // Designer's "error-removed" copy, verbatim from "S8 AnswerComposer.dc.html".
      return "This question was taken down while you were writing — your words aren't lost, they're in your drafts.";
    case "account_suspended":
    case "account_banned":
      // Designer's "error-restricted" copy, verbatim.
      return "Your account can't post right now. Check My Profile for details — the grievance officer is one tap away if something feels wrong.";
    case "rate_limited":
      return "Lots of tries in a row — take a short breather and try again in a minute.";
    default:
      return serverMessage ?? "Something went wrong posting that. Please try again in a moment.";
  }
}

/**
 * True when an error means the caller's session is gone and the app must return to S1.
 * `api.ts`'s `handle()` has already cleared local storage by the time this is asked; this
 * is only about which screen to mount next.
 */
export function isSessionDead(status: number): boolean {
  return status === 401;
}

/**
 * True for the terminal account states. Deliberately NOT session-dead: sending a banned
 * user back through S1 would present registration, which A11's ban check exists to refuse
 * (decisions/oq-14-session-mechanism.md §6).
 */
export function isAccountBlocked(code: string): boolean {
  return code === "account_suspended" || code === "account_banned";
}
