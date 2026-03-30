import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry, is429Error, extractRetryAfterMs } from "../src/retry.js";

// ---------------------------------------------------------------------------
// is429Error
// ---------------------------------------------------------------------------
describe("is429Error", () => {
  it("matches error message containing '429'", () => {
    expect(is429Error(new Error("HTTP 429"))).toBe(true);
  });

  it("matches 'too many requests' (case-insensitive)", () => {
    expect(is429Error(new Error("Too Many Requests"))).toBe(true);
    expect(is429Error(new Error("too many requests"))).toBe(true);
  });

  it("matches 'rate limit' in message", () => {
    expect(is429Error(new Error("rate limit exceeded"))).toBe(true);
    expect(is429Error(new Error("Rate-limit hit"))).toBe(true);
  });

  it("matches object with status 429", () => {
    expect(is429Error({ status: 429, message: "rate limited" })).toBe(true);
  });

  it("matches object with statusCode 429", () => {
    expect(is429Error({ statusCode: 429, message: "rate limited" })).toBe(true);
  });

  it("matches string containing '429'", () => {
    expect(is429Error("HTTP 429 Too Many Requests")).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(is429Error(new Error("Connection refused"))).toBe(false);
    expect(is429Error(new Error("500 Internal Server Error"))).toBe(false);
    expect(is429Error(null)).toBe(false);
    expect(is429Error(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractRetryAfterMs
// ---------------------------------------------------------------------------
describe("extractRetryAfterMs", () => {
  it("extracts from retryAfterMs property (milliseconds)", () => {
    expect(extractRetryAfterMs({ retryAfterMs: 5000 })).toBe(5000);
  });

  it("extracts from retryAfter property (seconds → ms)", () => {
    expect(extractRetryAfterMs({ retryAfter: 10 })).toBe(10000);
  });

  it("extracts from error message 'Retry-After: 3'", () => {
    expect(extractRetryAfterMs(new Error("HTTP 429 Retry-After: 3"))).toBe(3000);
  });

  it("is case-insensitive for Retry-After header in message", () => {
    expect(extractRetryAfterMs(new Error("retry-after: 7"))).toBe(7000);
  });

  it("returns null for null/undefined", () => {
    expect(extractRetryAfterMs(null)).toBeNull();
    expect(extractRetryAfterMs(undefined)).toBeNull();
  });

  it("returns null when no retry-after info present", () => {
    expect(extractRetryAfterMs(new Error("generic error"))).toBeNull();
    expect(extractRetryAfterMs({ status: 500 })).toBeNull();
  });

  it("returns null for zero/negative retryAfter", () => {
    expect(extractRetryAfterMs({ retryAfter: 0 })).toBeNull();
    expect(extractRetryAfterMs({ retryAfter: -1 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// withRetry — base behaviour (unchanged)
// ---------------------------------------------------------------------------
describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should succeed on first try", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await withRetry(fn);

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("should retry on failure and eventually succeed", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Attempt 1 failed"))
      .mockRejectedValueOnce(new Error("Attempt 2 failed"))
      .mockResolvedValue("success");

    const promise = withRetry(fn, { maxRetries: 3 });

    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it("should respect maxRetries limit", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Always fails"));

    const promise = withRetry(fn, { maxRetries: 2 }).catch((e) => e);

    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("Always fails");
    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("failed after 3 attempts")
    );
  });

  it("should use exponential backoff timing", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Fail"));
    const baseDelayMs = 100;

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs }).catch(
      (e) => e
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(300);
    expect(fn).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(500);
    expect(fn).toHaveBeenCalledTimes(4);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
  });

  it("should cap delay at maxDelayMs", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Fail"));
    const baseDelayMs = 1000;
    const maxDelayMs = 2000;

    const promise = withRetry(fn, {
      maxRetries: 5,
      baseDelayMs,
      maxDelayMs,
    }).catch((e) => e);

    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result).toBeInstanceOf(Error);
    expect(fn).toHaveBeenCalledTimes(6);
  });

  it("should add jitter to delays", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Fail"));
    const baseDelayMs = 1000;

    const originalRandom = Math.random;
    Math.random = vi.fn().mockReturnValue(0.5);

    const promise = withRetry(fn, { maxRetries: 1, baseDelayMs }).catch(
      (e) => e
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // baseDelay * 2^0 + 0.5 * baseDelay = 1000 + 500 = 1500ms
    await vi.advanceTimersByTimeAsync(1500);
    expect(fn).toHaveBeenCalledTimes(2);

    Math.random = originalRandom;

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
  });

  it("should throw last error after all retries exhausted", async () => {
    const finalError = new Error("Final error");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Error 1"))
      .mockRejectedValueOnce(new Error("Error 2"))
      .mockRejectedValue(finalError);

    const promise = withRetry(fn, { maxRetries: 2 }).catch((e) => e);

    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result).toBe(finalError);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Final error")
    );
  });

  it("should pass through the label in logs", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Test error"));
    const label = "fetchMarketData";

    const promise = withRetry(fn, { maxRetries: 1, label }).catch((e) => e);

    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result).toBeInstanceOf(Error);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(label)
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(label)
    );
  });

  it("should use default options when none provided", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Fail"));

    const promise = withRetry(fn).catch((e) => e);

    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result).toBeInstanceOf(Error);

    // Default maxRetries = 3 → 4 total calls
    expect(fn).toHaveBeenCalledTimes(4);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("operation")
    );
  });

  it("should handle non-Error rejections", async () => {
    const fn = vi.fn().mockRejectedValue("string error");

    const promise = withRetry(fn, { maxRetries: 1 }).catch((e) => e);

    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result).toBe("string error");

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("string error")
    );
  });

  // ---------------------------------------------------------------------------
  // 429-aware backoff tests
  // ---------------------------------------------------------------------------

  it("should apply extended backoff on 429 error (no Retry-After)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 429 Too Many Requests"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      maxRetries: 2,
      rateLimit429MinDelayMs: 500,
      rateLimit429MaxDelayMs: 10000,
    });

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("rate-limited (429)")
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Backing off for")
    );
  });

  it("should honour Retry-After header when present in error message", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("HTTP 429 Too Many Requests, Retry-After: 5")
      )
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      maxRetries: 2,
      rateLimit429MinDelayMs: 500,
      rateLimit429MaxDelayMs: 30000,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Retry-After: 5 → 5000ms
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result).toBe("ok");

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Honouring Retry-After 5000ms")
    );
  });

  it("should honour retryAfter property (seconds) on error object", async () => {
    const rateLimitErr = Object.assign(
      new Error("HTTP 429 rate limited"),
      { retryAfter: 3 }
    );

    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      maxRetries: 2,
      rateLimit429MaxDelayMs: 30000,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(fn).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result).toBe("ok");
  });

  it("should clamp Retry-After to rateLimit429MaxDelayMs", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("HTTP 429 Retry-After: 120")
      )
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      maxRetries: 2,
      rateLimit429MaxDelayMs: 10000, // cap at 10s even if server says 120s
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10000);
    expect(fn).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result).toBe("ok");
  });

  it("should exhaust retries on persistent 429s and throw", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("HTTP 429 Too Many Requests"));

    const promise = withRetry(fn, {
      maxRetries: 2,
      rateLimit429MinDelayMs: 100,
      rateLimit429MaxDelayMs: 500,
    }).catch((e) => e);

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("failed after 3 attempts")
    );
  });

  it("should use separate 429 delay path vs normal error path", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 429 rate limit"))
      .mockRejectedValueOnce(new Error("generic error"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 100,
      rateLimit429MinDelayMs: 500,
      rateLimit429MaxDelayMs: 5000,
    });

    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);

    const warnCalls = (console.warn as ReturnType<typeof vi.fn>).mock.calls;
    expect(warnCalls.some((c) => c[0].includes("rate-limited (429)"))).toBe(true);
    expect(warnCalls.some((c) => !c[0].includes("rate-limited"))).toBe(true);
  });
});
