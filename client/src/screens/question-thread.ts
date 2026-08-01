import { elFromHTML, esc } from "./dom";
import { appShell, skeletonBar } from "./styles";
import { answerCountLabel, avatarFor, formatYearBadge, relativeTime } from "../lib/format";
import { FEATURES } from "../lib/features";
import { canAnswer } from "../lib/content-view";
import type { AnswerView, QuestionView } from "../lib/content-view";

/**
 * S7 — QuestionThread / Question Detail (ported verbatim from "S7 QuestionThread.dc.html").
 * Brief: docs/06-ui.md §3.7. Flows F3/F5/F6/F7, UX S7.
 *
 * Three things the design draws that the M2 backend cannot honour, per
 * client/src/components/README.md notes 2 and 3 — each gated on `FEATURES`, with the
 * designer's markup left in place so switching one on is a one-line change:
 *
 *   - the upvote button and its count (A6 + reputation ledger are T21/T22, M3)
 *   - "Report quietly" in both overflow menus (S13 is M5)
 *
 * The accepted badge and the reputation chip are NOT flagged: they render off real fields
 * that are simply false/zero until M3, so they stay invisible now and light up on their
 * own when the ledger lands. A flag would be a second thing to remember to remove.
 */

export type ThreadPhase = "loading" | "thread" | "error";

export interface QuestionThreadProps {
  phase: ThreadPhase;
  question: QuestionView | null;
  answers: AnswerView[];
  errorMessage: string | null;
  onBack: () => void;
  onAnswer: () => void;
  onRetry: () => void;
  /** T22 (M3): supplied once A6 exists. Unused while FEATURES.voting is off. */
  onVote?: (answerId: string) => void;
  /** T40 (M5): supplied once S13 exists. Unused while FEATURES.reporting is off. */
  onReport?: (target: { type: "question" | "answer"; id: string }) => void;
}

const HEADER = `<header style="position:sticky; top:0; z-index:5; background:rgba(255,248,241,.92); backdrop-filter:blur(8px); padding:14px 20px; display:flex; align-items:center; gap:12px">
  <button id="mur-thread-back" class="mur-icon-btn" style="border:none; background:transparent; cursor:pointer; width:34px; height:34px; border-radius:12px; display:flex; align-items:center; justify-content:center; transition:background .15s ease">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 6l-6 6 6 6" stroke="#8A7168" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
  </button>
  <span style="font-family:'Baloo 2',sans-serif; font-weight:600; font-size:17px; color:#3D2C26">Question</span>
</header>`;

const LOADING_HTML = `<div style="padding:8px 20px; display:flex; flex-direction:column; gap:14px">
  <div style="background:#FFFFFF; border-radius:20px; padding:20px; display:flex; flex-direction:column; gap:10px">
    ${skeletonBar("60%", "13px", "6px")}
    ${skeletonBar("95%", "18px", "8px")}
    ${skeletonBar("80%", "12px", "6px")}
  </div>
  <div style="background:#FFFFFF; border-radius:20px; padding:20px; display:flex; flex-direction:column; gap:10px">
    ${skeletonBar("40%", "12px", "6px")}
    ${skeletonBar("100%", "12px", "6px")}
  </div>
</div>`;

/**
 * The author-only notice for content that did not clear review. The wording is the
 * designer's and is pinned by
 * `test_R6_author_can_see_their_own_held_question_but_the_feed_cannot` — keep it verbatim.
 */
const BLOCKED_HTML = `<div style="padding:8px 20px">
  <div style="background:#FFFFFF; border-radius:22px; padding:32px 26px; box-shadow:0 8px 26px rgba(93,58,44,.07); display:flex; flex-direction:column; align-items:center; gap:12px; text-align:center; animation:popIn .4s cubic-bezier(.34,1.56,.64,1)">
    <div style="width:60px; height:60px; border-radius:50%; background:#EFF4F3; display:flex; align-items:center; justify-content:center">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" stroke="#7BA3A0" stroke-width="1.8" stroke-linejoin="round"></path></svg>
    </div>
    <h2 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:20px; color:#3D2C26">Only you can see this</h2>
    <p style="margin:0; font-size:14px; line-height:1.6; color:#8A7168; text-wrap:pretty">This post didn't clear review, so it isn't shown to anyone else. Nothing is held against you — see exactly why and what you can do in My Content.</p>
  </div>
</div>`;

const PENDING_CHIP = `<div style="align-self:flex-start; display:flex; gap:6px; align-items:center; background:#EFF4F3; border-radius:999px; padding:5px 13px">
  <span style="width:7px; height:7px; border-radius:50%; background:#7BA3A0"></span>
  <span style="font-size:12px; font-weight:700; color:#5F7F7C">Under review — keeping this space safe</span>
</div>`;

const NO_ANSWERS_HTML = `<div style="background:#FFFFFF; border-radius:22px; padding:36px 26px; box-shadow:0 8px 26px rgba(93,58,44,.07); display:flex; flex-direction:column; align-items:center; gap:11px; text-align:center; animation:popIn .4s cubic-bezier(.34,1.56,.64,1)">
  <div style="width:58px; height:58px; border-radius:50%; background:#FDEDE4; display:flex; align-items:center; justify-content:center; font-size:25px">🌱</div>
  <h2 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:19px; color:#3D2C26">No answers yet</h2>
  <p style="margin:0; font-size:13.5px; line-height:1.6; color:#8A7168">If you know even part of the answer, it counts. Be the senior you needed.</p>
</div>`;

function errorHTML(message: string): string {
  return `<div style="padding:8px 20px">
    <div style="background:#FFFFFF; border-radius:22px; padding:36px 28px; box-shadow:0 6px 20px rgba(93,58,44,.06); display:flex; flex-direction:column; align-items:center; gap:12px; text-align:center">
      <div style="width:60px; height:60px; border-radius:50%; background:#FBEDE7; display:flex; align-items:center; justify-content:center; animation:popIn .5s cubic-bezier(.34,1.56,.64,1)">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 4a8 8 0 108 8" stroke="#D96B57" stroke-width="1.9" stroke-linecap="round"></path><path d="M20 5v4h-4" stroke="#D96B57" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg>
      </div>
      <h2 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:19px; color:#3D2C26">This thread wandered off</h2>
      <p style="margin:0; font-size:14px; line-height:1.6; color:#8A7168">${esc(message)}</p>
      <button id="mur-thread-retry" class="mur-retry" style="margin-top:4px; border:none; cursor:pointer; border-radius:14px; padding:12px 24px; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:15px; color:#C25B42; background:#FDEDE4; transition:transform .18s cubic-bezier(.34,1.56,.64,1)">Try again</button>
    </div>
  </div>`;
}

function questionCard(q: QuestionView): string {
  return `<div style="background:#FFFFFF; border-radius:22px; padding:22px; box-shadow:0 8px 26px rgba(93,58,44,.07); display:flex; flex-direction:column; gap:12px; animation:cardIn .4s cubic-bezier(.34,1.2,.64,1) both">
    <div style="display:flex; gap:8px; align-items:center">
      <span style="width:28px; height:28px; border-radius:50%; background:#FDEDE4; display:flex; align-items:center; justify-content:center; font-size:14px">${avatarFor(q.author.pseudonym)}</span>
      <span style="font-family:'Baloo 2',sans-serif; font-weight:600; font-size:14px; color:#3D2C26">${esc(q.author.pseudonym)}</span>
      <span style="background:#E7F1EA; color:#5D8E74; font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px">${esc(formatYearBadge(q.author.year_badge))}</span>
      ${reportMenu("question", q.id)}
    </div>
    ${q.moderationStatus === "pending" ? PENDING_CHIP : ""}
    <h1 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:21px; line-height:1.32; color:#3D2C26; text-wrap:pretty">${esc(q.title)}</h1>
    <p style="margin:0; font-size:14.5px; line-height:1.65; color:#5C4A42">${esc(q.body)}</p>
    <div style="display:flex; gap:10px; align-items:center">
      <span style="background:#FDEDE4; color:#C25B42; font-size:11.5px; font-weight:700; padding:4px 11px; border-radius:999px">${esc(q.topic.label)}</span>
      <span style="font-size:12px; color:#C4AB9E; font-weight:600">${esc(relativeTime(q.publishedAt ?? q.createdAt))}</span>
    </div>
  </div>`;
}

const ACCEPTED_BADGE = `<div style="align-self:flex-start; display:flex; gap:6px; align-items:center; background:#E7F1EA; border-radius:999px; padding:5px 13px">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="#4E7A62" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>
  <span style="font-size:12px; font-weight:700; color:#4E7A62">Accepted — this one helped ✨</span>
</div>`;

function reputationChip(score: number): string {
  // Renders off real data. Every profile sits at 0 until the ledger lands (T21/T22), so
  // this is invisible today and needs no flag to appear later.
  if (score <= 0) return "";
  return `<span style="display:flex; align-items:center; gap:4px; font-size:11.5px; font-weight:700; color:#C08F4F">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 3l2.4 5.3 5.6.6-4.2 3.9 1.2 5.6-5-2.9-5 2.9 1.2-5.6L4 8.9l5.6-.6L12 3z" fill="#E4B15E"></path></svg>
    ${score}
  </span>`;
}

/**
 * The designer's upvote control, kept in the codebase behind `FEATURES.voting` rather
 * than deleted. A6 and the reputation ledger are T21/T22 (M3), so today this renders
 * nothing: a button that silently does nothing is worse than no button (README note 2).
 * T22 flips the flag and passes `onVote`.
 */
function voteControl(a: AnswerView): string {
  if (!FEATURES.voting) return "";
  return `<div style="display:flex; gap:12px; align-items:center">
    <button data-vote-answer-id="${esc(a.id)}" class="mur-chip" style="border:2px solid #F0DCD0; cursor:pointer; background:#FFFFFF; color:#B99C8D; display:flex; align-items:center; gap:6px; font-family:'Plus Jakarta Sans',sans-serif; font-size:13px; font-weight:700; padding:7px 14px; border-radius:999px; transition:all .18s cubic-bezier(.34,1.56,.64,1)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5l6 7h-4v7h-4v-7H6l6-7z" fill="#B99C8D"></path></svg>
      ${a.voteCount}
    </button>
  </div>`;
}

/**
 * The designer's "Report quietly" overflow item, behind `FEATURES.reporting`. It targets
 * S13 Report Content, which is T34/T39 in M5 (README note 3). T40 flips the flag and
 * passes `onReport`.
 */
function reportMenu(target: "question" | "answer", id: string): string {
  if (!FEATURES.reporting) return "";
  return `<div style="margin-left:auto; position:relative">
    <button data-report-type="${target}" data-report-id="${esc(id)}" class="mur-icon-btn" style="border:none; background:transparent; cursor:pointer; width:30px; height:30px; border-radius:10px; display:flex; align-items:center; justify-content:center; transition:background .15s ease">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.7" fill="#B99C8D"></circle><circle cx="12" cy="12" r="1.7" fill="#B99C8D"></circle><circle cx="19" cy="12" r="1.7" fill="#B99C8D"></circle></svg>
    </button>
  </div>`;
}

function answerCard(a: AnswerView, index: number): string {
  const delay = `${(index * 0.08).toFixed(2)}s`;
  const border = a.accepted ? "2px solid #CBE2D3" : "2px solid transparent";
  const pending = a.moderationStatus === "pending" ? PENDING_CHIP : "";
  return `<div style="background:#FFFFFF; border-radius:20px; padding:18px; box-shadow:0 6px 20px rgba(93,58,44,.06); display:flex; flex-direction:column; gap:10px; border:${border}; animation:cardIn .45s cubic-bezier(.34,1.2,.64,1) both; animation-delay:${delay}">
    ${a.accepted ? ACCEPTED_BADGE : ""}
    ${pending}
    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
      <span style="width:26px; height:26px; border-radius:50%; background:#E7F1EA; display:flex; align-items:center; justify-content:center; font-size:13px">${avatarFor(a.author.pseudonym)}</span>
      <span style="font-family:'Baloo 2',sans-serif; font-weight:600; font-size:13.5px; color:#3D2C26">${esc(a.author.pseudonym)}</span>
      <span style="background:#E7F1EA; color:#5D8E74; font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px">${esc(formatYearBadge(a.author.year_badge))}</span>
      ${reputationChip(a.author.reputation_score)}
      ${reportMenu("answer", a.id)}
    </div>
    <p style="margin:0; font-size:14px; line-height:1.62; color:#5C4A42">${esc(a.body)}</p>
    ${voteControl(a)}
  </div>`;
}

const ANSWER_BAR = `<div style="position:sticky; bottom:0; z-index:5; background:rgba(255,255,255,.95); backdrop-filter:blur(8px); border-top:1px solid #F0DCD0; padding:12px 20px 18px">
  <button id="mur-thread-answer" class="mur-btn-primary" style="width:100%; border:none; cursor:pointer; border-radius:16px; padding:15px; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:16.5px; color:#FFF8F1; background:#F26B4E; box-shadow:0 6px 18px rgba(242,107,78,.32); display:flex; align-items:center; justify-content:center; gap:8px; transition:transform .18s cubic-bezier(.34,1.56,.64,1), background .18s ease">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 6h16v10H9l-5 4V6z" stroke="#FFF8F1" stroke-width="2" stroke-linejoin="round"></path></svg>
    Answer this
  </button>
</div>`;

function threadBody(q: QuestionView, answers: AnswerView[]): string {
  if (q.moderationStatus === "blocked") return BLOCKED_HTML;

  const answersBlock =
    answers.length === 0
      ? NO_ANSWERS_HTML
      : `<div style="display:flex; align-items:center; gap:8px; margin-top:4px">
           <span style="font-family:'Baloo 2',sans-serif; font-weight:600; font-size:16px; color:#3D2C26">${esc(answerCountLabel(answers.length))}</span>
         </div>
         <div style="display:flex; flex-direction:column; gap:12px">${answers.map(answerCard).join("")}</div>`;

  return `<div style="padding:8px 20px 120px; display:flex; flex-direction:column; gap:14px; flex:1">
      ${questionCard(q)}
      ${answersBlock}
    </div>
    ${canAnswer(q) ? ANSWER_BAR : ""}`;
}

export function renderQuestionThread(p: QuestionThreadProps): HTMLElement {
  let body: string;
  if (p.phase === "loading") body = LOADING_HTML;
  else if (p.phase === "error" || !p.question)
    body = errorHTML(p.errorMessage ?? "Couldn't load right now — it's us, not you.");
  else body = threadBody(p.question, p.answers);

  const root = elFromHTML(appShell(`${HEADER}${body}`));

  root.querySelector<HTMLButtonElement>("#mur-thread-back")?.addEventListener("click", p.onBack);
  root.querySelector<HTMLButtonElement>("#mur-thread-answer")?.addEventListener("click", p.onAnswer);
  root.querySelector<HTMLButtonElement>("#mur-thread-retry")?.addEventListener("click", p.onRetry);

  // Both loops find nothing while their FEATURES flag is off — the markup they bind to is
  // not emitted. They exist so flipping a flag needs no change here.
  for (const btn of root.querySelectorAll<HTMLElement>("[data-vote-answer-id]")) {
    btn.addEventListener("click", () => p.onVote?.(btn.dataset.voteAnswerId!));
  }
  for (const btn of root.querySelectorAll<HTMLElement>("[data-report-id]")) {
    btn.addEventListener("click", () =>
      p.onReport?.({
        type: btn.dataset.reportType as "question" | "answer",
        id: btn.dataset.reportId!,
      }),
    );
  }
  return root;
}
