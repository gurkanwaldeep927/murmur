import {
  ApiCallError,
  browseQuestions,
  createAnswer,
  createQuestion,
  emitEvent,
  fetchQuestionThread,
  listTopics,
  newIdempotencyKey,
} from "../api";
import { render } from "./dom";
import { renderQuestionFeed, type FeedPhase } from "./question-feed";
import { renderQuestionThread, type ThreadPhase } from "./question-thread";
import { renderAskComposer, type AskPhase } from "./ask-composer";
import { renderAnswerComposer, type AnswerPhase } from "./answer-composer";
import { feedSafe, submissionOutcome } from "../lib/content-view";
import type { AnswerView, QuestionView, TopicRef } from "../lib/content-view";
import { answerErrorCopy, askErrorCopy, isSessionDead } from "../lib/content-errors";

/**
 * F3/F6 authenticated shell (plan T19). Wires the ported S5–S8 screens to A3 (create
 * question), A4 (create answer) and A5-browse. This is the integration/state-machine
 * layer — it holds no visual markup of its own, exactly as `verification-flow.ts` does
 * for S1–S4.
 *
 * Flow: S5 feed → tap card → S7 thread → "Answer this" → S8; S5 FAB → S6.
 */

interface ShellProfile {
  pseudonym: string;
  year_badge: string;
}

interface ShellState {
  route: "feed" | "ask" | "thread" | "answer";

  feedPhase: FeedPhase;
  questions: QuestionView[];
  emptyMessage: string | null;

  threadPhase: ThreadPhase;
  threadId: string | null;
  question: QuestionView | null;
  answers: AnswerView[];
  threadError: string | null;

  askPhase: AskPhase;
  topics: TopicRef[];
  selectedTopic: string | null;
  askTitle: string;
  askBody: string;
  askTopicError: boolean;
  askError: string | null;
  askOutcomeMessage: string;
  /**
   * Held for the LIFETIME OF THE DRAFT, not per attempt. Reusing it is what makes a
   * retry after a timeout replay the original write instead of posting twice (A3's
   * idempotent-replay branch); regenerating per attempt would defeat the mechanism
   * entirely. Cleared only when the composer resets to a blank draft.
   */
  askKey: string | null;
  /** The question created by the last successful ask, so the outcome CTA can open it. */
  askCreatedId: string | null;

  answerPhase: AnswerPhase;
  answerBody: string;
  answerError: string | null;
  answerOutcomeMessage: string;
  answerKey: string | null;
}

export function mountAppShell(
  mount: HTMLElement,
  profile: ShellProfile,
  onSessionLost: () => void,
): void {
  const state: ShellState = {
    route: "feed",
    feedPhase: "loading",
    questions: [],
    emptyMessage: null,
    threadPhase: "loading",
    threadId: null,
    question: null,
    answers: [],
    threadError: null,
    askPhase: "form",
    topics: [],
    selectedTopic: null,
    askTitle: "",
    askBody: "",
    askTopicError: false,
    askError: null,
    askOutcomeMessage: "",
    askKey: null,
    askCreatedId: null,
    answerPhase: "form",
    answerBody: "",
    answerError: null,
    answerOutcomeMessage: "",
    answerKey: null,
  };

  /**
   * One place decides what a failure means. A 401 is a dead session — `api.ts`'s
   * `handle()` has already cleared storage, so the only question left is which screen to
   * mount, and the answer is S1. Everything else is handled by the calling screen.
   * Returns true when it consumed the error.
   */
  function handleSessionLoss(err: unknown): boolean {
    if (err instanceof ApiCallError && isSessionDead(err.status)) {
      onSessionLost();
      return true;
    }
    return false;
  }

  function draw(): void {
    switch (state.route) {
      case "feed":
        render(
          mount,
          renderQuestionFeed({
            phase: state.feedPhase,
            questions: state.questions,
            emptyMessage: state.emptyMessage,
            viewerPseudonym: profile.pseudonym,
            onOpenQuestion: (id) => void openThread(id),
            onAsk: () => void openAsk(),
            onRetry: () => void loadFeed(),
          }),
        );
        break;
      case "thread":
        render(
          mount,
          renderQuestionThread({
            phase: state.threadPhase,
            question: state.question,
            answers: state.answers,
            errorMessage: state.threadError,
            onBack: () => {
              state.route = "feed";
              draw();
              void loadFeed();
            },
            onAnswer: () => openAnswer(),
            onRetry: () => void openThread(state.threadId ?? ""),
          }),
        );
        break;
      case "ask":
        render(
          mount,
          renderAskComposer({
            phase: state.askPhase,
            pseudonym: profile.pseudonym,
            topics: state.topics,
            selectedTopic: state.selectedTopic,
            title: state.askTitle,
            body: state.askBody,
            topicError: state.askTopicError,
            errorMsg: state.askError,
            outcomeMessage: state.askOutcomeMessage,
            onTopicPick: (slug) => {
              state.selectedTopic = state.selectedTopic === slug ? null : slug;
              state.askTopicError = false;
              draw();
            },
            onTitleInput: (v) => {
              state.askTitle = v;
            },
            onBodyInput: (v) => {
              state.askBody = v;
            },
            onSubmit: () => void submitQuestion(),
            onClose: () => {
              resetAsk();
              state.route = "feed";
              draw();
            },
            onAfterOutcome: () => {
              const created = state.askCreatedId;
              resetAsk();
              // Published and pending both land on the thread: the author can see their
              // own held question there, under the "Under review" chip. (S12 "My Posts"
              // is M4/M5 — docs/design-prompts/T19-round-3.md gap 3.)
              if (created) void openThread(created);
              else {
                state.route = "feed";
                draw();
                void loadFeed();
              }
            },
          }),
        );
        break;
      case "answer":
        if (!state.question) {
          state.route = "feed";
          draw();
          return;
        }
        render(
          mount,
          renderAnswerComposer({
            phase: state.answerPhase,
            pseudonym: profile.pseudonym,
            question: state.question,
            body: state.answerBody,
            errorMsg: state.answerError,
            outcomeMessage: state.answerOutcomeMessage,
            onBodyInput: (v) => {
              state.answerBody = v;
            },
            onSubmit: () => void submitAnswer(),
            onAfterOutcome: () => {
              resetAnswer();
              void openThread(state.threadId ?? "");
            },
          }),
        );
        break;
    }
  }

  // --- A5 browse (S5) ---
  async function loadFeed(): Promise<void> {
    state.feedPhase = state.questions.length ? "list" : "loading";
    if (state.route === "feed") draw();
    try {
      const page = await browseQuestions();
      // feedSafe is belt-and-braces over data the server already narrowed to published.
      state.questions = feedSafe(page.questions);
      state.emptyMessage = page.emptyMessage;
      state.feedPhase = state.questions.length === 0 ? "empty" : "list";
    } catch (err) {
      if (handleSessionLoss(err)) return;
      state.feedPhase = "error";
    }
    if (state.route === "feed") draw();
  }

  // --- A5 thread read (S7) ---
  async function openThread(id: string): Promise<void> {
    if (!id) return;
    state.route = "thread";
    state.threadId = id;
    state.threadPhase = "loading";
    state.threadError = null;
    draw();
    try {
      const { question, answers } = await fetchQuestionThread(id);
      state.question = question;
      state.answers = answers;
      state.threadPhase = "thread";
    } catch (err) {
      if (handleSessionLoss(err)) return;
      state.threadPhase = "error";
      state.threadError =
        err instanceof ApiCallError
          ? err.apiError.message
          : "Couldn't load right now — it's us, not you.";
    }
    draw();
  }

  // --- A3 create question (S6) ---
  function resetAsk(): void {
    state.askPhase = "form";
    state.askTitle = "";
    state.askBody = "";
    state.selectedTopic = null;
    state.askTopicError = false;
    state.askError = null;
    state.askKey = null; // new draft => new idempotency key
    state.askCreatedId = null;
  }

  async function openAsk(): Promise<void> {
    state.route = "ask";
    state.askPhase = "form";
    draw();
    if (state.topics.length) return;
    try {
      const { topics } = await listTopics();
      state.topics = topics;
    } catch (err) {
      if (handleSessionLoss(err)) return;
      // Without the seeded slugs there is nothing safe to submit: the chips are display
      // labels and A3 wants slugs, so guessing by lowercasing would post to the wrong
      // topic or fail validation (README note 4).
      state.askError = "Couldn't load topics just now. Give it another try in a moment.";
    }
    if (state.route === "ask") draw();
  }

  async function submitQuestion(): Promise<void> {
    if (state.askPhase === "loading") return;
    if (!state.selectedTopic) {
      state.askTopicError = true;
      draw();
      return;
    }
    if (!state.askTitle.trim() || !state.askBody.trim()) {
      state.askError = "A question needs a title and a few details.";
      draw();
      return;
    }

    state.askKey ??= newIdempotencyKey();
    state.askPhase = "loading";
    state.askError = null;
    draw();

    try {
      const res = await createQuestion({
        topic: state.selectedTopic,
        title: state.askTitle.trim(),
        body: state.askBody.trim(),
        idempotencyKey: state.askKey,
      });
      const outcome = submissionOutcome(res);
      state.askCreatedId = res.id;
      state.askOutcomeMessage = res.message;
      state.askPhase = outcome;
      emitEvent("client.content.question_submitted", { moderationStatus: outcome });
      draw();
    } catch (err) {
      if (handleSessionLoss(err)) return;
      state.askPhase = "form";
      state.askError =
        err instanceof ApiCallError
          ? askErrorCopy(err.apiError.code, err.apiError.message)
          : askErrorCopy("internal_error");
      // The key is deliberately NOT cleared: the next attempt on this same draft must
      // replay, not create a second question.
      draw();
    }
  }

  // --- A4 create answer (S8) ---
  function resetAnswer(): void {
    state.answerPhase = "form";
    state.answerBody = "";
    state.answerError = null;
    state.answerKey = null;
  }

  function openAnswer(): void {
    resetAnswer();
    state.route = "answer";
    draw();
  }

  async function submitAnswer(): Promise<void> {
    if (state.answerPhase === "loading") return;
    if (!state.answerBody.trim() || !state.threadId) return;

    state.answerKey ??= newIdempotencyKey();
    state.answerPhase = "loading";
    state.answerError = null;
    draw();

    try {
      const res = await createAnswer(state.threadId, {
        body: state.answerBody.trim(),
        idempotencyKey: state.answerKey,
      });
      const outcome = submissionOutcome(res);
      state.answerOutcomeMessage = res.message;
      state.answerPhase = outcome;
      emitEvent("client.content.answer_submitted", { moderationStatus: outcome });
      draw();
    } catch (err) {
      if (handleSessionLoss(err)) return;
      state.answerPhase = "form";
      state.answerError =
        err instanceof ApiCallError
          ? answerErrorCopy(err.apiError.code, err.apiError.message)
          : answerErrorCopy("internal_error");
      draw();
    }
  }

  draw();
  void loadFeed();
}
