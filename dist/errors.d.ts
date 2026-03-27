/**
 * Type-safe error handling utilities for Percolator services.
 *
 * Provides structured error types and type guards to replace generic `unknown` error typing
 * throughout the codebase. Enables better error handling with compile-time type safety.
 */
/**
 * Structured API error with status code, error code, and context.
 * Use this type for errors that should be returned to clients.
 */
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
/**
 * Validation error for request/input validation failures.
 * Contains field-level error details.
 */
export interface ValidationError {
    /** Error code for validation class */
    code: string;
    /** User-friendly validation message */
    message: string;
    /** Field-level validation errors if applicable */
    fields?: Record<string, string>;
    /** Validation context */
    context?: Record<string, unknown>;
}
/**
 * RPC error response from Solana.
 * Structured representation of JSON-RPC error returns.
 */
export interface RpcError {
    code: number;
    message: string;
    data?: unknown;
}
/**
 * Type guard to check if error is an ApiError.
 *
 * @param e - Unknown error value to check
 * @returns True if error has ApiError structure (status, code, message)
 *
 * @example
 * try {
 *   await risky();
 * } catch (err) {
 *   if (isApiError(err)) {
 *     logger.error("API error", { code: err.code, message: err.message });
 *   }
 * }
 */
export declare function isApiError(e: unknown): e is ApiError;
/**
 * Type guard to check if error is a ValidationError.
 *
 * @param e - Unknown error value to check
 * @returns True if error has ValidationError structure (code, message)
 */
export declare function isValidationError(e: unknown): e is ValidationError;
/**
 * Type guard to check if error is an RpcError.
 *
 * @param e - Unknown error value to check
 * @returns True if error has RpcError structure (code, message)
 */
export declare function isRpcError(e: unknown): e is RpcError;
/**
 * Extract a safe error message from any error type.
 *
 * Handles:
 * - ApiError: returns message
 * - ValidationError: returns message
 * - Error: returns message
 * - Objects with message property: returns message
 * - Fallback: returns "Unknown error"
 *
 * @param e - Unknown error value
 * @returns Safe, non-empty error message string
 *
 * @example
 * const msg = getErrorMessage(err);
 * logger.error(msg);  // Always safe to use
 */
export declare function getErrorMessage(e: unknown): string;
/**
 * Extract error code from any error type.
 *
 * Handles:
 * - ApiError: returns code
 * - ValidationError: returns code
 * - RpcError: returns code
 * - Fallback: returns "UNKNOWN"
 *
 * @param e - Unknown error value
 * @returns Error code string for tracking/metrics
 *
 * @example
 * const code = getErrorCode(err);
 * metrics.increment(`error.${code}`);
 */
export declare function getErrorCode(e: unknown): string;
/**
 * Create a structured ApiError from various error types.
 *
 * Converts any error into a consistent ApiError structure suitable
 * for API responses and logging.
 *
 * @param input - Error value to convert
 * @param defaultStatus - Default HTTP status if not determinable (default: 500)
 * @param context - Additional context to include in error
 * @returns Structured ApiError
 *
 * @example
 * try {
 *   await risky();
 * } catch (err) {
 *   const apiErr = toApiError(err, 500, { operation: "create-market" });
 *   res.status(apiErr.status).json({ error: apiErr.message });
 * }
 */
export declare function toApiError(input: unknown, defaultStatus?: number, context?: Record<string, unknown>): ApiError;
/**
 * Create a structured ValidationError.
 *
 * @param code - Error code for this validation class
 * @param message - Main validation error message
 * @param fields - Optional field-level errors keyed by field name
 * @param context - Additional context
 * @returns ValidationError
 *
 * @example
 * throw createValidationError(
 *   "INVALID_AMOUNT",
 *   "Amount validation failed",
 *   { amount: "must be positive", decimals: "exceeds token precision" }
 * );
 */
export declare function createValidationError(code: string, message: string, fields?: Record<string, string>, context?: Record<string, unknown>): ValidationError;
