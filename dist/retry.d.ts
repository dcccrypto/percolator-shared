/**
 * retry.ts — Exponential backoff retry utility for resilient RPC/DB operations
 */
export interface RetryOptions {
    /** Maximum number of retry attempts (default: 3) */
    maxRetries?: number;
    /** Base delay in milliseconds (default: 1000) */
    baseDelayMs?: number;
    /** Maximum delay in milliseconds (default: 30000) */
    maxDelayMs?: number;
    /** Label for logging (default: "operation") */
    label?: string;
}
/**
 * Retry a function with exponential backoff and jitter.
 *
 * Delay formula: min(baseDelay * 2^attempt + jitter, maxDelay)
 * Jitter: random value between 0 and baseDelay to avoid thundering herd
 *
 * @param fn - Async function to retry
 * @param opts - Retry configuration options
 * @returns Result of successful function execution
 * @throws Last error if all retries exhausted
 */
export declare function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T>;
