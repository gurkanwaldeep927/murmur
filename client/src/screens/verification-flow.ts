import {
  ApiCallError,
  confirmVerification,
  emitEvent,
  exchangeBootstrapToken,
  initiateVerification,
} from "../api";
import { saveSession } from "../session";
import { mountAppShell } from "./app-shell";
import { render } from "./dom";
import { emailErrorCopy, renderEmailEntry } from "./email-entry";
import { renderVerificationPending } from "./verification-pending";
import { renderTokenConfirm } from "./token-confirm";
import { renderRegistrationOutcome, type OutcomeKind } from "./registration-outcome";

/**
 * F1 verification flow controller (plan T10). Wires the ported S1–S4 screens to the
 * real A1 (initiate) and A2 (confirm) endpoints via ../api. This file is the
 * integration/state-machine layer (architecture: client/src/screens owns composition);
 * it holds no visual markup of its own.
 *
 * Flow: S1 email → A1 → S2 check-inbox → S3 OTP → A2 → S4 outcome.
 */

const CAMPUS_DOMAIN = import.meta.env.VITE_CAMPUS_DOMAIN ?? "nitw.ac.in";

interface FlowState {
  screen: "s1" | "s2" | "s3" | "s4";
  email: string;
  s1Loading: boolean;
  s1Error: string | null;
  s1Phase: "form" | "success";
  s2Phase: "waiting" | "sending" | "sent" | "failed";
  s2CooldownLeft: number;
  s3Phase: "form" | "loading" | "error" | "success";
  s4Outcome: OutcomeKind;
  pseudonym?: string;
  yearBadge?: string;
  /**
   * The profile id, carried since T28 because the shell keys the offline outbox and the
   * draft store by it. Not defaulted to `""` anywhere: an empty key would put every
   * profile that ever lost its id into one shared bucket, and a shared outbox publishes
   * one student's post under another's pseudonym (see `outbox-store.ts`).
   */
  profileId?: string;
}

export function mountVerificationFlow(mount: HTMLElement): void {
  const state: FlowState = {
    screen: "s1",
    email: "",
    s1Loading: false,
    s1Error: null,
    s1Phase: "form",
    s2Phase: "waiting",
    s2CooldownLeft: 0,
    s3Phase: "form",
    s4Outcome: "loading",
  };

  // Set when the bootstrap-token exchange fails. The user is verified either way, so S4
  // still celebrates — but there is no session, so "Continue" must not mount the
  // authenticated shell only for its first request to 401 and bounce them to S1.
  let exchangeFailed = false;

  let cooldownTimer: ReturnType<typeof setInterval> | null = null;
  const stopCooldown = () => {
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = null;
  };

  // Update the S2 resend button in place each second (avoids re-rendering the card,
  // which would restart its ring/envelope animations).
  const startCooldown = (seconds: number) => {
    state.s2CooldownLeft = seconds;
    stopCooldown();
    if (seconds <= 0) return;
    cooldownTimer = setInterval(() => {
      state.s2CooldownLeft -= 1;
      const btn = mount.querySelector<HTMLButtonElement>("#mur-resend");
      if (state.s2CooldownLeft > 0 && btn && state.s2Phase !== "sending") {
        btn.textContent = `Resend in ${state.s2CooldownLeft}s`;
        btn.disabled = true;
        btn.style.background = "#F4E5D9";
        btn.style.color = "#B99C8D";
        btn.style.boxShadow = "none";
        btn.style.cursor = "default";
      } else {
        stopCooldown();
        if (state.screen === "s2" && state.s2Phase !== "sending") draw();
      }
    }, 1000);
  };

  function draw(): void {
    switch (state.screen) {
      case "s1":
        render(
          mount,
          renderEmailEntry({
            email: state.email,
            campusDomain: CAMPUS_DOMAIN,
            loading: state.s1Loading,
            errorMsg: state.s1Error,
            phase: state.s1Phase,
            onEmailInput: (v) => {
              // No re-render on keystroke — keep focus; just track + clear stale error.
              state.email = v;
              if (state.s1Error) {
                state.s1Error = null;
                const box = mount.querySelector<HTMLElement>("[data-s1-error]");
                if (box) box.remove();
              }
            },
            onSubmit: () => void submitEmail(),
          }),
        );
        break;
      case "s2":
        render(
          mount,
          renderVerificationPending({
            phase: state.s2Phase,
            cooldownLeft: state.s2CooldownLeft,
            onResend: () => void resend(),
            onBack: () => {
              stopCooldown();
              state.screen = "s1";
              state.s1Phase = "form";
              state.s1Loading = false;
              state.s1Error = null;
              draw();
            },
            onEnterCode: () => {
              state.screen = "s3";
              state.s3Phase = "form";
              draw();
            },
          }),
        );
        break;
      case "s3":
        render(
          mount,
          renderTokenConfirm({
            phase: state.s3Phase,
            onSubmit: (code) => void confirmCode(code),
            onResend: () => void resendFromS3(),
          }),
        );
        break;
      case "s4":
        render(
          mount,
          renderRegistrationOutcome({
            outcome: state.s4Outcome,
            pseudonym: state.pseudonym,
            yearBadge: state.yearBadge,
            onContinue: () => {
              // Straight into the authenticated shell (T19) — but only if the bootstrap
              // token actually became a session. Mounting the shell without one puts the
              // user through a badge, a celebration and an instant bounce back to S1 with
              // no explanation, which is precisely the bug the missing /session proxy
              // entry caused.
              // A missing profile id is treated exactly like a failed exchange (T28). The
              // shell keys the outbox and the drafts by it, and a blank key is a bucket
              // every id-less profile would share — so this refuses to mount rather than
              // mount something that could publish one student's post as another's.
              if (exchangeFailed || !state.profileId) {
                state.screen = "s3";
                state.s3Phase = "error";
                draw();
                return;
              }
              mountAppShell(
                mount,
                {
                  id: state.profileId,
                  pseudonym: state.pseudonym ?? "",
                  year_badge: state.yearBadge ?? "",
                },
                () => mountVerificationFlow(mount),
              );
            },
            onRetry: () => {
              state.screen = "s3";
              state.s3Phase = "form";
              draw();
            },
            onGrievance: () => {
              // Grievance officer contact is M5 (S15). Placeholder until then.
              alert("Grievance officer contact arrives in a later milestone (M5).");
            },
          }),
        );
        break;
    }
  }

  // --- A1: initiate (S1 submit) ---
  async function submitEmail(): Promise<void> {
    if (state.s1Loading) return;
    if (!state.email.trim()) return;
    state.s1Loading = true;
    state.s1Error = null;
    draw();
    try {
      const res = await initiateVerification(state.email.trim());
      emitEvent("client.registration.verification_initiated");
      state.s1Loading = false;
      state.s1Phase = "success";
      draw();
      // Brief "On its way" confirmation, then advance to S2.
      window.setTimeout(() => {
        state.screen = "s2";
        state.s1Phase = "form";
        state.s2Phase = "waiting";
        startCooldown(res.resendAvailableInSeconds);
        draw();
      }, 1100);
    } catch (err) {
      state.s1Loading = false;
      state.s1Phase = "form";
      state.s1Error =
        err instanceof ApiCallError
          ? emailErrorCopy(err.apiError.code, CAMPUS_DOMAIN)
          : emailErrorCopy("internal_error", CAMPUS_DOMAIN);
      draw();
    }
  }

  // --- A1: resend (S2) ---
  async function resend(): Promise<void> {
    if (state.s2Phase === "sending" || state.s2CooldownLeft > 0) return;
    state.s2Phase = "sending";
    stopCooldown();
    draw();
    try {
      const res = await initiateVerification(state.email.trim());
      emitEvent("client.registration.verification_resent");
      state.s2Phase = "sent";
      draw();
      startCooldown(res.resendAvailableInSeconds);
    } catch {
      state.s2Phase = "failed";
      draw();
    }
  }

  // --- A1: resend triggered from S3's "send a new code" ---
  async function resendFromS3(): Promise<void> {
    try {
      await initiateVerification(state.email.trim());
      emitEvent("client.registration.verification_resent");
    } catch {
      /* surfaced on next confirm attempt; keep the user on S3 */
    }
    state.s3Phase = "form";
    draw();
  }

  // --- A2: confirm (S3 submit) ---
  async function confirmCode(code: string): Promise<void> {
    if (state.s3Phase === "loading") return;
    state.s3Phase = "loading";
    draw();
    try {
      const res = await confirmVerification(state.email.trim(), code);
      if (res.outcome === "verified") {
        // A2 returns a 15-minute BOOTSTRAP token, not a session (T12 §2). Trade it for
        // the real credential immediately and persist that. A failed exchange is not
        // fatal to S4 — the user is verified either way; they just land signed-out and
        // the M2 shell will send them back through sign-in.
        try {
          const { sessionToken, profile } = await exchangeBootstrapToken(res.sessionToken);
          saveSession({ token: sessionToken, profile });
        } catch (err) {
          // Verified but not signed in. S4 still shows the success outcome — they ARE
          // verified — but this must never be silent again: when the dev proxy was
          // missing /session, the exchange failed, this catch ate it, and the only
          // symptom was the user landing back on S1 after seeing their badge.
          console.warn("[murmur] session exchange failed; continuing signed-out", err);
          exchangeFailed = true;
        }
        emitEvent("client.registration.verification_confirmed");
        state.s3Phase = "success";
        draw();
        window.setTimeout(() => {
          state.screen = "s4";
          state.s4Outcome = "success";
          state.pseudonym = res.profile.pseudonym;
          state.yearBadge = res.profile.year_badge;
          state.profileId = res.profile.id;
          draw();
        }, 800);
        return;
      }
      // Blocked (unparseable year, never guessed) and refused (banned) are terminal S4 states.
      state.screen = "s4";
      state.s4Outcome = res.outcome === "blocked" ? "blocked" : "refused";
      draw();
    } catch (err) {
      if (err instanceof ApiCallError && err.apiError.code === "token_invalid_or_expired") {
        // Stay on S3, show the inline "code expired" error.
        state.s3Phase = "error";
        draw();
        return;
      }
      state.screen = "s4";
      state.s4Outcome = "error";
      draw();
    }
  }

  draw();
}
