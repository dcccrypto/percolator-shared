import { Connection } from "@solana/web3.js";
/** Expose fallback stats for health endpoints */
export declare function getRpcFallbackStats(): {
    primaryFailCount: number;
    fallbackSuccessCount: number;
    fallbackFailCount: number;
};
export declare function acquireToken(): Promise<void>;
export declare function getPrimaryConnection(): Connection;
export declare function getFallbackConnection(): Connection;
export declare function getCachedAccountInfo(key: string): unknown | undefined;
export declare function setCachedAccountInfo(key: string, data: unknown): void;
export declare function backoffMs(attempt: number, baseMs?: number, maxMs?: number): number;
export declare function rateLimitedCall<T>(fn: (conn: Connection) => Promise<T>, options?: {
    readOnly?: boolean;
    maxRetries?: number;
}): Promise<T>;
