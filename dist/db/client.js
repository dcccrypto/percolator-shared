import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { createLogger } from "../logger.js";
const logger = createLogger("db");
let _client = null;
// PERC-213: DB request concurrency limiter to prevent "too many connections" under load.
// Supabase JS uses PostgREST HTTP — each concurrent request maps to a DB connection.
// Limiting concurrent in-flight requests caps the connection count per service instance.
const MAX_CONCURRENT_DB_REQUESTS = Number(process.env.DB_MAX_CONCURRENCY ?? 20);
let _activeRequests = 0;
let _queuedRequests = 0;
const _waitQueue = [];
let _peakConcurrency = 0;
let _queueWaitCount = 0;
/** Acquire a DB concurrency slot. Waits if at capacity. */
export async function acquireDbSlot() {
    if (_activeRequests < MAX_CONCURRENT_DB_REQUESTS) {
        _activeRequests++;
        if (_activeRequests > _peakConcurrency) {
            _peakConcurrency = _activeRequests;
        }
        return;
    }
    // Capacity reached — queue and wait
    _queuedRequests++;
    _queueWaitCount++;
    if (_queuedRequests % 5 === 1) {
        // Log every 5 queued requests to surface pressure in Railway logs
        logger.warn("DB concurrency limit reached, request queued", {
            activeRequests: _activeRequests,
            queuedRequests: _queuedRequests,
            maxConcurrency: MAX_CONCURRENT_DB_REQUESTS,
        });
    }
    return new Promise((resolve) => {
        _waitQueue.push(() => {
            _queuedRequests--;
            _activeRequests++;
            resolve();
        });
    });
}
/** Release a DB concurrency slot and drain the queue. */
export function releaseDbSlot() {
    _activeRequests--;
    if (_waitQueue.length > 0) {
        const next = _waitQueue.shift();
        next();
    }
}
/** Wrap a Supabase operation with concurrency control. */
export async function withDb(fn) {
    await acquireDbSlot();
    try {
        return await fn();
    }
    finally {
        releaseDbSlot();
    }
}
/** Expose DB connection stats for health endpoints. */
export function getDbStats() {
    return {
        activeRequests: _activeRequests,
        queuedRequests: _queuedRequests,
        peakConcurrency: _peakConcurrency,
        queueWaitCount: _queueWaitCount,
        maxConcurrency: MAX_CONCURRENT_DB_REQUESTS,
    };
}
export function getSupabase() {
    if (!_client) {
        if (!config.supabaseUrl || !config.supabaseKey) {
            throw new Error("SUPABASE_URL and SUPABASE_KEY must be set");
        }
        _client = createClient(config.supabaseUrl, config.supabaseKey, {
            db: {
                schema: "public",
            },
            global: {
                headers: {
                    "x-client-info": "@percolator/api",
                },
                // PERC-213: fetch options — connection keepAlive + 30s request timeout
                fetch: (url, options) => {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 30_000);
                    return fetch(url, {
                        ...options,
                        signal: controller.signal,
                        // @ts-ignore — Node.js fetch supports keepAlive
                        keepalive: true,
                    }).finally(() => clearTimeout(timeout));
                },
            },
            realtime: {
                params: {
                    eventsPerSecond: 10,
                },
            },
        });
        logger.info("Supabase client initialised", {
            url: config.supabaseUrl.replace(/\/\/[^.]+/, "//<project>"),
            maxConcurrency: MAX_CONCURRENT_DB_REQUESTS,
        });
    }
    return _client;
}
