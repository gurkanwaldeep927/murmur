import type { Response } from "express";

/**
 * One error-response shape for every module (architecture §4). The 17 UX screens
 * source their error states from apis[].errors — a uniform envelope keeps them
 * consistent regardless of which module produced the failure.
 *
 * Envelope: { error: { code, message, details? } }
 * `code` is a stable machine token the client switches on; `message` is a short,
 * PII-free human string. Raw email / identity NEVER appear here (NFR identity
 * non-disclosure).
 */

export type ErrorCode =
  // Generic
  | "validation_failed"
  | "rate_limited"
  | "not_found"
  | "forbidden"
  | "internal_error"
  // A1 / A2 (verification)
  | "email_domain_refused"
  | "email_already_registered"
  | "email_malformed"
  | "token_invalid_or_expired"
  | "year_unparseable_blocked"
  | "registration_refused_banned"
  // Session (T12 — decisions/oq-14-session-mechanism.md)
  | "session_required"
  | "session_invalid_or_expired"
  | "account_suspended"
  | "account_banned";

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  validation: (message = "Request validation failed", details?: Record<string, unknown>) =>
    new AppError(400, "validation_failed", message, details),
  rateLimited: (message = "Too many attempts. Please try again later.") =>
    new AppError(429, "rate_limited", message),
  notFound: (message = "Not found") => new AppError(404, "not_found", message),
  forbidden: (message = "Forbidden") => new AppError(403, "forbidden", message),
  internal: (message = "Something went wrong") => new AppError(500, "internal_error", message),

  // Session outcomes. 401s tell the client to clear its stored session and send the
  // user back through S1; the 403s are terminal and deliberately do NOT (decision §6).
  sessionRequired: (message = "Sign in to continue.") =>
    new AppError(401, "session_required", message),
  sessionInvalid: (message = "Your session has expired. Please verify again.") =>
    new AppError(401, "session_invalid_or_expired", message),
  accountSuspended: (message = "Your account is suspended.") =>
    new AppError(403, "account_suspended", message),
  accountBanned: (message = "Your account has been removed.") =>
    new AppError(403, "account_banned", message),
};

export function sendError(res: Response, err: AppError): void {
  res.status(err.status).json({
    error: {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}
