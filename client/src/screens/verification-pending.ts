import { elFromHTML } from "./dom";
import { dotsHTML, pageShell } from "./styles";

/**
 * S2 — VerificationPendingCard (ported from "S2 VerificationPendingCard.dc.html").
 * Resend calls A1 again (its resend path); the cooldown reflects A1's returned
 * `resendAvailableInSeconds`. "Go back and fix it" returns to S1.
 */

export interface VerificationPendingProps {
  phase: "waiting" | "sending" | "sent" | "failed";
  cooldownLeft: number; // seconds remaining before resend is allowed
  onResend: () => void;
  onBack: () => void;
  onEnterCode: () => void; // advance to S3 (see DEV-1 note below)
}

/**
 * DEV-1 (integration deviation): the designed S2 has no forward affordance to S3
 * (only Resend + Go back). A linear OTP flow needs one, so we add a single primary
 * "Enter your code" button below, built from the SAME verbatim primary-button spec
 * used in S1/S3/S4 — no new visual language invented. Flagged for the designer to
 * bless or restyle (e.g. demote Resend to a text link) in a Claude Design pass.
 */

export function renderVerificationPending(p: VerificationPendingProps): HTMLElement {
  const isSending = p.phase === "sending";
  const inCooldown = p.cooldownLeft > 0 && !isSending;
  const disabled = isSending || inCooldown;

  const btnBg = disabled && !isSending ? "#F4E5D9" : "#F26B4E";
  const btnColor = disabled && !isSending ? "#B99C8D" : "#FFF8F1";
  const btnShadow = disabled && !isSending ? "none" : "0 6px 18px rgba(242,107,78,.32)";
  const btnLabel = inCooldown ? `Resend in ${p.cooldownLeft}s` : "Resend email";
  const btnInner = isSending
    ? `<span style="display:flex; align-items:center; gap:7px">Resending ${dotsHTML}</span>`
    : btnLabel;

  const sentBadge =
    p.phase === "sent"
      ? `<div style="display:flex; gap:8px; align-items:center; background:#E7F1EA; border-radius:14px; padding:10px 16px; animation:popIn .35s cubic-bezier(.34,1.56,.64,1)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="#5D8E74" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>
          <span style="font-size:13.5px; font-weight:600; color:#4E7A62">Fresh code sent — give it a moment.</span>
        </div>`
      : "";
  const failedBadge =
    p.phase === "failed"
      ? `<div style="display:flex; gap:8px; align-items:flex-start; background:#FBEDE7; border-radius:14px; padding:11px 14px; animation:slideDown .22s ease">
          <span style="flex:none; width:16px; height:16px; margin-top:1px; border-radius:50%; background:#D96B57; color:#FFF8F1; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center">!</span>
          <span style="font-size:13.5px; line-height:1.5; color:#A8503E; text-align:left">That resend didn't go through — nothing's wrong on your end. Try once more in a moment.</span>
        </div>`
      : "";

  const inner = `<div>
    <div style="position:absolute; top:-60px; left:-50px; width:200px; height:200px; border-radius:50%; background:radial-gradient(circle at 40% 40%, rgba(111,162,135,.18), rgba(111,162,135,0) 70%); animation:blobFloat 10s ease-in-out infinite; pointer-events:none"></div>
    <div style="position:absolute; bottom:-50px; right:-40px; width:220px; height:220px; border-radius:50%; background:radial-gradient(circle at 60% 40%, rgba(242,107,78,.14), rgba(242,107,78,0) 70%); animation:blobFloat2 12s ease-in-out infinite; pointer-events:none"></div>
    <div style="position:relative; background:#FFFFFF; border-radius:26px; padding:38px 30px; box-shadow:0 12px 38px rgba(93,58,44,.1); display:flex; flex-direction:column; align-items:center; gap:16px; text-align:center">
      <div style="position:relative; width:92px; height:92px; display:flex; align-items:center; justify-content:center">
        <div style="position:absolute; inset:14px; border-radius:50%; border:2px solid rgba(111,162,135,.4); animation:ringPulse 2.6s ease-out infinite"></div>
        <div style="width:72px; height:72px; border-radius:50%; background:#E7F1EA; display:flex; align-items:center; justify-content:center; animation:envFloat 5s ease-in-out infinite">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M4 7h16v11H4V7z" stroke="#5D8E74" stroke-width="1.8" stroke-linejoin="round"></path><path d="M4 7l8 6 8-6" stroke="#5D8E74" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        </div>
      </div>
      <h1 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:27px; line-height:1.25; color:#3D2C26; text-wrap:pretty">Check your college inbox</h1>
      <p style="margin:0; font-size:14.5px; line-height:1.6; color:#8A7168; text-wrap:pretty">Your verification code is on its way. Email can take a couple of minutes — no rush, we'll wait right here.</p>
      ${sentBadge}
      ${failedBadge}
      <button id="mur-enter-code" class="mur-btn-primary" style="width:100%; border:none; cursor:pointer; border-radius:16px; padding:15px; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:16.5px; color:#FFF8F1; background:#F26B4E; box-shadow:0 6px 18px rgba(242,107,78,.32); transition:transform .18s cubic-bezier(.34,1.56,.64,1), background .18s ease">I have my code</button>
      <button id="mur-resend" class="mur-btn-lift" ${disabled ? "disabled" : ""} style="width:100%; border:none; cursor:${disabled ? "default" : "pointer"}; border-radius:16px; padding:15px; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:16.5px; color:${btnColor}; background:${btnBg}; box-shadow:${btnShadow}; transition:transform .18s cubic-bezier(.34,1.56,.64,1), background .18s ease; display:flex; align-items:center; justify-content:center; gap:8px">${btnInner}</button>
      <span style="font-size:12.5px; color:#C4AB9E">Wrong email? <a id="mur-back" href="#" style="font-weight:600">Go back and fix it</a></span>
    </div>
  </div>`;

  const root = elFromHTML(pageShell(inner));
  const resendBtn = root.querySelector<HTMLButtonElement>("#mur-resend")!;
  resendBtn.addEventListener("click", () => {
    if (!disabled) p.onResend();
  });
  root.querySelector<HTMLButtonElement>("#mur-enter-code")!.addEventListener("click", () => p.onEnterCode());
  const back = root.querySelector<HTMLAnchorElement>("#mur-back")!;
  back.addEventListener("click", (e) => {
    e.preventDefault();
    p.onBack();
  });
  return root;
}
