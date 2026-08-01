/**
 * Typed client for the Murmur API — the integration seam the S1–S4 screens (T10) call.
 * Claude Design components stay presentational; this module owns every network call
 * and the uniform error envelope shape. No visual code lives here.
 */

import { clearSession, currentToken, updateSessionToken } from "./session";
import type {
  AnswerView,
  QuestionView,
  SubmissionResult,
  TopicRef,
} from "./lib/content-view";

const API_BASE = (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE ?? "";

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly apiError: ApiError,
  ) {
    super(apiError.message);
    this.name = "ApiCallError";
  }
}

/**
 * Every response passes through here so the sliding-refresh header (T12,
 * decisions/oq-14-session-mechanism.md §3) is honoured exactly once, in one place:
 * the server hands back a renewed token on aged-but-valid sessions, and the client
 * swaps it in silently. A 401 means the stored session is dead — drop it so the app
 * cannot keep retrying with a credential the server has already rejected.
 */
async function handle(res: Response): Promise<{ status: number; json: any }> {
  const refreshed = res.headers.get("x-session-refresh");
  if (refreshed) updateSessionToken(refreshed);
  if (res.status === 401) clearSession();
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  return { status: res.status, json };
}

/** Attaches the session credential when there is one. */
function authHeaders(): Record<string, string> {
  const token = currentToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function request(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return handle(res);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const { status, json } = await request(path, body);
  if (status < 200 || status >= 300) {
    const err: ApiError = json.error ?? { code: "internal_error", message: "Request failed" };
    throw new ApiCallError(status, err);
  }
  // NOTE: any 2xx is a success, and that includes 202. A3/A4 answer 202 for held content
  // — "accepted, not published" — so treating only 201 as success here would turn the
  // app's normal posture under hold-all into an error path. The caller reads
  // `pendingReview` to tell the two apart.
  return json as T;
}

/** Authenticated GET, routed through the same `handle()` so refresh/401 behave alike. */
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  const { status, json } = await handle(res);
  if (status < 200 || status >= 300) {
    const err: ApiError = json.error ?? { code: "internal_error", message: "Request failed" };
    throw new ApiCallError(status, err);
  }
  return json as T;
}

// --- A1: initiate verification (S1 → S2) ---
export interface InitiateResponse {
  status: "verification_pending";
  resendAvailableInSeconds: number;
}
export function initiateVerification(email: string): Promise<InitiateResponse> {
  return post<InitiateResponse>("/verification/initiate", { email });
}

// --- A2: confirm verification (S3 → S4). Non-2xx outcomes surface via ApiCallError. ---
export interface PublicProfile {
  id: string;
  pseudonym: string;
  year_badge: string;
  reputation_score: number;
  status: "active" | "suspended" | "banned";
}
export type ConfirmResult =
  | { outcome: "verified"; profile: PublicProfile; sessionToken: string }
  | { outcome: "blocked" } // 422 blocked_unparseable_year — held for review, never guessed
  | { outcome: "refused" }; // 403 registration_refused_banned

/**
 * A2 confirm. Returns the three legitimate terminal outcomes (verified / blocked /
 * refused) — these are NOT errors, they're distinct S4 states. Only real failures
 * (token_invalid_or_expired, validation) throw ApiCallError.
 */
export async function confirmVerification(email: string, token: string): Promise<ConfirmResult> {
  const { status, json } = await request("/verification/confirm", { email, token });
  if (status === 200 && json.outcome === "verified") {
    return { outcome: "verified", profile: json.profile, sessionToken: json.sessionToken };
  }
  if (json.outcome === "blocked_unparseable_year") return { outcome: "blocked" };
  if (json.outcome === "refused") return { outcome: "refused" };
  const err: ApiError = json.error ?? { code: "internal_error", message: "Verification failed" };
  throw new ApiCallError(status, err);
}

// --- T12: session (decisions/oq-14-session-mechanism.md) ---

/**
 * Trades A2's 15-minute bootstrap token for the real 30-day session credential.
 * Called once, immediately after a verified confirm — the bootstrap token is not a
 * session credential and is refused everywhere else.
 */
export async function exchangeBootstrapToken(
  bootstrapToken: string,
): Promise<{ sessionToken: string; profile: PublicProfile }> {
  const res = await fetch(`${API_BASE}/session/exchange`, {
    method: "POST",
    headers: { authorization: `Bearer ${bootstrapToken}` },
  });
  const { status, json } = await handle(res);
  if (status !== 200) {
    throw new ApiCallError(status, json.error ?? { code: "internal_error", message: "Sign-in failed" });
  }
  return json;
}

/**
 * Boot-time check: is the stored session still good? Returns the current profile, or
 * null when there is no usable session (no token, expired, or the account is gone).
 * A suspended/banned account throws, because that is a state the UI must show rather
 * than silently treat as signed-out (decision §6).
 */
export async function fetchCurrentSession(): Promise<PublicProfile | null> {
  if (!currentToken()) return null;
  const res = await fetch(`${API_BASE}/session`, { headers: authHeaders() });
  const { status, json } = await handle(res);
  if (status === 200) return json.profile as PublicProfile;
  if (status === 401) return null; // handle() has already cleared storage
  throw new ApiCallError(status, json.error ?? { code: "internal_error", message: "Session check failed" });
}

/** Discards the session client-side; the token then dies at its own expiry. */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/session/logout`, { method: "POST", headers: authHeaders() });
  } catch {
    /* logging out must succeed locally even if the network call does not */
  }
  clearSession();
}

// --- A3 / A4 / A5-browse: Q&A content (T15/T16/T17, integrated at T19) ---

export interface FeedPage {
  questions: QuestionView[];
  /** Keyset cursor for the next page; null at the end of the feed. */
  nextBefore: string | null;
  empty: boolean;
  /** The server's own empty-feed copy (R4 AC2 — an empty feed is a state, not an error). */
  emptyMessage: string | null;
}

/** A5 browse mode — the recent published feed behind S5. */
export function browseQuestions(opts: {
  topic?: string;
  before?: string;
  limit?: number;
} = {}): Promise<FeedPage> {
  const q = new URLSearchParams();
  if (opts.topic) q.set("topic", opts.topic);
  if (opts.before) q.set("before", opts.before);
  if (opts.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return get<FeedPage>(`/questions${qs ? `?${qs}` : ""}`);
}

/**
 * The S7 thread read. Returns the caller's OWN held question too — the server widens
 * visibility to the author — so the caller must branch on `question.moderationStatus`
 * rather than assuming anything it receives is live.
 */
export function fetchQuestionThread(
  id: string,
): Promise<{ question: QuestionView; answers: AnswerView[] }> {
  return get<{ question: QuestionView; answers: AnswerView[] }>(`/questions/${id}`);
}

/** The fixed seeded topic set behind S6's chips. Slugs are authoritative, labels display. */
export function listTopics(): Promise<{ topics: TopicRef[] }> {
  return get<{ topics: TopicRef[] }>("/topics");
}

/**
 * A3. `idempotencyKey` is generated by the CALLER and must be reused across retries of
 * the same draft — that is what makes a resend after a timeout replay the original write
 * instead of posting twice. Generating a fresh key per attempt would defeat the whole
 * mechanism, so composers hold theirs in state (see screens/ask-composer.ts).
 */
export function createQuestion(input: {
  topic: string;
  title: string;
  body: string;
  idempotencyKey: string;
}): Promise<SubmissionResult> {
  return post<SubmissionResult>("/questions", input);
}

/** A4. Same idempotency-key contract as A3. */
export function createAnswer(
  questionId: string,
  input: { body: string; idempotencyKey: string },
): Promise<SubmissionResult> {
  return post<SubmissionResult>(`/questions/${questionId}/answers`, input);
}

/**
 * A per-draft idempotency key. `crypto.randomUUID` needs a secure context; on plain-HTTP
 * origins it is undefined, and A3/A4 validate the field as a UUID, so a weaker fallback
 * still has to be UUID-shaped or every post fails.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// --- A12: fire-and-forget analytics ---

/**
 * The session token is attached when there is one so the server can DERIVE attribution
 * (PRV-7). It is never sent as a body field: A12 refuses a caller-supplied
 * `actorProfileId` outright, because accepting one let any anonymous caller attribute
 * events to any profile. Pre-auth funnel events simply arrive without a token and are
 * recorded anonymously, which is the normal case for this endpoint.
 *
 * Never awaited and never throws — analytics must not be able to fail a user action.
 */
export function emitEvent(eventType: string, metadata?: Record<string, unknown>): void {
  void fetch(`${API_BASE}/events`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ eventType, metadata }),
    keepalive: true,
  }).catch(() => {
    /* fire-and-forget: never blocks or fails the user action */
  });
}
