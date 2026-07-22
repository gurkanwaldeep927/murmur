import { elFromHTML } from "./dom";
import { dotsHTML, pageShell } from "./styles";

/**
 * S3 — TokenConfirmForm (ported from "S3 TokenConfirmForm.dc.html").
 * Six-digit OTP entry with the designer's paste-fill / backspace / arrow behavior.
 * `onSubmit(code)` calls A2; `onResend` re-issues via A1. `phase` is driven by the
 * flow controller (loading during the A2 call; error on token_invalid_or_expired).
 */

export interface TokenConfirmProps {
  phase: "form" | "loading" | "error" | "success";
  onSubmit: (code: string) => void;
  onResend: () => void;
}

function otpBoxHTML(i: number, disabled: boolean): string {
  return `<input class="mur-otp" data-idx="${i}" inputmode="numeric" maxlength="1" ${disabled ? "disabled" : ""} style="width:46px; height:56px; text-align:center; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:24px; color:#3D2C26; background:#FFFCF9; border:2px solid #F0DCD0; border-radius:14px; outline:none; caret-color:#F26B4E; transition:border-color .15s ease, box-shadow .15s ease, transform .15s cubic-bezier(.34,1.56,.64,1)">`;
}

export function renderTokenConfirm(p: TokenConfirmProps): HTMLElement {
  if (p.phase === "success") {
    const inner = `<div>
      ${decor()}
      <div style="position:relative; background:#FFFFFF; border-radius:26px; padding:42px 30px; box-shadow:0 12px 38px rgba(93,58,44,.1); display:flex; flex-direction:column; align-items:center; gap:14px; text-align:center; animation:popIn .4s cubic-bezier(.34,1.56,.64,1)">
        <div style="width:60px; height:60px; border-radius:50%; background:#E7F1EA; display:flex; align-items:center; justify-content:center; animation:popIn .5s cubic-bezier(.34,1.56,.64,1)">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="#5D8E74" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        </div>
        <h2 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:24px; color:#3D2C26">Code accepted</h2>
        <p style="margin:0; font-size:14.5px; line-height:1.55; color:#8A7168">Setting up your campus identity…</p>
      </div>
    </div>`;
    return elFromHTML(pageShell(inner));
  }

  const loading = p.phase === "loading";
  const boxes = Array.from({ length: 6 }, (_, i) => otpBoxHTML(i, loading)).join("");
  const errorBlock =
    p.phase === "error"
      ? `<div style="display:flex; gap:8px; align-items:flex-start; background:#FBEDE7; border-radius:14px; padding:11px 14px; animation:slideDown .22s ease; text-align:left">
          <span style="flex:none; width:16px; height:16px; margin-top:1px; border-radius:50%; background:#D96B57; color:#FFF8F1; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center">!</span>
          <span style="font-size:13.5px; line-height:1.5; color:#A8503E">No problem — that code has expired. <a id="mur-resend-inline" href="#" style="font-weight:700">Grab a fresh one</a> and try again.</span>
        </div>`
      : "";
  const btnInner = loading
    ? `<span style="display:flex; align-items:center; gap:7px">Verifying ${dotsHTML}</span>`
    : "Verify";

  const inner = `<div>
    ${decor()}
    <div style="position:relative; background:#FFFFFF; border-radius:26px; padding:38px 30px; box-shadow:0 12px 38px rgba(93,58,44,.1); display:flex; flex-direction:column; gap:18px; text-align:center">
      <div style="display:flex; flex-direction:column; gap:10px">
        <h1 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:27px; line-height:1.25; color:#3D2C26">Enter the code from your email</h1>
        <p style="margin:0; font-size:14.5px; line-height:1.6; color:#8A7168">Six digits — that's the last step before you're in.</p>
      </div>
      <div id="mur-otp-row" style="display:flex; gap:9px; justify-content:center">${boxes}</div>
      ${errorBlock}
      <button id="mur-verify" class="mur-btn-primary" ${loading ? "disabled" : ""} style="width:100%; border:none; cursor:pointer; border-radius:16px; padding:15px; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:16.5px; color:#FFF8F1; background:#F26B4E; box-shadow:0 6px 18px rgba(242,107,78,.32); transition:transform .18s cubic-bezier(.34,1.56,.64,1), background .18s ease; display:flex; align-items:center; justify-content:center; gap:8px">${btnInner}</button>
      <span style="font-size:12.5px; color:#C4AB9E">Didn't get it? <a id="mur-resend" href="#" style="font-weight:600">Send a new code</a></span>
    </div>
  </div>`;

  const root = elFromHTML(pageShell(inner));
  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>(".mur-otp"));
  const focusBox = (i: number) => {
    const el = inputs[i];
    if (el) {
      el.focus();
      el.select();
    }
  };
  const readCode = () => inputs.map((el) => el.value).join("");
  const submit = () => {
    if (loading) return;
    const code = readCode();
    if (code.length < 6) {
      focusBox(inputs.findIndex((el) => !el.value));
      return;
    }
    p.onSubmit(code);
  };

  inputs.forEach((el, i) => {
    el.addEventListener("focus", () => el.select());
    el.addEventListener("input", () => {
      const raw = el.value.replace(/\D/g, "");
      if (raw.length > 1) {
        // Paste-fill across boxes.
        for (let j = 0; j < raw.length && i + j < 6; j++) inputs[i + j]!.value = raw[j]!;
        focusBox(Math.min(i + raw.length, 5));
        return;
      }
      el.value = raw;
      if (raw && i < 5) focusBox(i + 1);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !el.value && i > 0) {
        focusBox(i - 1);
        inputs[i - 1]!.value = "";
      } else if (e.key === "ArrowLeft" && i > 0) focusBox(i - 1);
      else if (e.key === "ArrowRight" && i < 5) focusBox(i + 1);
      else if (e.key === "Enter") submit();
    });
  });
  if (!loading) focusBox(0);

  root.querySelector<HTMLButtonElement>("#mur-verify")!.addEventListener("click", submit);
  root.querySelectorAll<HTMLAnchorElement>("#mur-resend, #mur-resend-inline").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      p.onResend();
    }),
  );
  return root;
}

function decor(): string {
  return `<div style="position:absolute; top:-60px; right:-50px; width:200px; height:200px; border-radius:50%; background:radial-gradient(circle at 40% 40%, rgba(242,107,78,.15), rgba(242,107,78,0) 70%); animation:blobFloat 9s ease-in-out infinite; pointer-events:none"></div>
    <div style="position:absolute; bottom:-50px; left:-40px; width:220px; height:220px; border-radius:50%; background:radial-gradient(circle at 60% 40%, rgba(111,162,135,.16), rgba(111,162,135,0) 70%); animation:blobFloat2 11s ease-in-out infinite; pointer-events:none"></div>`;
}
