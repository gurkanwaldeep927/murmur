import { elFromHTML, esc } from "./dom";
import { appShell, skeletonBar } from "./styles";
import { answerCountLabel, avatarFor, formatYearBadge, relativeTime } from "../lib/format";
import { FEATURES } from "../lib/features";
import type { QuestionView } from "../lib/content-view";

/**
 * S5 — QuestionFeedCard / Home Feed (ported verbatim from "S5 QuestionFeedCard.dc.html").
 * Visual markup, copy and colors are the designer's; the mock `DCLogic` is replaced by
 * the real handlers passed in. The four `sc-if` branches become the four states.
 *
 * Brief: docs/06-ui.md §3.5. Flows F3/F4, UX S5.
 */

export type FeedPhase = "loading" | "list" | "empty" | "error";

export interface QuestionFeedProps {
  phase: FeedPhase;
  questions: QuestionView[];
  /** The server's own empty-feed copy (R4 AC2); falls back to the designer's line. */
  emptyMessage: string | null;
  viewerPseudonym: string;
  onOpenQuestion: (id: string) => void;
  onAsk: () => void;
  onRetry: () => void;
}

const HEADER = (pseudonym: string) => `<header style="position:sticky; top:0; z-index:5; background:rgba(255,248,241,.92); backdrop-filter:blur(8px); padding:16px 20px 12px; display:flex; align-items:center; justify-content:space-between">
  <div style="display:flex; align-items:center; gap:8px">
    <div style="width:28px; height:28px; border-radius:10px; background:#F26B4E; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(242,107,78,.3)">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 12c2.5-5 5.5-5 8 0s5.5 5 8 0" stroke="#FFF8F1" stroke-width="2.4" stroke-linecap="round"></path></svg>
    </div>
    <span style="font-family:'Baloo 2',sans-serif; font-weight:700; font-size:20px; color:#3D2C26">murmur</span>
  </div>
  <div style="display:flex; align-items:center; gap:6px; background:#FFFFFF; border-radius:999px; padding:6px 12px 6px 7px; box-shadow:0 3px 10px rgba(93,58,44,.08)">
    <span style="width:22px; height:22px; border-radius:50%; background:#FDEDE4; display:flex; align-items:center; justify-content:center; font-size:12px">${avatarFor(pseudonym)}</span>
    <span style="font-family:'Baloo 2',sans-serif; font-weight:600; font-size:13px; color:#3D2C26">${esc(pseudonym)}</span>
  </div>
</header>`;

function skeletonCard(): string {
  return `<div style="background:#FFFFFF; border-radius:20px; padding:18px; box-shadow:0 6px 20px rgba(93,58,44,.06); display:flex; flex-direction:column; gap:10px">
    <div style="display:flex; gap:8px; align-items:center">
      ${skeletonBar("26px", "26px", "50%")}
      ${skeletonBar("120px", "12px", "6px")}
    </div>
    ${skeletonBar("90%", "15px", "7px")}
    ${skeletonBar("70%", "12px", "6px")}
  </div>`;
}

function questionCard(q: QuestionView, index: number): string {
  const delay = `${(index * 0.07).toFixed(2)}s`;
  return `<div class="mur-card" data-question-id="${esc(q.id)}" style="background:#FFFFFF; border-radius:20px; padding:18px; box-shadow:0 6px 20px rgba(93,58,44,.06); display:flex; flex-direction:column; gap:10px; cursor:pointer; animation:cardIn .45s cubic-bezier(.34,1.2,.64,1) both; animation-delay:${delay}; transition:transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .18s ease">
    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
      <span style="width:26px; height:26px; border-radius:50%; background:#FDEDE4; display:flex; align-items:center; justify-content:center; font-size:13px">${avatarFor(q.author.pseudonym)}</span>
      <span style="font-family:'Baloo 2',sans-serif; font-weight:600; font-size:13.5px; color:#3D2C26">${esc(q.author.pseudonym)}</span>
      <span style="background:#E7F1EA; color:#5D8E74; font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px">${esc(formatYearBadge(q.author.year_badge))}</span>
      <span style="margin-left:auto; font-size:12px; color:#C4AB9E; font-weight:600">${esc(relativeTime(q.publishedAt))}</span>
    </div>
    <h2 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:17.5px; line-height:1.35; color:#3D2C26; text-wrap:pretty">${esc(q.title)}</h2>
    <p style="margin:0; font-size:13.5px; line-height:1.55; color:#8A7168; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden">${esc(q.body)}</p>
    <div style="display:flex; gap:10px; align-items:center">
      <span style="background:#FDEDE4; color:#C25B42; font-size:11.5px; font-weight:700; padding:4px 11px; border-radius:999px">${esc(q.topic.label)}</span>
      <span style="display:flex; align-items:center; gap:5px; font-size:12.5px; color:#8A7168; font-weight:600">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 6h16v10H9l-5 4V6z" stroke="#8A7168" stroke-width="1.8" stroke-linejoin="round"></path></svg>
        ${esc(answerCountLabel(q.answerCount))}
      </span>
    </div>
  </div>`;
}

const EMPTY_HTML = (message: string) => `<div style="background:#FFFFFF; border-radius:22px; padding:40px 28px; box-shadow:0 6px 20px rgba(93,58,44,.06); display:flex; flex-direction:column; align-items:center; gap:12px; text-align:center; margin-top:12px">
  <div style="width:64px; height:64px; border-radius:50%; background:#E7F1EA; display:flex; align-items:center; justify-content:center; font-size:28px; animation:popIn .5s cubic-bezier(.34,1.56,.64,1)">🌙</div>
  <h2 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:20px; color:#3D2C26">Your campus is quiet</h2>
  <p style="margin:0; font-size:14px; line-height:1.6; color:#8A7168; text-wrap:pretty">${esc(message)}</p>
  <button id="mur-feed-ask-empty" class="mur-btn-primary" style="margin-top:6px; border:none; cursor:pointer; border-radius:14px; padding:13px 26px; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:15.5px; color:#FFF8F1; background:#F26B4E; box-shadow:0 6px 18px rgba(242,107,78,.32); transition:transform .18s cubic-bezier(.34,1.56,.64,1)">Be the first to ask</button>
</div>`;

const ERROR_HTML = `<div style="background:#FFFFFF; border-radius:22px; padding:36px 28px; box-shadow:0 6px 20px rgba(93,58,44,.06); display:flex; flex-direction:column; align-items:center; gap:12px; text-align:center; margin-top:12px">
  <div style="width:60px; height:60px; border-radius:50%; background:#FBEDE7; display:flex; align-items:center; justify-content:center; animation:popIn .5s cubic-bezier(.34,1.56,.64,1)">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 4a8 8 0 108 8" stroke="#D96B57" stroke-width="1.9" stroke-linecap="round"></path><path d="M20 5v4h-4" stroke="#D96B57" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg>
  </div>
  <h2 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:19px; color:#3D2C26">The feed wandered off</h2>
  <p style="margin:0; font-size:14px; line-height:1.6; color:#8A7168">Couldn't load right now — it's us, not you. A quick retry usually does it.</p>
  <button id="mur-feed-retry" class="mur-retry" style="margin-top:4px; border:none; cursor:pointer; border-radius:14px; padding:12px 24px; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:15px; color:#C25B42; background:#FDEDE4; transition:transform .18s cubic-bezier(.34,1.56,.64,1)">Try again</button>
</div>`;

const FAB = `<button id="mur-feed-ask" class="mur-fab" style="position:sticky; bottom:88px; align-self:flex-end; margin:-54px 20px 10px 0; z-index:6; border:none; cursor:pointer; display:flex; align-items:center; gap:8px; background:#F26B4E; color:#FFF8F1; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:16px; padding:15px 22px; border-radius:999px; box-shadow:0 10px 26px rgba(242,107,78,.4); animation:fabBob 4s ease-in-out infinite; transition:transform .18s cubic-bezier(.34,1.56,.64,1)">
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#FFF8F1" stroke-width="2.4" stroke-linecap="round"></path></svg>
  Ask
</button>`;

/**
 * The bottom nav, rendered exactly as designed. Search (S9) and Profile (S11) are M3
 * — T20/T25/T26 — and the design already styles them muted, so with FEATURES.searchAndProfile
 * off they carry no click handler and no pointer cursor. A nav item that looks live and
 * does nothing is worse than one that plainly isn't ready yet.
 */
const NAV = `<nav style="position:sticky; bottom:0; z-index:5; background:rgba(255,255,255,.95); backdrop-filter:blur(8px); border-top:1px solid #F0DCD0; display:grid; grid-template-columns:1fr 1fr 1fr; padding:10px 12px 16px">
  <div style="display:flex; flex-direction:column; align-items:center; gap:3px">
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M4 11l8-7 8 7v9H4v-9z" fill="#FDEDE4" stroke="#F26B4E" stroke-width="1.9" stroke-linejoin="round"></path></svg>
    <span style="font-size:11px; font-weight:700; color:#F26B4E">Home</span>
  </div>
  <div style="display:flex; flex-direction:column; align-items:center; gap:3px${FEATURES.searchAndProfile ? "; cursor:pointer" : ""}">
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6" stroke="#B99C8D" stroke-width="1.9"></circle><path d="M16 16l4 4" stroke="#B99C8D" stroke-width="1.9" stroke-linecap="round"></path></svg>
    <span style="font-size:11px; font-weight:600; color:#B99C8D">Search</span>
  </div>
  <div style="display:flex; flex-direction:column; align-items:center; gap:3px${FEATURES.searchAndProfile ? "; cursor:pointer" : ""}">
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.4" stroke="#B99C8D" stroke-width="1.9"></circle><path d="M5 20c.8-3.4 3.6-5 7-5s6.2 1.6 7 5" stroke="#B99C8D" stroke-width="1.9" stroke-linecap="round"></path></svg>
    <span style="font-size:11px; font-weight:600; color:#B99C8D">Profile</span>
  </div>
</nav>`;

export function renderQuestionFeed(p: QuestionFeedProps): HTMLElement {
  let body: string;
  switch (p.phase) {
    case "loading":
      body = `<div style="display:flex; flex-direction:column; gap:14px">${skeletonCard().repeat(3)}</div>`;
      break;
    case "list":
      body = `<div style="display:flex; flex-direction:column; gap:14px">${p.questions
        .map(questionCard)
        .join("")}</div>`;
      break;
    case "empty":
      body = EMPTY_HTML(
        p.emptyMessage ??
          "No questions yet — which means yours goes first. Every campus legend starts with one brave ask.",
      );
      break;
    case "error":
      body = ERROR_HTML;
      break;
  }

  const root = elFromHTML(
    appShell(`
      ${HEADER(p.viewerPseudonym)}
      <div style="padding:6px 20px 110px; display:flex; flex-direction:column; gap:14px; flex:1">
        <h1 style="margin:6px 0 0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:23px; color:#3D2C26">Fresh from your campus</h1>
        ${body}
      </div>
      ${p.phase === "error" ? "" : FAB}
      ${NAV}
    `),
  );

  root.querySelector<HTMLButtonElement>("#mur-feed-ask")?.addEventListener("click", p.onAsk);
  root.querySelector<HTMLButtonElement>("#mur-feed-ask-empty")?.addEventListener("click", p.onAsk);
  root.querySelector<HTMLButtonElement>("#mur-feed-retry")?.addEventListener("click", p.onRetry);
  for (const card of root.querySelectorAll<HTMLElement>("[data-question-id]")) {
    card.addEventListener("click", () => p.onOpenQuestion(card.dataset.questionId!));
  }
  return root;
}
