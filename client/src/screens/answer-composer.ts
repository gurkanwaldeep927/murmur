import { elFromHTML, esc } from "./dom";
import { appShell, dotsHTML } from "./styles";
import { avatarFor, formatYearBadge } from "../lib/format";
import type { ModerationStatus, QuestionView } from "../lib/content-view";

/**
 * S8 — AnswerComposer (ported verbatim from "S8 AnswerComposer.dc.html").
 * Brief: docs/06-ui.md §3.8. Flows F3/F6/F9, UX S8.
 *
 * Same pending-copy constraint as S6: the designer's card said the answer "will appear
 * under the question in a few minutes", which is untrue under hold-all (nothing publishes
 * until T14b/M6). The paragraph renders the server's own message instead; heading and
 * layout are the designer's, verbatim. See client/src/components/README.md note 1 and
 * docs/design-prompts/T19-round-3.md gap 1.
 */

export type AnswerPhase = "form" | "loading" | "published" | "pending" | "blocked";

export interface AnswerComposerProps {
  phase: AnswerPhase;
  pseudonym: string;
  /** The parent question, kept in view while writing (brief §3.8). */
  question: QuestionView;
  body: string;
  errorMsg: string | null;
  outcomeMessage: string;
  onBodyInput: (value: string) => void;
  onSubmit: () => void;
  onAfterOutcome: () => void;
}

/** The dimmed parent question above the sheet. */
function parentPreview(q: QuestionView): string {
  return `<div style="padding:16px 20px 0; opacity:.45; pointer-events:none">
    <div style="background:#FFFFFF; border-radius:20px; padding:18px; display:flex; flex-direction:column; gap:8px">
      <div style="display:flex; gap:8px; align-items:center">
        <span style="width:24px; height:24px; border-radius:50%; background:#FDEDE4; display:flex; align-items:center; justify-content:center; font-size:12px">${avatarFor(q.author.pseudonym)}</span>
        <span style="font-family:'Baloo 2',sans-serif; font-weight:600; font-size:13px; color:#3D2C26">${esc(q.author.pseudonym)}</span>
        <span style="background:#E7F1EA; color:#5D8E74; font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:999px">${esc(formatYearBadge(q.author.year_badge))}</span>
      </div>
      <p style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:16px; line-height:1.35; color:#3D2C26">${esc(q.title)}</p>
    </div>
  </div>`;
}

function sheetHTML(p: AnswerComposerProps): string {
  const loading = p.phase === "loading";
  const errorBlock = p.errorMsg
    ? `<div style="display:flex; gap:8px; align-items:flex-start; background:#FBEDE7; border-radius:14px; padding:11px 14px; animation:slideDown .22s ease">
        <span style="flex:none; width:16px; height:16px; margin-top:1px; border-radius:50%; background:#D96B57; color:#FFF8F1; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center">!</span>
        <span style="font-size:13.5px; line-height:1.5; color:#A8503E">${esc(p.errorMsg)}</span>
      </div>`
    : "";
  const btnInner = loading
    ? `<span style="display:flex; align-items:center; gap:7px">Posting ${dotsHTML}</span>`
    : "Post answer";

  return `<div style="background:#FFFFFF; border-radius:26px 26px 0 0; box-shadow:0 -12px 40px rgba(93,58,44,.14); padding:14px 22px 22px; display:flex; flex-direction:column; gap:14px; animation:sheetUp .35s cubic-bezier(.34,1.2,.64,1)">
    <div style="width:44px; height:5px; border-radius:3px; background:#F0DCD0; align-self:center"></div>
    <div style="display:flex; align-items:center; justify-content:space-between">
      <h1 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:20px; color:#3D2C26">Your answer</h1>
      <div style="display:flex; align-items:center; gap:6px; background:#E7F1EA; border-radius:999px; padding:5px 12px 5px 7px">
        <span style="width:18px; height:18px; border-radius:50%; background:#FFFFFF; display:flex; align-items:center; justify-content:center; font-size:10px">${avatarFor(p.pseudonym)}</span>
        <span style="font-size:12px; font-weight:600; color:#4E7A62">as <strong style="font-family:'Baloo 2',sans-serif">${esc(p.pseudonym)}</strong></span>
      </div>
    </div>
    <textarea id="mur-answer-body" class="mur-textarea" rows="7" ${loading ? "disabled" : ""} placeholder="Share what you actually know — even a partial answer helps someone breathe easier tonight." style="border:2px solid #F0DCD0; border-radius:16px; padding:14px 16px; outline:none; background:#FFFCF9; font-family:'Plus Jakarta Sans',sans-serif; font-size:14.5px; line-height:1.65; color:#5C4A42; resize:none; transition:border-color .18s ease, box-shadow .18s ease">${esc(p.body)}</textarea>
    ${errorBlock}
    <button id="mur-answer-submit" class="mur-btn-primary" ${loading ? "disabled" : ""} style="width:100%; border:none; cursor:pointer; border-radius:16px; padding:15px; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:16.5px; color:#FFF8F1; background:#F26B4E; box-shadow:0 6px 18px rgba(242,107,78,.32); transition:transform .18s cubic-bezier(.34,1.56,.64,1), background .18s ease; display:flex; align-items:center; justify-content:center; gap:8px">${btnInner}</button>
  </div>`;
}

function outcomeHTML(status: ModerationStatus, message: string, pseudonym: string): string {
  const icons: Record<ModerationStatus, string> = {
    published: `<div style="width:60px; height:60px; border-radius:50%; background:#E7F1EA; display:flex; align-items:center; justify-content:center; font-size:26px; animation:popIn .5s cubic-bezier(.34,1.56,.64,1)">🎉</div>`,
    pending: `<div style="width:60px; height:60px; border-radius:50%; background:#EFF4F3; display:flex; align-items:center; justify-content:center; animation:popIn .5s cubic-bezier(.34,1.56,.64,1)">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" stroke="#7BA3A0" stroke-width="1.8" stroke-linejoin="round"></path><path d="M9 12l2 2 4-4.5" stroke="#7BA3A0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>
    </div>`,
    blocked: `<div style="width:60px; height:60px; border-radius:50%; background:#EFF4F3; display:flex; align-items:center; justify-content:center; animation:popIn .5s cubic-bezier(.34,1.56,.64,1)">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" stroke="#7BA3A0" stroke-width="1.8" stroke-linejoin="round"></path></svg>
    </div>`,
  };
  const headings: Record<ModerationStatus, string> = {
    // Designer's headings, verbatim. "blocked" is gap 2 — no card was drawn for it.
    published: "Posted — someone exhales tonight",
    pending: "Posted — one quick check first",
    blocked: "Not published",
  };
  // The designer's published card credits the pseudonym; the server's message does not.
  const paragraph =
    status === "published" ? `Your answer is live under the question, credited to ${pseudonym}.` : message;

  return `<div style="background:#FFFFFF; border-radius:26px 26px 0 0; box-shadow:0 -12px 40px rgba(93,58,44,.14); padding:36px 26px 30px; display:flex; flex-direction:column; align-items:center; gap:12px; text-align:center; animation:sheetUp .35s cubic-bezier(.34,1.2,.64,1)">
    ${icons[status]}
    <h2 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:21px; color:#3D2C26">${esc(headings[status])}</h2>
    <p style="margin:0; font-size:14px; line-height:1.6; color:#8A7168; text-wrap:pretty">${esc(paragraph)}</p>
    <button id="mur-answer-done" class="mur-btn-muted" style="margin-top:6px; border:none; cursor:pointer; border-radius:14px; padding:12px 26px; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:15px; color:#8A7168; background:#F4EDE3; transition:transform .18s cubic-bezier(.34,1.56,.64,1)">Back to the thread</button>
  </div>`;
}

/** Narrows the phase to a terminal moderation outcome, or null while still composing. */
function outcomeOf(phase: AnswerPhase): ModerationStatus | null {
  return phase === "published" || phase === "pending" || phase === "blocked" ? phase : null;
}

export function renderAnswerComposer(p: AnswerComposerProps): HTMLElement {
  const outcome = outcomeOf(p.phase);
  const sheet = outcome
    ? outcomeHTML(outcome, p.outcomeMessage, p.pseudonym)
    : sheetHTML(p);

  const root = elFromHTML(
    appShell(`
      ${parentPreview(p.question)}
      <div style="flex:1; display:flex; flex-direction:column; justify-content:flex-end">${sheet}</div>
    `),
  );

  if (outcome) {
    root
      .querySelector<HTMLButtonElement>("#mur-answer-done")
      ?.addEventListener("click", p.onAfterOutcome);
    return root;
  }

  root.querySelector<HTMLButtonElement>("#mur-answer-submit")?.addEventListener("click", p.onSubmit);
  const body = root.querySelector<HTMLTextAreaElement>("#mur-answer-body");
  body?.addEventListener("input", () => p.onBodyInput(body.value));
  return root;
}
