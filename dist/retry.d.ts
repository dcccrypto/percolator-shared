/**
 * retry.ts — Exponential backoff retry utility for resilient RPC/DB operations
 *
 * Includes 429-aware backoff: detects HTTP 429 / "Too Many Requests" responses,
 * respects Retry-After headers, and applies extended delays to avoid worsening
 * rate limiting. All other errors use standard exponential backoff with jitter.
 */
export interface RetryOptions {
    /** Maximum number of retry attempts (default: 3) */
    maxRetries?: number;
    /** Base delay in milliseconds (default: 1000) */
    baseDelayMs?: number;
    /** Maximum delay in milliseconds for normal errors (default: 30000) */
    maxDelayMs?: number;
    /** Minimum delay in milliseconds for 429 responses (default: 1000) */
    rateLimit429MinDelayMs?: number;
    /** Maximum delay in milliseconds for 429 responses (default: 30000) */
    rateLimit429MaxDelayMs?: number;
    /** Label for logging (default: "operation") */
    label?: string;
}
/**
 * Extract Retry-After delay from an error, if present.
 *
 * Handles:
 * - Errors whose message contains `Retry-After: <seconds>` (e.g. from fetch responses)
 * - Errors with a numeric `retryAfter` property (seconds)
 * - Errors with a numeric `retryAfterMs` property (milliseconds)
 *
 * @returns delay in milliseconds, or null if not detectable
 */
export declare function extractRetryAfterMs(error: unknown): number | null;
/**
 * Detect whether an error is an HTTP 429 / rate-limit response.
 *
 * Matches:
 * - Error messages containing "429", "too many requests", or "rate limit"
 * - Objects with a numeric `status` or `statusCode` of 429
 * - Objects with a `code` of 429
 */
export declare function is429Error(error: unknown): boolean;
/**
 * Retry a function with exponential backoff and jitter.
 *
 * For 429 responses:
 *   - Respects `Retry-After` header if extractable from the error
 *   - Falls back to exponential backoff clamped to [rateLimit429MinDelayMs, rateLimit429MaxDelayMs]
 *   - Logs a distinct warning to surface rate-limit issues
 *
 * For all other errors:
 *   - Delay formula: min(baseDelay * 2^attempt + jitter, maxDelay)
 *   - Jitter: random value between 0 and baseDelay to avoid thundering herd
 *
 * @param fn - Async function to retry
 * @param opts - Retry configuration options
 * @returns Result of successful function execution
 * @throws Last error if all retries exhausted
 */
export declare function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T>;
