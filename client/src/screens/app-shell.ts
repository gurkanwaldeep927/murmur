import {
  ApiCallError,
  browseQuestions,
  createAnswer,
  createQuestion,
  emitEvent,
  fetchQuestionThread,
  listTopics,
  newIdempotencyKey,
  sendSyncBatch,
} from "../api";
import { render } from "./dom";
import { renderQuestionFeed, type FeedPhase } from "./question-feed";
import { renderQuestionThread, type ThreadPhase } from "./question-thread";
import { renderAskComposer, type AskPhase } from "./ask-composer";
import { renderAnswerComposer, type AnswerPhase } from "./answer-composer";
import { feedSafe, submissionOutcome } from "../lib/content-view";
import type { AnswerView, QuestionView, TopicRef } from "../lib/content-view";
import {
  QUEUED_OFFLINE_MESSAGE,
  QUEUED_UNSAVED_MESSAGE,
  answerErrorCopy,
  askErrorCopy,
  isSessionDead,
} from "../lib/content-errors";
import { newOutboxItem } from "../lib/outbox";
import { createOutboxStore } from "../outbox-store";
import { createDraftStore } from "../drafts-store";
import { createTopicStore } from "../topic-store";
import { createSyncRunner } from "../sync";
import type { Draft } from "../lib/drafts";

/**
 * F3/F6 authenticated shell (plan T19, extended by T28). Wires the ported S5–S8 screens to
 * A3 (create question), A4 (create answer) and A5-browse. This is the
 * integration/state-machine layer — it holds no visual markup of its own, exactly as
 * `verification-flow.ts` does for S1–S4.
 *
 * Flow: S5 feed → tap card → S7 thread → "Answer this" → S8; S5 FAB → S6.
 *
 * ## T28: what happens when there is no signal
 *
 * A submit takes one of two roads. Online, it posts and behaves exactly as it did before.
 * Offline — or when the network dies mid-request — it goes into the local outbox and the
 * composer shows the `queued` card instead of pretending to have posted.
 *
 * **The idempotency key crosses that boundary with the post, and that is the load-bearing
 * detail.** A request that timed out may already have been written server-side; queueing it
 * under a fresh key would post it twice, under the student's own name, with nothing linking
 * the copies. Reusing `state.askKey` / `state.answerKey` makes the queued send a replay of a
 * write that may or may not have landed, which is what A3/A4's replay branch is for.
 *
 * **An `ApiCallError` is never queued.** The server answered — a validation failure, a
 * rate limit, a ban — and retrying an answered refusal forever is how a queue becomes a
 * landfill. Only a transport failure (fetch rejected: offline, DNS, timeout) falls back to
 * the outbox, because that is the only case where nobody knows the outcome.
 */

interface ShellProfile {
  /**
   * Both stores are keyed by it. Two students on one phone must not share an outbox: A10
   * attributes every queued item to whoever is signed in when it flushes, so a shared queue
   * would publish one student's post under the other's pseudonym. See `outbox-store.ts`.
   */
  id: string;
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
  const topicStore = createTopicStore();
  let topicsRefreshed = false;
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
    topics: topicStore.read(),
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

  const outbox = createOutboxStore(profile.id);
  const drafts = createDraftStore(profile.id);
  const sync = createSyncRunner({
    store: outbox,
    sendBatch: sendSyncBatch,
    isOnline: () => (typeof navigator === "undefined" ? true : navigator.onLine),
    onOnline: (listener) => {
      window.addEventListener("online", listener);
      return () => window.removeEventListener("online", listener);
    },
  });
  // Flushes whatever survived the last run, then again on every `online` event. Not torn
  // down: the shell lives as long as the signed-in app does, and a listener removed while
  // posts are still queued is a queue that stops draining.
  sync.start();

  /**
   * True when the app has no reason to believe a request can reach anywhere.
   *
   * `navigator.onLine` is a weak signal — it means "there is a network interface", not "the
   * server is reachable", and a captive portal reads as online. It is used only to SKIP a
   * request that is certain to fail, never to decide anything else; a wrong `true` costs one
   * failed request that then falls into the same queue anyway.
   */
  function offline(): boolean {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  /** A transport failure — nobody answered. The only kind of failure that may be queued. */
  function isTransportFailure(err: unknown): boolean {
    return !(err instanceof ApiCallError);
  }

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
              saveAskDraft();
              draw();
            },
            onTitleInput: (v) => {
              state.askTitle = v;
              saveAskDraft();
            },
            onBodyInput: (v) => {
              state.askBody = v;
              saveAskDraft();
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
              saveAnswerDraft();
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

  // --- T28 draft autosave ---

  /**
   * Saved on every keystroke, with no throttle, and that is a considered choice rather than
   * an omission. The composer deliberately does NOT re-render on input (it would lose the
   * caret mid-sentence), so this write is the only work a keystroke does; a `setItem` of a
   * post-sized string is sub-millisecond. A timer would add a window in which the last few
   * words of a draft exist nowhere — which is the exact loss autosave is for.
   */
  function saveAskDraft(): void {
    drafts.save({
      entityType: "question",
      topic: state.selectedTopic,
      title: state.askTitle,
      body: state.askBody,
      updatedAt: new Date().toISOString(),
    });
  }

  function saveAnswerDraft(): void {
    if (!state.threadId) return;
    drafts.save({
      entityType: "answer",
      parentQuestionId: state.threadId,
      body: state.answerBody,
      updatedAt: new Date().toISOString(),
    });
  }

  function restoreDraft(key: string): Draft | null {
    return drafts.read(key);
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
    // Restored before the first paint, so a student who closed the app mid-question does
    // not see an empty box and conclude their words are gone.
    const draft = restoreDraft("question");
    if (draft?.entityType === "question") {
      state.askTitle = draft.title;
      state.askBody = draft.body;
      state.selectedTopic = draft.topic;
    }
    draw();
    if (topicsRefreshed || (offline() && state.topics.length)) return;
    try {
      const { topics } = await listTopics();
      state.topics = topics;
      topicsRefreshed = true;
      topicStore.save(topics);
    } catch (err) {
      if (handleSessionLoss(err)) return;
      // Without the seeded slugs there is nothing safe to submit: the chips are display
      // labels and A3 wants slugs, so guessing by lowercasing would post to the wrong
      // topic or fail validation (README note 4).
      // Cached slugs are enough to queue an offline post; A10 validates them
      // when connectivity returns. Without a cache, retain the existing error.
      if (!state.topics.length) {
        state.askError = "Couldn't load topics just now. Give it another try in a moment.";
      }
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

    if (offline()) return queueQuestion();

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
      // The post is the server's now, so the draft has done its job. Discarded here rather
      // than in resetAsk(), which also runs on close — where the draft must SURVIVE.
      drafts.discard("question");
      emitEvent("client.content.question_submitted", { moderationStatus: outcome });
      draw();
    } catch (err) {
      if (handleSessionLoss(err)) return;
      if (isTransportFailure(err)) return queueQuestion();
      state.askPhase = "form";
      state.askError = askErrorCopy(
        (err as ApiCallError).apiError.code,
        (err as ApiCallError).apiError.message,
      );
      // The key is deliberately NOT cleared: the next attempt on this same draft must
      // replay, not create a second question.
      draw();
    }
  }

  /**
   * Hand the question to the outbox instead of the network.
   *
   * The idempotency key is the one this draft has been carrying, never a fresh one — see
   * the header of this file for why that is the difference between a retry and a duplicate
   * post. The draft is discarded because the post now lives in the queue: keeping both would
   * mean reopening the composer onto text that is already on its way, and posting it again.
   */
  function queueQuestion(): void {
    if (!state.selectedTopic || !state.askKey) return;
    const item = newOutboxItem(
      {
        entityType: "question",
        payload: {
          topic: state.selectedTopic,
          title: state.askTitle.trim(),
          body: state.askBody.trim(),
        },
      },
      newIdempotencyKey,
      new Date(),
      state.askKey,
    );
    const { persisted } = outbox.enqueue(item);
    drafts.discard("question");
    state.askCreatedId = null;
    state.askOutcomeMessage = persisted ? QUEUED_OFFLINE_MESSAGE : QUEUED_UNSAVED_MESSAGE;
    state.askPhase = "queued";
    // No analytics event fires here, deliberately. `client.content.question_submitted` is
    // emitted on the online path only, so the funnel currently does not see offline posts
    // at all — and inventing one event for one composer would design the M4 metric one
    // endpoint at a time, which is the mistake T34 wrote down and handed to T53. There is
    // no M4 instrumentation task in the plan; that gap is recorded in docs/TASK-STATUS.md.
    draw();
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
    const draft = state.threadId ? restoreDraft(`answer:${state.threadId}`) : null;
    if (draft?.entityType === "answer") state.answerBody = draft.body;
    draw();
  }

  async function submitAnswer(): Promise<void> {
    if (state.answerPhase === "loading") return;
    if (!state.answerBody.trim() || !state.threadId) return;

    state.answerKey ??= newIdempotencyKey();

    if (offline()) return queueAnswer();

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
      drafts.discard(`answer:${state.threadId}`);
      emitEvent("client.content.answer_submitted", { moderationStatus: outcome });
      draw();
    } catch (err) {
      if (handleSessionLoss(err)) return;
      if (isTransportFailure(err)) return queueAnswer();
      state.answerPhase = "form";
      state.answerError = answerErrorCopy(
        (err as ApiCallError).apiError.code,
        (err as ApiCallError).apiError.message,
      );
      draw();
    }
  }

  /**
   * Hand the answer to the outbox.
   *
   * It names its parent by SERVER id (`questionId`), never by a local one: this composer is
   * only reachable from a thread that was loaded from the server, so the question demonstrably
   * exists there. The `parentClientLocalId` road in A10 exists for the harder case — a
   * question and its answer both written offline — which needs an offline thread view the
   * product does not have yet (S12/T31). Recorded rather than half-built: the model and the
   * batching rule that protect it are in `lib/outbox.ts` and tested, so T31 wires a path that
   * is already known to work.
   */
  function queueAnswer(): void {
    if (!state.threadId || !state.answerKey) return;
    const item = newOutboxItem(
      {
        entityType: "answer",
        payload: { questionId: state.threadId, body: state.answerBody.trim() },
      },
      newIdempotencyKey,
      new Date(),
      state.answerKey,
    );
    const { persisted } = outbox.enqueue(item);
    drafts.discard(`answer:${state.threadId}`);
    state.answerOutcomeMessage = persisted ? QUEUED_OFFLINE_MESSAGE : QUEUED_UNSAVED_MESSAGE;
    state.answerPhase = "queued";
    draw();
  }

  draw();
  void loadFeed();
}
