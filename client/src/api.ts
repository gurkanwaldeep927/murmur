/**
 * Typed client for the Murmur API — the integration seam the S1–S4 screens (T10) call.
 * Claude Design components stay presentational; this module owns every network call
 * and the uniform error envelope shape. No visual code lives here.
 */

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

async function request(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  return { status: res.status, json };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const { status, json } = await request(path, body);
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

// --- A12: fire-and-forget analytics ---
export function emitEvent(eventType: string, metadata?: Record<string, unknown>): void {
  void fetch(`${API_BASE}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventType, metadata }),
    keepalive: true,
  }).catch(() => {
    /* fire-and-forget: never blocks or fails the user action */
  });
}
