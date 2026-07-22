import { elFromHTML, esc } from "./dom";
import { pageShell } from "./styles";

/**
 * S4 — RegistrationOutcomePanel (ported from "S4 RegistrationOutcomePanel.dc.html").
 * The five outcomes map 1:1 to A2's response branches:
 *   loading  — while A2 is in flight
 *   success  — 200 verified: pseudonym + derived year badge (never guessed)
 *   blocked  — 422 blocked_unparseable_year (held for human review, never guessed)
 *   refused  — 403 registration_refused_banned
 *   error    — any other failure (e.g. token trouble surfaced here as a fallback)
 */

export type OutcomeKind = "loading" | "success" | "blocked" | "refused" | "error";

export interface RegistrationOutcomeProps {
  outcome: OutcomeKind;
  pseudonym?: string;
  yearBadge?: string;
  onContinue?: () => void;
  onRetry?: () => void;
  onGrievance?: () => void;
}

function decor(): string {
  return `<div style="position:absolute; top:-60px; left:-50px; width:210px; height:210px; border-radius:50%; background:radial-gradient(circle at 40% 40%, rgba(242,107,78,.15), rgba(242,107,78,0) 70%); animation:blobFloat 9s ease-in-out infinite; pointer-events:none"></div>
    <div style="position:absolute; bottom:-50px; right:-40px; width:230px; height:230px; border-radius:50%; background:radial-gradient(circle at 60% 40%, rgba(111,162,135,.16), rgba(111,162,135,0) 70%); animation:blobFloat2 11s ease-in-out infinite; pointer-events:none"></div>`;
}

const LOADING_HTML = `<div style="position:relative; background:#FFFFFF; border-radius:26px; padding:42px 30px; box-shadow:0 12px 38px rgba(93,58,44,.1); display:flex; flex-direction:column; align-items:center; gap:18px; text-align:center">
  <div style="width:76px; height:76px; border-radius:50%; background:linear-gradient(90deg,#F4E5D9 25%,#FBF1E9 50%,#F4E5D9 75%); background-size:200px 100%; animation:shimmer 1.4s linear infinite"></div>
  <div style="width:170px; height:20px; border-radius:8px; background:linear-gradient(90deg,#F4E5D9 25%,#FBF1E9 50%,#F4E5D9 75%); background-size:200px 100%; animation:shimmer 1.4s linear infinite"></div>
  <p style="margin:0; font-size:14px; color:#8A7168; display:flex; align-items:center; gap:7px">Preparing your identity
    <span style="display:inline-flex; gap:4px">
      <span style="width:5px; height:5px; border-radius:50%; background:#C4AB9E; animation:dotPulse 1.1s infinite"></span>
      <span style="width:5px; height:5px; border-radius:50%; background:#C4AB9E; animation:dotPulse 1.1s .18s infinite"></span>
      <span style="width:5px; height:5px; border-radius:50%; background:#C4AB9E; animation:dotPulse 1.1s .36s infinite"></span>
    </span>
  </p>
</div>`;

function successHTML(pseudonym: string, yearBadge: string): string {
  return `<div style="position:relative; background:#FFFFFF; border-radius:26px; padding:42px 30px 34px; box-shadow:0 12px 38px rgba(93,58,44,.1); display:flex; flex-direction:column; align-items:center; gap:8px; text-align:center; overflow:hidden">
    <div style="position:absolute; top:0; left:18%; width:8px; height:8px; border-radius:2px; background:#F2A65E; animation:confettiFall 2.2s ease-in .15s infinite"></div>
    <div style="position:absolute; top:0; left:38%; width:7px; height:7px; border-radius:50%; background:#6FA287; animation:confettiFall 2.6s ease-in .6s infinite"></div>
    <div style="position:absolute; top:0; left:60%; width:8px; height:8px; border-radius:2px; background:#F26B4E; animation:confettiFall 2.4s ease-in .3s infinite"></div>
    <div style="position:absolute; top:0; left:80%; width:6px; height:6px; border-radius:50%; background:#E8C3A6; animation:confettiFall 2.8s ease-in .9s infinite"></div>
    <span style="font-size:14px; font-weight:600; color:#8A7168; animation:revealUp .5s ease both">You're in — meet your campus identity</span>
    <div style="width:88px; height:88px; border-radius:50%; background:radial-gradient(circle at 35% 30%, #FDEDE4, #F8D8C8); display:flex; align-items:center; justify-content:center; font-size:40px; margin-top:8px; box-shadow:0 8px 24px rgba(242,107,78,.2); animation:popIn .6s cubic-bezier(.34,1.56,.64,1) .15s both">🦅</div>
    <h1 style="margin:6px 0 0; font-family:'Baloo 2',sans-serif; font-weight:700; font-size:34px; letter-spacing:-0.4px; color:#3D2C26; animation:revealUp .5s ease .3s both">${esc(pseudonym)}</h1>
    <span style="background:#E7F1EA; color:#5D8E74; font-size:13.5px; font-weight:700; padding:6px 16px; border-radius:999px; animation:popIn .5s cubic-bezier(.34,1.56,.64,1) .45s both">${esc(yearBadge)}</span>
    <p style="margin:14px 0 0; font-size:14px; line-height:1.6; color:#8A7168; text-wrap:pretty; animation:revealUp .5s ease .55s both">This is who your campus will know. Your name, email, and face stay yours alone.</p>
    <button id="mur-continue" class="mur-btn-primary" style="width:100%; margin-top:18px; border:none; cursor:pointer; border-radius:16px; padding:15px; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:16.5px; color:#FFF8F1; background:#F26B4E; box-shadow:0 6px 18px rgba(242,107,78,.32); transition:transform .18s cubic-bezier(.34,1.56,.64,1), background .18s ease; animation:revealUp .5s ease .7s both">Continue to Home</button>
  </div>`;
}

const BLOCKED_HTML = `<div style="position:relative; background:#FFFFFF; border-radius:26px; padding:40px 30px; box-shadow:0 12px 38px rgba(93,58,44,.1); display:flex; flex-direction:column; align-items:center; gap:14px; text-align:center">
  <div style="width:68px; height:68px; border-radius:50%; background:#EFF4F3; display:flex; align-items:center; justify-content:center; animation:popIn .5s cubic-bezier(.34,1.56,.64,1)">
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#7BA3A0" stroke-width="1.8"></circle><path d="M12 8v4.5l3 2" stroke="#7BA3A0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>
  </div>
  <h1 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:25px; line-height:1.3; color:#3D2C26">We're taking a closer look</h1>
  <p style="margin:0; font-size:14.5px; line-height:1.65; color:#8A7168; text-wrap:pretty">We couldn't reliably read your enrollment year from your email — and we don't guess. <strong style="color:#5C4A42; font-weight:600">Nothing was assumed about you.</strong> Your registration is safely held while a human reviews it, usually within a day.</p>
  <div style="background:#EFF4F3; border-radius:14px; padding:12px 16px; font-size:13px; line-height:1.55; color:#5F7F7C">You don't need to do anything — we'll email you the moment it's sorted.</div>
  <a id="mur-grievance" href="#" style="font-size:13.5px; font-weight:600; margin-top:4px">Questions? Contact the grievance officer</a>
</div>`;

const REFUSED_HTML = `<div style="position:relative; background:#FFFFFF; border-radius:26px; padding:40px 30px; box-shadow:0 12px 38px rgba(93,58,44,.1); display:flex; flex-direction:column; align-items:center; gap:14px; text-align:center">
  <div style="width:68px; height:68px; border-radius:50%; background:#F4E9E2; display:flex; align-items:center; justify-content:center; animation:popIn .5s cubic-bezier(.34,1.56,.64,1)">
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#BC8A70" stroke-width="1.8"></circle><path d="M8.5 12h7" stroke="#BC8A70" stroke-width="1.8" stroke-linecap="round"></path></svg>
  </div>
  <h1 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:25px; line-height:1.3; color:#3D2C26">This email can't be registered</h1>
  <p style="margin:0; font-size:14.5px; line-height:1.65; color:#8A7168; text-wrap:pretty">This email is linked to an account that was permanently removed for breaking community rules. That decision stands, even for new accounts.</p>
  <p style="margin:0; font-size:13.5px; line-height:1.6; color:#8A7168">If you believe this is a mistake, a real person will look into it.</p>
  <a id="mur-grievance" class="mur-link-btn" href="#" style="width:100%; box-sizing:border-box; margin-top:6px; background:#FDEDE4; color:#C25B42; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:15.5px; padding:14px; border-radius:15px; transition:transform .18s cubic-bezier(.34,1.56,.64,1)">Contact the grievance officer</a>
</div>`;

const ERROR_HTML = `<div style="position:relative; background:#FFFFFF; border-radius:26px; padding:40px 30px; box-shadow:0 12px 38px rgba(93,58,44,.1); display:flex; flex-direction:column; align-items:center; gap:14px; text-align:center">
  <div style="width:68px; height:68px; border-radius:50%; background:#FBEDE7; display:flex; align-items:center; justify-content:center; animation:popIn .5s cubic-bezier(.34,1.56,.64,1)">
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M4 7h16v11H4V7z" stroke="#D96B57" stroke-width="1.8" stroke-linejoin="round"></path><path d="M4 7l8 6 8-6" stroke="#D96B57" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>
  </div>
  <h1 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:25px; line-height:1.3; color:#3D2C26">That code didn't stick</h1>
  <p style="margin:0; font-size:14.5px; line-height:1.65; color:#8A7168; text-wrap:pretty">No problem — codes expire quickly to keep things safe. Grab a fresh one and you'll be in within a minute.</p>
  <button id="mur-retry" class="mur-btn-primary" style="width:100%; margin-top:6px; border:none; cursor:pointer; border-radius:16px; padding:15px; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:16.5px; color:#FFF8F1; background:#F26B4E; box-shadow:0 6px 18px rgba(242,107,78,.32); transition:transform .18s cubic-bezier(.34,1.56,.64,1), background .18s ease">Send a new code</button>
</div>`;

export function renderRegistrationOutcome(p: RegistrationOutcomeProps): HTMLElement {
  let body: string;
  switch (p.outcome) {
    case "loading":
      body = LOADING_HTML;
      break;
    case "success":
      body = successHTML(p.pseudonym ?? "", p.yearBadge ?? "");
      break;
    case "blocked":
      body = BLOCKED_HTML;
      break;
    case "refused":
      body = REFUSED_HTML;
      break;
    case "error":
      body = ERROR_HTML;
      break;
  }
  const root = elFromHTML(pageShell(`<div>${decor()}${body}</div>`, 400));

  root.querySelector<HTMLButtonElement>("#mur-continue")?.addEventListener("click", () => p.onContinue?.());
  root.querySelector<HTMLButtonElement>("#mur-retry")?.addEventListener("click", () => p.onRetry?.());
  root.querySelector<HTMLAnchorElement>("#mur-grievance")?.addEventListener("click", (e) => {
    e.preventDefault();
    p.onGrievance?.();
  });
  return root;
}
