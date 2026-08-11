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
 * S6/S8's queued-offline card (T28).
 *
 * **Interim copy, and marked as such deliberately.** Every other string in this module is
 * the designer's, lifted from a `.dc.html` error branch. This one has no designer source:
 * the `.dc.html` composers were drawn before the offline queue existed and have no
 * queued state at all, and the sync screen that will own this language is T30, still
 * unwritten. The gap is recorded in `docs/design-prompts/T30-sync-status.md`.
 *
 * The precedent for shipping a sentence anyway is the `default:` branch above, and the rule
 * it follows is the one that matters here: it may be plainer than the designer's, but it
 * must not be *false*. Reusing S6's real pending card would have said "Asked — just one
 * quick check" about a post that never left the phone, and this project has written down
 * five times what a believable wrong message costs.
 *
 * It also does not promise WHEN. Nothing retries on a schedule — the queue drains when the
 * browser says the network is back (`sync.ts`), and a phone that never comes back never
 * sends. Saying "in a few minutes" would be the same lie in a smaller font.
 */
export const QUEUED_OFFLINE_MESSAGE =
  "No signal right now, so this is saved on this device. It sends itself the moment you're back online — nothing is lost.";

/**
 * The same thing, when the device could not even persist it. Storage was full or blocked,
 * so the post is held in memory for this run only and closing the app loses it. Told
 * plainly rather than shown the reassuring version, because the reassuring version is
 * untrue here — see `local-store.ts` on why a failed write is reported and not swallowed.
 */
export const QUEUED_UNSAVED_MESSAGE =
  "No signal right now, and this device wouldn't let the app save it either. It'll send when you're back online, but don't close the app before then.";

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
