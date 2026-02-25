/** Decode base58 string to Uint8Array */
export declare function decodeBase58(str: string): Uint8Array | null;
/** Read unsigned 128-bit little-endian integer */
export declare function readU128LE(bytes: Uint8Array): bigint;
/**
 * Parse signed i128 size from trade instruction data.
 * Returns { sizeValue, side } where sizeValue is the absolute value.
 */
export declare function parseTradeSize(sizeBytes: Uint8Array): {
    sizeValue: bigint;
    side: "long" | "short";
};
