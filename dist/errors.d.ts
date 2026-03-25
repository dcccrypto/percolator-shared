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
export declare function isApiError(e: unknown): e is ApiError;
export declare function isValidationError(e: unknown): e is ValidationError;
export declare function isRpcError(e: unknown): e is RpcError;
/**
 * Extract a safe error message from any error type.
 * Always returns a non-empty string — safe to log or send to Discord alerts.
 */
export declare function getErrorMessage(e: unknown): string;
export declare function getErrorCode(e: unknown): string;
export declare function toApiError(input: unknown, defaultStatus?: number, context?: Record<string, unknown>): ApiError;
export declare function createValidationError(code: string, message: string, fields?: Record<string, string>, context?: Record<string, unknown>): ValidationError;
