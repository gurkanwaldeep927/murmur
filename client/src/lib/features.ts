/**
 * Affordances the designs draw but the backend cannot yet honour (T19).
 *
 * The rule these encode: a control that looks live and does nothing is worse than no
 * control at all. Each flag names the task that turns it on, and the screens read the
 * flag rather than commenting markup out — so switching one on is a one-line change with
 * the designer's markup already in place.
 *
 * IMPORT-FREE BY DESIGN — see the note at the top of `format.ts`.
 */
export const FEATURES = {
  /**
   * S7's upvote button and its count. A6 (the vote endpoint) and the reputation ledger
   * are T21/T22 in M3; there is nothing to call. Turn on with T22.
   */
  voting: false,

  /**
   * S7's "Report quietly" overflow item on both the question and each answer. It targets
   * S13 Report Content, which is T34/T39 in M5. Turn on with T40.
   */
  reporting: false,

  /**
   * S5's bottom-nav Search and Profile destinations (S9, S11). Both are M3 — T20/T25/T26.
   * The design already styles them muted; with this off they render exactly as drawn and
   * carry no click handler. Turn on with T26.
   */
  searchAndProfile: false,
} as const;
