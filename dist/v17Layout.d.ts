/**
 * v17 on-chain layout constants for percolator-shared consumers.
 *
 * Values mirror ~/percolator-sdk src/solana/slab.ts v17 section (V17_* exports).
 * Keep in sync with that file — any update there must propagate here.
 *
 * Reference: ~/wrapper-engine-deep-audit/V17_SWEEP_RECONCILIATION_2026-06-08.md
 */
/**
 * v17 wrapper config block length in bytes.
 * Was 624 bytes in v16; shrunk to 432 in v17 (auth overhaul, CONFIG 624→432).
 */
export declare const WRAPPER_CONFIG_LEN = 432;
/**
 * v17 AssetOracleProfileV16 byte length.
 * Was 368 bytes in v16; grew to 400 in v17 (per-asset asset_admin + oracle fields).
 */
export declare const ASSET_ORACLE_PROFILE_V16_LEN = 400;
/**
 * v17 account header length (16 bytes).
 * Layout: magic[8] + version[2] + kind[1] + pad[1] + reserved[4]
 */
export declare const V17_HEADER_LEN = 16;
/**
 * Byte offset of the first market-group slot in a v17 market-group account.
 * = HEADER_LEN (16) + WRAPPER_CONFIG_LEN (432) = 448
 */
export declare const MARKET_GROUP_OFF: number;
/**
 * v17 account magic as a BigInt ("PERCV16\0" little-endian u64).
 * Stored at bytes [0..8] of every v17 percolator-owned account.
 */
export declare const V17_MAGIC = 5784119745589622272n;
/**
 * Expected u16 version field at offset 8 in v17 accounts.
 */
export declare const V17_EXPECTED_VERSION = 16;
