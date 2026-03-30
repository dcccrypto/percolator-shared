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
export function extractRetryAfterMs(error: unknown): number | null {
  if (error == null || typeof error !== "object") return null;

  // Check retryAfterMs first (already in ms)
  const retryAfterMs = (error as Record<string, unknown>).retryAfterMs;
  if (typeof retryAfterMs === "number" && retryAfterMs > 0) {
    return retryAfterMs;
  }

  // Check retryAfter (seconds)
  const retryAfter = (error as Record<string, unknown>).retryAfter;
  if (typeof retryAfter === "number" && retryAfter > 0) {
    return retryAfter * 1000;
  }

  // Parse from error message: "Retry-After: 5" or "retry-after: 5"
  if (error instanceof Error) {
    const match = error.message.match(/retry-after:\s*(\d+)/i);
    if (match) {
      const seconds = parseInt(match[1]!, 10);
      if (!isNaN(seconds) && seconds > 0) {
        return seconds * 1000;
      }
    }
  }

  return null;
}

/**
 * Detect whether an error is an HTTP 429 / rate-limit response.
 *
 * Matches:
 * - Error messages containing "429", "too many requests", or "rate limit"
 * - Objects with a numeric `status` or `statusCode` of 429
 * - Objects with a `code` of 429
 */
export function is429Error(error: unknown): boolean {
  if (error == null) return false;

  // Check numeric status fields
  if (typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (e.status === 429 || e.statusCode === 429 || e.code === 429) return true;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("429") ||
      msg.includes("too many requests") ||
      msg.includes("rate limit") ||
      msg.includes("rate-limit")
    );
  }

  if (typeof error === "string") {
    const lower = error.toLowerCase();
    return (
      lower.includes("429") ||
      lower.includes("too many requests") ||
      lower.includes("rate limit") ||
      lower.includes("rate-limit")
    );
  }

  return false;
}

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
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    rateLimit429MinDelayMs = 1000,
    rateLimit429MaxDelayMs = 30000,
    label = "operation",
  } = opts;

  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (is429Error(error)) {
        // 429: respect Retry-After if present, otherwise exponential with 429-specific bounds
        const retryAfterMs = extractRetryAfterMs(error);
        let delay: number;

        if (retryAfterMs !== null) {
          // Honour server-provided Retry-After, but still clamp to our max
          delay = Math.min(retryAfterMs, rateLimit429MaxDelayMs);
          console.warn(
            `[Retry] ${label} rate-limited (429) on attempt ${attempt + 1}/${maxRetries + 1}: ${errorMessage}. ` +
              `Honouring Retry-After ${retryAfterMs}ms → waiting ${Math.round(delay)}ms...`
          );
        } else {
          // Exponential backoff clamped to [min, max] for 429
          const exponentialDelay = rateLimit429MinDelayMs * Math.pow(2, attempt);
          const jitter = Math.random() * rateLimit429MinDelayMs;
          delay = Math.min(
            Math.max(exponentialDelay + jitter, rateLimit429MinDelayMs),
            rateLimit429MaxDelayMs
          );
          console.warn(
            `[Retry] ${label} rate-limited (429) on attempt ${attempt + 1}/${maxRetries + 1}: ${errorMessage}. ` +
              `Backing off for ${Math.round(delay)}ms...`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Standard exponential backoff with jitter
        const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
        const jitter = Math.random() * baseDelayMs;
        const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

        console.warn(
          `[Retry] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}. ` +
            `Retrying in ${Math.round(delay)}ms...`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  const errorMessage =
    lastError instanceof Error ? lastError.message : String(lastError);
  console.error(
    `[Retry] ${label} failed after ${maxRetries + 1} attempts: ${errorMessage}`
  );
  throw lastError;
}
