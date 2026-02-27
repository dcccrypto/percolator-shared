import { SupabaseClient } from "@supabase/supabase-js";
/** Acquire a DB concurrency slot. Waits if at capacity. */
export declare function acquireDbSlot(): Promise<void>;
/** Release a DB concurrency slot and drain the queue. */
export declare function releaseDbSlot(): void;
/** Wrap a Supabase operation with concurrency control. */
export declare function withDb<T>(fn: () => Promise<T>): Promise<T>;
/** Expose DB connection stats for health endpoints. */
export declare function getDbStats(): {
    activeRequests: number;
    queuedRequests: number;
    peakConcurrency: number;
    queueWaitCount: number;
    maxConcurrency: number;
};
export declare function getSupabase(): SupabaseClient;
