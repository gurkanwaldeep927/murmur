import type { PublicProfile } from "./api";

/**
 * Client-side session persistence (plan T12).
 * Design + tradeoffs: `decisions/oq-14-session-mechanism.md`, especially §7 on why this
 * is `localStorage` rather than an httpOnly cookie (two-origin deployment; the token
 * authorizes pseudonymous actions and carries no identity material).
 *
 * This module is the ONLY place the stored session is read or written. Screens ask it
 * for the current session; they never touch storage keys themselves.
 */

const SESSION_KEY = "murmur.session";

export interface StoredSession {
  /** A session token (post-exchange), never the short-lived bootstrap token. */
  token: string;
  profile: PublicProfile;
}

/**
 * localStorage throws in private-mode Safari and when storage is disabled. A session
 * that cannot be persisted must degrade to "signed in until reload", never crash the
 * app — so every access here is guarded.
 */
function safeRead(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** In-memory fallback so the app still works for one run when storage is unavailable. */
let memorySession: StoredSession | null = null;

export function loadSession(): StoredSession | null {
  const raw = safeRead();
  if (!raw) return memorySession;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed?.token === "string" && parsed.token && parsed.profile?.id) {
      return parsed as StoredSession;
    }
  } catch {
    /* fall through — a corrupt entry is treated as no session */
  }
  // Legacy/corrupt value (M1 stored a bare token string under this key): discard it.
  clearSession();
  return null;
}

export function saveSession(session: StoredSession): void {
  memorySession = session;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* memory fallback already set */
  }
}

/** Updates just the token, preserving the profile — used by sliding refresh. */
export function updateSessionToken(token: string): void {
  const current = loadSession();
  if (current) saveSession({ ...current, token });
}

export function clearSession(): void {
  memorySession = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing else to do */
  }
}

export function currentToken(): string | null {
  return loadSession()?.token ?? null;
}
