/**
 * errors.ts — Type-safe error handling utilities for Percolator services.
 *
 * Provides structured error types and type guards to replace generic `unknown`
 * error typing throughout the codebase, and the `getErrorMessage` helper used
 * by keeper services.
 */

/** Structured API error with status code, error code, and context. */
export interface ApiError {
  /** HTTP status code or RPC error code */
  status: number;
  /** Internal error code for tracking and metrics */
  code: string;
  /** User-friendly error message */
  message: string;
  /** Additional context for debugging */
  context?: Record<string, unknown>;
  /** Original error if wrapped */
  cause?: Error;
}

/** Validation error for request/input validation failures. */
export interface ValidationError {
  code: string;
  message: string;
  fields?: Record<string, string>;
  context?: Record<string, unknown>;
}

/** RPC error response from Solana. */
export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

export function isApiError(e: unknown): e is ApiError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as Partial<ApiError>).status === "number" &&
    typeof (e as Partial<ApiError>).code === "string" &&
    typeof (e as Partial<ApiError>).message === "string"
  );
}

export function isValidationError(e: unknown): e is ValidationError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as Partial<ValidationError>).code === "string" &&
    typeof (e as Partial<ValidationError>).message === "string"
  );
}

export function isRpcError(e: unknown): e is RpcError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as Partial<RpcError>).code === "number" &&
    typeof (e as Partial<RpcError>).message === "string"
  );
}

/**
 * Extract a safe error message from any error type.
 * Always returns a non-empty string — safe to log or send to Discord alerts.
 */
export function getErrorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  if (isValidationError(e)) return e.message;
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const msg = (e as Record<string, unknown>).message;
    if (typeof msg === "string") return msg;
  }
  if (typeof e === "string") return e;
  return "Unknown error";
}

export function getErrorCode(e: unknown): string {
  if (isApiError(e)) return e.code;
  if (isValidationError(e)) return e.code;
  if (isRpcError(e)) return `RPC_${e.code}`;
  return "UNKNOWN";
}

export function toApiError(
  input: unknown,
  defaultStatus: number = 500,
  context?: Record<string, unknown>,
): ApiError {
  if (isApiError(input)) {
    return { ...input, context: { ...input.context, ...context } };
  }
  if (isValidationError(input)) {
    return {
      status: 400,
      code: input.code,
      message: input.message,
      context: { ...input.context, ...context, fields: input.fields },
    };
  }
  if (input instanceof Error) {
    return { status: defaultStatus, code: input.name || "ERROR", message: input.message, context, cause: input };
  }
  return { status: defaultStatus, code: "UNKNOWN", message: getErrorMessage(input), context };
}

export function createValidationError(
  code: string,
  message: string,
  fields?: Record<string, string>,
  context?: Record<string, unknown>,
): ValidationError {
  return { code, message, fields, context };
}
