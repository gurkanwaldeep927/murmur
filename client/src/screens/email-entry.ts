import { elFromHTML, esc } from "./dom";
import { dotsHTML, pageShell } from "./styles";

/**
 * S1 — EmailEntryForm (ported verbatim from "S1 EmailEntryForm.dc.html").
 * Visual markup/styles are the designer's; the mock DCLogic is replaced by the
 * real handlers passed in (which call A1 via the flow controller). Error copy
 * strings are the designer's, keyed by the four A1 error branches.
 */

export interface EmailEntryProps {
  email: string;
  campusDomain: string;
  loading: boolean;
  errorMsg: string | null;
  phase: "form" | "success";
  onEmailInput: (value: string) => void;
  onSubmit: () => void;
}

/** Designer's A1 error copy, keyed by API error code. */
export function emailErrorCopy(code: string, domain: string): string {
  switch (code) {
    case "email_domain_refused":
      return `Hmm — we can only let campus emails in. Try your address ending in @${domain}.`;
    case "email_already_registered":
      return "Someone already verified with this email. If that was you, your pseudonym is waiting on your original device.";
    case "email_malformed":
      return "That email looks a little off — mind checking it for typos?";
    case "rate_limited":
      return "Lots of tries in a row — take a short breather and try again in a minute.";
    default:
      return "Something went wrong sending your code. Please try again in a moment.";
  }
}

const LOGO = `<div style="display:flex; align-items:center; gap:10px">
  <div style="width:34px; height:34px; border-radius:12px; background:#F26B4E; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(242,107,78,.35)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 12c2.5-5 5.5-5 8 0s5.5 5 8 0" stroke="#FFF8F1" stroke-width="2.4" stroke-linecap="round"></path></svg>
  </div>
  <span style="font-family:'Baloo 2',sans-serif; font-weight:700; font-size:26px; color:#3D2C26; letter-spacing:-0.3px">murmur</span>
</div>`;

function formHTML(p: EmailEntryProps): string {
  const errorBlock = p.errorMsg
    ? `<div data-s1-error style="display:flex; gap:8px; align-items:flex-start; background:#FBEDE7; border-radius:14px; padding:11px 13px; animation:slideDown .22s ease">
        <span style="flex:none; width:16px; height:16px; margin-top:1px; border-radius:50%; background:#D96B57; color:#FFF8F1; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center">!</span>
        <span style="font-size:13.5px; line-height:1.5; color:#A8503E">${esc(p.errorMsg)}</span>
      </div>`
    : "";
  const btnInner = p.loading
    ? `<span style="display:flex; align-items:center; gap:7px">Sending ${dotsHTML}</span>`
    : `Get verified`;
  return `<div style="display:flex; flex-direction:column; gap:28px">
    <div style="display:flex; flex-direction:column; gap:12px">
      <h1 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:34px; line-height:1.22; color:#3D2C26; text-wrap:pretty">Ask seniors anything.<br>They'll never know it's you.</h1>
      <p style="margin:0; font-size:15.5px; line-height:1.55; color:#8A7168">Your college email gets you in — anonymously. Every senior's honest answers, no names attached.</p>
    </div>
    <div style="background:#FFFFFF; border-radius:24px; padding:24px; box-shadow:0 10px 34px rgba(93,58,44,.09); display:flex; flex-direction:column; gap:14px">
      <label for="mur-email" style="font-size:13px; font-weight:600; color:#8A7168; letter-spacing:.2px">College email</label>
      <input id="mur-email" class="mur-input" type="email" value="${esc(p.email)}" ${p.loading ? "disabled" : ""} placeholder="you@${esc(p.campusDomain)}" autocomplete="email" style="width:100%; box-sizing:border-box; border:2px solid #F0DCD0; border-radius:16px; padding:15px 16px; font-size:16px; font-family:'Plus Jakarta Sans',sans-serif; color:#3D2C26; background:#FFFCF9; outline:none; transition:border-color .18s ease, box-shadow .18s ease">
      ${errorBlock}
      <button id="mur-submit" class="mur-btn-primary" ${p.loading ? "disabled" : ""} style="border:none; cursor:pointer; border-radius:16px; padding:16px; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:17px; color:#FFF8F1; background:#F26B4E; box-shadow:0 6px 18px rgba(242,107,78,.32); transition:transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .18s ease, background .18s ease; display:flex; align-items:center; justify-content:center; gap:8px">${btnInner}</button>
    </div>
    <div style="display:flex; gap:10px; align-items:flex-start; padding:0 6px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex:none; margin-top:2px"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" fill="#6FA287" opacity=".22"></path><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" stroke="#6FA287" stroke-width="1.6" stroke-linejoin="round"></path><path d="M9 12l2 2 4-4.5" stroke="#6FA287" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>
      <p style="margin:0; font-size:13px; line-height:1.55; color:#8A7168">We verify your email once, scramble it, and never show it to anyone — not seniors, not us. You'll get a pseudonym instead.</p>
    </div>
  </div>`;
}

const SUCCESS_HTML = `<div style="background:#FFFFFF; border-radius:24px; padding:36px 28px; box-shadow:0 10px 34px rgba(93,58,44,.09); display:flex; flex-direction:column; align-items:center; gap:14px; text-align:center; animation:popIn .4s cubic-bezier(.34,1.56,.64,1)">
  <div style="width:56px; height:56px; border-radius:50%; background:#E7F1EA; display:flex; align-items:center; justify-content:center; animation:popIn .5s cubic-bezier(.34,1.56,.64,1)">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 7l8 6 8-6M4 7h16v11H4V7z" stroke="#5D8E74" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>
  </div>
  <h2 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:24px; color:#3D2C26">On its way</h2>
  <p style="margin:0; font-size:14.5px; line-height:1.55; color:#8A7168">Check your college inbox — your verification code will land in a moment.</p>
</div>`;

export function renderEmailEntry(p: EmailEntryProps): HTMLElement {
  const inner = `<div>
    <div style="position:absolute; top:-70px; left:-40px; width:190px; height:190px; border-radius:50%; background:radial-gradient(circle at 40% 40%, rgba(242,107,78,.16), rgba(242,107,78,0) 70%); animation:blobFloat 9s ease-in-out infinite; pointer-events:none"></div>
    <div style="position:absolute; top:-30px; right:-50px; width:230px; height:230px; border-radius:50%; background:radial-gradient(circle at 60% 40%, rgba(111,162,135,.18), rgba(111,162,135,0) 70%); animation:blobFloat2 11s ease-in-out infinite; pointer-events:none"></div>
    <div style="position:relative; display:flex; flex-direction:column; gap:28px">
      ${LOGO}
      ${p.phase === "success" ? SUCCESS_HTML : formHTML(p)}
    </div>
  </div>`;
  const root = elFromHTML(pageShell(inner));

  if (p.phase === "form") {
    const input = root.querySelector<HTMLInputElement>("#mur-email")!;
    const submit = root.querySelector<HTMLButtonElement>("#mur-submit")!;
    input.addEventListener("input", () => p.onEmailInput(input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") p.onSubmit();
    });
    submit.addEventListener("click", () => p.onSubmit());
  }
  return root;
}
