/**
 * Truncate error messages to a safe length for logs and API responses
 * Default: 120 chars for logs, 200 chars for API responses
 */
export declare function truncateErrorMessage(msg: unknown, maxLength?: number): string;
/**
 * Sanitize a string input by trimming, removing null bytes, and limiting length
 */
export declare function sanitizeString(input: string, maxLength?: number): string;
/**
 * Validate and sanitize a Solana base58 address (slab, mint, etc.)
 * Returns the address if valid, null otherwise
 */
export declare function sanitizeSlabAddress(input: string): string | null;
/**
 * Sanitize pagination parameters (limit and offset)
 * Returns safe clamped values
 */
export declare function sanitizePagination(limit?: unknown, offset?: unknown): {
    limit: number;
    offset: number;
};
/**
 * Sanitize a bigint value before converting to Number for DB insertion.
 *
 * Handles three failure modes:
 *  1. u64::MAX sentinel values (uninitialized on-chain fields) → returns `fallback`
 *  2. Values exceeding PostgreSQL bigint range (±2^63 − 1) → returns `fallback`
 *  3. Values exceeding Number.MAX_SAFE_INTEGER → returns `fallback` (precision loss)
 *
 * This prevents the "value X out of range for type bigint" Postgres errors
 * that occur when on-chain slab fields contain u64::MAX sentinels.
 */
export declare function sanitizeBigIntForDb(value: bigint, fallback?: number): number;
/**
 * Sanitize a bigint value to a string for DB text/numeric columns.
 * Same sentinel detection as sanitizeBigIntForDb, but preserves full precision
 * for fields stored as text (e.g. net_lp_pos, maintenance_fee_per_slot).
 */
export declare function sanitizeBigIntToString(value: bigint, fallback?: string): string;
/**
 * Sanitize a numeric parameter (price, amount, etc.)
 * Returns null if invalid
 */
export declare function sanitizeNumber(input: unknown, min?: number, max?: number): number | null;
/**
 * Mask API keys in URLs and connection strings before logging
 * Prevents accidental exposure of secrets in logs, error messages, and console output
 *
 * Handles patterns like:
 *  - https://devnet.helius-rpc.com/?api-key=YOUR_KEY
 *  - http://localhost:8899?api_key=SECRET
 *  - rpc_url=secret_key_here
 */
export declare function maskApiKeys(input: string): string;
