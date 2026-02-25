/**
 * Input sanitization utilities for API security
 */
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
 * Sanitize a numeric parameter (price, amount, etc.)
 * Returns null if invalid
 */
export declare function sanitizeNumber(input: unknown, min?: number, max?: number): number | null;
