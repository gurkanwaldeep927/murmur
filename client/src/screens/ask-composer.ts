import { elFromHTML, esc } from "./dom";
import { appShell, dotsHTML } from "./styles";
import { avatarFor } from "../lib/format";
import type { ModerationStatus, TopicRef } from "../lib/content-view";

/**
 * S6 — AskComposer / Ask a Question (ported verbatim from "S6 AskComposer.dc.html").
 * Brief: docs/06-ui.md §3.6. Flows F3/F6/F9, UX S6.
 *
 * Two integration constraints, both from client/src/components/README.md:
 *
 *  - Topic chips are DISPLAY LABELS, not slugs (note 4). The chips read "Placements";
 *    A3 expects the seeded slug "placements". They are mapped via `GET /topics` rather
 *    than by lowercasing, because `topic_tag.label` exists precisely so the two can
 *    diverge — a label with a space or an ampersand would break a lowercasing client.
 *
 *  - The pending card's paragraph is NOT the designer's (note 1). It promised the post
 *    "usually takes a few minutes", which is untrue in the posture that actually ships:
 *    with no provider bound (hold-all, until T14b/M6) nothing publishes at all. Rather
 *    than invent replacement copy, the paragraph renders the SERVER's own message. The
 *    heading, layout and everything else are the designer's, verbatim. Claude Design
 *    round 3 supplies the proper card — docs/design-prompts/T19-round-3.md gap 1.
 */

export type AskPhase = "form" | "loading" | "published" | "pending" | "blocked";

export interface AskComposerProps {
  phase: AskPhase;
  pseudonym: string;
  topics: TopicRef[];
  /** Selected topic SLUG, not label. */
  selectedTopic: string | null;
  title: string;
  body: string;
  topicError: boolean;
  errorMsg: string | null;
  /** The server's message for the terminal outcome cards. */
  outcomeMessage: string;
  onTopicPick: (slug: string) => void;
  onTitleInput: (value: string) => void;
  onBodyInput: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  onAfterOutcome: () => void;
}

function header(pseudonym: string): string {
  return `<header style="padding:16px 20px; display:flex; align-items:center; justify-content:space-between">
    <button id="mur-ask-close" class="mur-icon-btn" style="border:none; background:transparent; cursor:pointer; width:34px; height:34px; border-radius:12px; display:flex; align-items:center; justify-content:center; transition:background .15s ease">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#8A7168" stroke-width="2" stroke-linecap="round"></path></svg>
    </button>
    <div style="display:flex; align-items:center; gap:6px; background:#E7F1EA; border-radius:999px; padding:6px 13px 6px 8px">
      <span style="width:20px; height:20px; border-radius:50%; background:#FFFFFF; display:flex; align-items:center; justify-content:center; font-size:11px">${avatarFor(pseudonym)}</span>
      <span style="font-size:12.5px; font-weight:600; color:#4E7A62">posting as <strong style="font-family:'Baloo 2',sans-serif; font-weight:700">${esc(pseudonym)}</strong></span>
    </div>
  </header>`;
}

function topicChips(topics: TopicRef[], selected: string | null): string {
  return topics
    .map((t) => {
      const on = selected === t.slug;
      const bg = on ? "#F26B4E" : "#FFFFFF";
      const color = on ? "#FFF8F1" : "#8A7168";
      const border = on ? "#F26B4E" : "#F0DCD0";
      return `<button data-topic-slug="${esc(t.slug)}" class="mur-chip" style="border:2px solid ${border}; cursor:pointer; background:${bg}; color:${color}; font-family:'Plus Jakarta Sans',sans-serif; font-size:13.5px; font-weight:600; padding:8px 16px; border-radius:999px; transition:all .18s cubic-bezier(.34,1.56,.64,1)">${esc(t.label)}</button>`;
    })
    .join("");
}

function formHTML(p: AskComposerProps): string {
  const loading = p.phase === "loading";
  const errorBlock = p.errorMsg
    ? `<div style="display:flex; gap:8px; align-items:flex-start; background:#FBEDE7; border-radius:14px; padding:11px 14px; animation:slideDown .22s ease">
        <span style="flex:none; width:16px; height:16px; margin-top:1px; border-radius:50%; background:#D96B57; color:#FFF8F1; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center">!</span>
        <span style="font-size:13.5px; line-height:1.5; color:#A8503E">${esc(p.errorMsg)}</span>
      </div>`
    : "";
  const btnInner = loading
    ? `<span style="display:flex; align-items:center; gap:7px">Asking ${dotsHTML}</span>`
    : "Ask";

  return `<div style="display:flex; flex-direction:column; flex:1">
    ${header(p.pseudonym)}
    <div style="padding:4px 20px 20px; display:flex; flex-direction:column; gap:18px; flex:1">
      <div style="display:flex; flex-direction:column; gap:6px">
        <h1 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:24px; line-height:1.3; color:#3D2C26; text-wrap:pretty">Ask the whole senior pool</h1>
        <p style="margin:0; font-size:13.5px; color:#8A7168">Nobody will know it's you. Not even a little.</p>
      </div>

      <div style="display:flex; flex-direction:column; gap:9px">
        <span style="font-size:12.5px; font-weight:700; color:#8A7168; letter-spacing:.3px">TOPIC</span>
        <div style="display:flex; flex-wrap:wrap; gap:8px">${topicChips(p.topics, p.selectedTopic)}</div>
        ${
          p.topicError
            ? `<span style="font-size:12.5px; color:#A8503E; animation:slideDown .2s ease">Pick a topic so the right seniors find it.</span>`
            : ""
        }
      </div>

      <div style="background:#FFFFFF; border-radius:20px; padding:20px; box-shadow:0 8px 26px rgba(93,58,44,.07); display:flex; flex-direction:column; gap:4px; flex:1">
        <input id="mur-ask-title" class="mur-bare-input" value="${esc(p.title)}" ${loading ? "disabled" : ""} placeholder="What do you want to know?" style="border:none; outline:none; background:transparent; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:19px; color:#3D2C26; padding:4px 0">
        <div style="height:1px; background:#F4E5D9; margin:6px 0"></div>
        <textarea id="mur-ask-body" class="mur-bare-input" rows="9" ${loading ? "disabled" : ""} placeholder="Add the details — the honest version. What have you tried, what are you worried about, what would actually help?" style="border:none; outline:none; background:transparent; font-family:'Plus Jakarta Sans',sans-serif; font-size:14.5px; line-height:1.65; color:#5C4A42; flex:1; resize:none">${esc(p.body)}</textarea>
      </div>

      ${errorBlock}

      <div style="display:flex; flex-direction:column; gap:10px; padding-bottom:16px">
        <button id="mur-ask-submit" class="mur-btn-primary" ${loading ? "disabled" : ""} style="width:100%; border:none; cursor:pointer; border-radius:16px; padding:16px; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:17px; color:#FFF8F1; background:#F26B4E; box-shadow:0 6px 18px rgba(242,107,78,.32); transition:transform .18s cubic-bezier(.34,1.56,.64,1), background .18s ease; display:flex; align-items:center; justify-content:center; gap:8px">${btnInner}</button>
      </div>
    </div>
  </div>`;
}

/**
 * The three terminal cards. Structure, heading and button styling are the designer's;
 * the paragraph is the server's own message — see the note at the top of this file.
 */
function outcomeHTML(status: ModerationStatus, message: string): string {
  const card = (icon: string, heading: string, cta: string, ctaClass: string, ctaStyle: string) =>
    `<div style="flex:1; display:flex; align-items:center; justify-content:center; padding:24px">
      <div style="background:#FFFFFF; border-radius:26px; padding:40px 30px; box-shadow:0 12px 38px rgba(93,58,44,.1); display:flex; flex-direction:column; align-items:center; gap:13px; text-align:center; max-width:340px; animation:popIn .4s cubic-bezier(.34,1.56,.64,1)">
        ${icon}
        <h2 style="margin:0; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:22px; color:#3D2C26">${esc(heading)}</h2>
        <p style="margin:0; font-size:14px; line-height:1.6; color:#8A7168; text-wrap:pretty">${esc(message)}</p>
        <button id="mur-ask-done" class="${ctaClass}" style="margin-top:6px; border:none; cursor:pointer; border-radius:14px; padding:13px 26px; font-family:'Baloo 2',sans-serif; font-weight:600; font-size:15px; ${ctaStyle}">${esc(cta)}</button>
      </div>
    </div>`;

  const shieldIcon = `<div style="width:64px; height:64px; border-radius:50%; background:#EFF4F3; display:flex; align-items:center; justify-content:center; animation:popIn .55s cubic-bezier(.34,1.56,.64,1)">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" stroke="#7BA3A0" stroke-width="1.8" stroke-linejoin="round"></path><path d="M9 12l2 2 4-4.5" stroke="#7BA3A0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>
  </div>`;

  if (status === "published") {
    return card(
      `<div style="width:64px; height:64px; border-radius:50%; background:#E7F1EA; display:flex; align-items:center; justify-content:center; font-size:28px; animation:popIn .55s cubic-bezier(.34,1.56,.64,1)">🎉</div>`,
      "It's out there",
      "View your question",
      "mur-btn-primary",
      "color:#FFF8F1; background:#F26B4E; box-shadow:0 6px 18px rgba(242,107,78,.32)",
    );
  }
  if (status === "pending") {
    // Designer's heading kept verbatim; the "few minutes" paragraph is replaced by the
    // server's message. "Track it in My Posts" targets S12 (M4/M5), so the button goes to
    // the thread — where the author CAN see their own held post, under the "Under review"
    // chip. Label untouched pending Claude Design round 3 (gap 3).
    return card(
      shieldIcon,
      "Asked — just one quick check",
      "Track it in My Posts",
      "mur-btn-soft",
      "color:#4E7A62; background:#E7F1EA",
    );
  }
  // The API can return 201 + moderationStatus "blocked" (auto_block tier). The designer
  // drew no card for it — gap 2. Reusing the shield card with the server's own reason is
  // the honest interim: it says what happened without inventing consolation copy.
  return card(
    shieldIcon,
    "Not published",
    "Back to the feed",
    "mur-btn-muted",
    "color:#8A7168; background:#F4EDE3",
  );
}

/** Narrows the phase to a terminal moderation outcome, or null while still composing. */
function outcomeOf(phase: AskPhase): ModerationStatus | null {
  return phase === "published" || phase === "pending" || phase === "blocked" ? phase : null;
}

export function renderAskComposer(p: AskComposerProps): HTMLElement {
  const outcome = outcomeOf(p.phase);
  const root = elFromHTML(
    appShell(outcome ? outcomeHTML(outcome, p.outcomeMessage) : formHTML(p)),
  );

  if (outcome) {
    root.querySelector<HTMLButtonElement>("#mur-ask-done")?.addEventListener("click", p.onAfterOutcome);
    return root;
  }

  root.querySelector<HTMLButtonElement>("#mur-ask-close")?.addEventListener("click", p.onClose);
  root.querySelector<HTMLButtonElement>("#mur-ask-submit")?.addEventListener("click", p.onSubmit);

  const title = root.querySelector<HTMLInputElement>("#mur-ask-title");
  const body = root.querySelector<HTMLTextAreaElement>("#mur-ask-body");
  // No re-render on keystroke — that would lose focus and the caret mid-sentence, on the
  // most emotionally loaded screen in the product (brief §3.6).
  title?.addEventListener("input", () => p.onTitleInput(title.value));
  body?.addEventListener("input", () => p.onBodyInput(body.value));

  for (const chip of root.querySelectorAll<HTMLElement>("[data-topic-slug]")) {
    chip.addEventListener("click", () => p.onTopicPick(chip.dataset.topicSlug!));
  }
  return root;
}
