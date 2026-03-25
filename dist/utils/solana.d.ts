import { Connection, Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";
import { getPrimaryConnection, getFallbackConnection } from "./rpc-client.js";
export { getPrimaryConnection as getConnection, getFallbackConnection };
export declare function loadKeypair(raw: string): Keypair;
/**
 * BH11: Fetch recent priority fees from RPC to determine optimal priority fee.
 * BH6: Returns both priority fee and recommended compute units.
 * Falls back to defaults on error.
 */
export declare function getRecentPriorityFees(connection: Connection): Promise<{
    priorityFeeMicroLamports: number;
    computeUnitLimit: number;
}>;
/**
 * BH9: Check if transaction size exceeds Solana's limit (1232 bytes).
 * Throws error if oversized.
 */
export declare function checkTransactionSize(tx: Transaction): void;
/**
 * Poll getSignatureStatuses until confirmed or timeout.
 * More reliable than confirmTransaction which can falsely report expiry on devnet.
 */
export declare function pollSignatureStatus(connection: Connection, signature: string, timeoutMs?: number): Promise<void>;
export declare function sendWithRetry(connection: Connection, ix: TransactionInstruction, signers: Keypair[], maxRetries?: number): Promise<string>;
/**
 * sendWithRetryKeeper — multi-instruction transaction sender optimised for keeper services.
 *
 * Differences vs sendWithRetry:
 *   - Accepts a list of TransactionInstruction[] (multiple instructions per tx)
 *   - skipPreflight=true to save ~20-50 ms per attempt (keeper already validates pre-send)
 *   - Falls back to the secondary RPC on network errors for higher landing rate
 *
 * Used by CrankService and LiquidationService (PERC-204).
 *
 * @param connection   Primary Solana connection
 * @param ixs          Instructions to pack into one transaction
 * @param signers      Keypairs; signers[0] is the fee-payer
 * @param maxRetries   Number of retries (default 3)
 * @returns            Transaction signature string
 */
export declare function sendWithRetryKeeper(connection: Connection, ixs: TransactionInstruction[], signers: Keypair[], maxRetries?: number): Promise<string>;
