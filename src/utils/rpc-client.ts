import { Connection } from "@solana/web3.js";
import { config } from "../config.js";
import { createLogger } from "../logger.js";

const logger = createLogger("rpc");

const MAX_TOKENS = 10;
const REFILL_INTERVAL_MS = 1_000;
let tokens = MAX_TOKENS;
let lastRefill = Date.now();

// BM3: Sliding window rate limiter to prevent burst DoS
const SLIDING_WINDOW_MS = 10_000; // 10 second window
const MAX_REQUESTS_PER_WINDOW = 100; // Max 100 requests per 10s
const requestTimestamps: number[] = [];

// PERC-213: Fallback usage counters for Railway monitoring
let _primaryFailCount = 0;
let _fallbackSuccessCount = 0;
let _fallbackFailCount = 0;

/** Expose fallback stats for health endpoints */
export function getRpcFallbackStats() {
  return {
    primaryFailCount: _primaryFailCount,
    fallbackSuccessCount: _fallbackSuccessCount,
    fallbackFailCount: _fallbackFailCount,
  };
}

function checkSlidingWindow(): boolean {
  const now = Date.now();
  const windowStart = now - SLIDING_WINDOW_MS;
  
  // Remove old timestamps outside the window
  while (requestTimestamps.length > 0 && requestTimestamps[0]! < windowStart) {
    requestTimestamps.shift();
  }
  
  // Check if we're within burst limit
  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return false; // Rate limit exceeded
  }
  
  requestTimestamps.push(now);
  return true;
}

function refillTokens(): void {
  const now = Date.now();
  const elapsed = now - lastRefill;
  if (elapsed >= REFILL_INTERVAL_MS) {
    const refills = Math.floor(elapsed / REFILL_INTERVAL_MS);
    tokens = Math.min(MAX_TOKENS, tokens + refills * MAX_TOKENS);
    lastRefill += refills * REFILL_INTERVAL_MS;
  }
}

const waitQueue: Array<() => void> = [];

function drainQueue(): void {
  refillTokens();
  while (waitQueue.length > 0 && tokens > 0 && checkSlidingWindow()) {
    tokens--;
    const resolve = waitQueue.shift()!;
    resolve();
  }
}

setInterval(drainQueue, 100);

export async function acquireToken(): Promise<void> {
  refillTokens();
  if (tokens > 0 && checkSlidingWindow()) { tokens--; return; }
  return new Promise<void>((resolve) => { waitQueue.push(resolve); });
}

let _primaryConnection: Connection | null = null;
let _fallbackConnection: Connection | null = null;

export function getPrimaryConnection(): Connection {
  if (!_primaryConnection) _primaryConnection = new Connection(config.rpcUrl, "confirmed");
  return _primaryConnection;
}

export function getFallbackConnection(): Connection {
  if (!_fallbackConnection) _fallbackConnection = new Connection(config.fallbackRpcUrl, "confirmed");
  return _fallbackConnection;
}

interface CacheEntry { data: unknown; fetchedAt: number; }
const accountCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5_000;
const MAX_CACHE_SIZE = 500;

export function getCachedAccountInfo(key: string): unknown | undefined {
  const entry = accountCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) { accountCache.delete(key); return undefined; }
  return entry.data;
}

export function setCachedAccountInfo(key: string, data: unknown): void {
  accountCache.set(key, { data, fetchedAt: Date.now() });
  // Evict oldest entries when cache exceeds max size
  if (accountCache.size > MAX_CACHE_SIZE) {
    const entriesToEvict = accountCache.size - MAX_CACHE_SIZE;
    let evicted = 0;
    for (const [k] of accountCache) {
      if (evicted >= entriesToEvict) break;
      accountCache.delete(k);
      evicted++;
    }
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of accountCache) {
    if (now - entry.fetchedAt > CACHE_TTL_MS) accountCache.delete(key);
  }
}, 30_000);

export function backoffMs(attempt: number, baseMs = 1000, maxMs = 30_000): number {
  return Math.min(baseMs * 2 ** attempt + Math.random() * 500, maxMs);
}

function is429(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("429") || msg.includes("too many requests") || msg.includes("rate limit");
  }
  return false;
}

export async function rateLimitedCall<T>(
  fn: (conn: Connection) => Promise<T>,
  options?: { readOnly?: boolean; maxRetries?: number },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const readOnly = options?.readOnly ?? false;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    await acquireToken();
    try {
      return await fn(getPrimaryConnection());
    } catch (err) {
      if (is429(err) && readOnly) {
        // PERC-213: Log RPC fallback trigger so it's visible in Railway dashboard
        _primaryFailCount++;
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.warn("Primary RPC rate-limited, falling back to secondary RPC", {
          primaryFailCount: _primaryFailCount,
          attempt: attempt + 1,
          error: errMsg.slice(0, 120),
          primaryUrl: config.rpcUrl.replace(/\/\/[^/]+/, "//***"),
          fallbackUrl: config.fallbackRpcUrl.replace(/\/\/[^/]+/, "//***"),
        });
        try {
          const result = await fn(getFallbackConnection());
          _fallbackSuccessCount++;
          logger.info("Fallback RPC succeeded", {
            fallbackSuccessCount: _fallbackSuccessCount,
          });
          return result;
        } catch (fe) {
          _fallbackFailCount++;
          const fallbackErrMsg = fe instanceof Error ? fe.message : String(fe);
          logger.error("Fallback RPC also failed", {
            fallbackFailCount: _fallbackFailCount,
            error: fallbackErrMsg.slice(0, 120),
          });
        }
      }
      if (attempt < maxRetries - 1) {
        const delay = backoffMs(attempt);
        await new Promise((r) => setTimeout(r, delay));
      } else { throw err; }
    }
  }
  throw new Error("rateLimitedCall: unreachable");
}
