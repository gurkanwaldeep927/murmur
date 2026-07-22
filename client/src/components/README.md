# `client/src/components/` — Claude Design output ONLY

Per the stage-6 human decision (docs/06-ui.md `deviations[0]`, plan `deviations[0]`),
visual component code is authored **exclusively by Claude Design** and lands here
verbatim. Claude Code never authors or restyles files in this folder — it only
*integrates* them (wiring props to the API and state machines) from `../screens/`.

The 17 components arrive across Claude Design rounds T9 / T18 / T25 / T30 / T39:

- **Round 1 (T9, M1):** EmailEntryForm, VerificationPendingCard, TokenConfirmForm,
  RegistrationOutcomePanel — the S1–S4 registration flow this milestone integrates.

Paste the `docs/06-ui.md` §2 design contract and §3.1–§3.4 prompts into Claude Design;
drop the returned component files here; then the T10 integration task in `../screens/`
wires them to `POST /verification/initiate` and `POST /verification/confirm`.
