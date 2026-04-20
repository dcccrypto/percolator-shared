import { Connection, Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";
import { getPrimaryConnection, getFallbackConnection } from "./rpc-client.js";
export { getPrimaryConnection as getConnection, getFallbackConnection };
/**
 * Keeper-mode transaction sending options with optimized defaults for fast cranking.
 *
 * The oracle keeper uses intentionally aggressive settings to maximize crank iteration
 * speed while maintaining correctness guarantees:
 *
 * **skipPreflight=true:** Skips RPC-side preflight simulation (~20-50ms saved per tx)
 *   - SAFE because: simulateForCU=true independently validates compute units
 *   - SAFE because: multiRpcBroadcast mitigates failure via redundancy
 *   - SAFE because: High-frequency crank detection catches errors
 *   - NOT safe for: User-submitted transactions (use standard RPC.sendTx instead)
 *
 * **multiRpcBroadcast=true:** Sends to multiple RPCs in parallel
 *   - Improves landing rates from ~80% to ~95%
 *   - Increases resilience to individual RPC failures
 *   - Keeper process is already high-frequency, extra broadcasting cost minimal
 *
 * **simulateForCU=true:** Pre-simulates to estimate exact compute units
 *   - Replaces full preflight validation
 *   - Catches compute unit exhaustion before sending
 *   - Failure in simulation = transaction would fail on-chain
 *
 * CRITICAL: These settings MUST NOT be used for user-submitted transactions.
 * User transactions require full preflight validation (see validateUserTransaction).
 *
 * Design Rationale:
 *   - Keepers crank 100+ times per second on localnet
 *   - Each 20-50ms saved = 2-5% faster iterations
 *   - On mainnet: Critical for competitive liquidation detection
 *   - On devnet: Enables rapid testing and market simulation
 *
 * References:
 *   - PERC-204: Keeper-mode optimization tradeoffs
 *   - BH6: Compute unit estimation strategy
 *   - BH11: Dynamic priority fee selection
 *
 * @see validateUserTransaction() for user-submission safety requirements
 * @see sendKeeperTransaction() for usage pattern
 */
export interface KeeperSendOptions {
    /** Skip RPC-side simulation before forwarding (saves ~20-50ms). Default: true for keeper mode. */
    skipPreflight?: boolean;
    /** Send to multiple RPC endpoints in parallel for higher landing rate. Default: true. */
    multiRpcBroadcast?: boolean;
    /** Simulate tx to get tight CU limit instead of using default 400k. Default: true. */
    simulateForCU?: boolean;
}
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
 * Send a transaction with keeper-mode optimizations:
 * - skipPreflight=true (saves ~20-50ms per tx)
 * - Multi-RPC parallel broadcast (+20-40% landing rate)
 * - Simulation-based tight CU limit (better queue position)
 * - Dynamic 75th-percentile priority fees
 */
export declare function sendWithRetryKeeper(connection: Connection, instructions: TransactionInstruction[], signers: Keypair[], maxRetries?: number, keeperOpts?: KeeperSendOptions): Promise<string>;
/**
 * Get priority fee estimate from Helius API (program-specific, more accurate than getRecentPrioritizationFees).
 * Falls back to 10,000 microLamports if Helius API unavailable.
 */
export declare function getHeliusPriorityFee(rpcUrl: string, accountKeys: string[], level?: "Min" | "Low" | "Medium" | "High" | "VeryHigh"): Promise<number>;
/**
 * Send a serialized transaction via Helius Sender API.
 * Dual-routes to validators + Jito for maximum landing probability.
 * Returns the transaction signature.
 *
 * Requirements: transaction MUST include a Jito tip instruction.
 */
export declare function sendViaHeliusSender(rpcUrl: string, rawTx: Buffer | Uint8Array): Promise<string>;
export interface SenderSendOptions {
    priorityLevel?: "Min" | "Low" | "Medium" | "High" | "VeryHigh";
    tipLamports?: number;
    computeUnitLimit?: number;
}
/**
 * Send a keeper transaction via Helius Sender API.
 * Composes: priority fee estimate + ComputeBudget + Jito tip + instructions + sign + send + poll.
 *
 * Requires connection.rpcEndpoint to be a Helius mainnet URL with api-key query param.
 */
export declare function sendKeeperTxViaSender(connection: Connection, instructions: TransactionInstruction[], signers: Keypair[], opts?: SenderSendOptions): Promise<string>;
/**
 * Pick a random Jito tip account.
 */
export declare function randomJitoTipAccount(): string;
/**
 * Create a Jito tip instruction (SOL transfer to tip account).
 * Default: 200,000 lamports (0.0002 SOL) — minimum for Helius Sender dual-routing.
 */
export declare function createJitoTipInstruction(payer: import("@solana/web3.js").PublicKey, lamports?: number): TransactionInstruction;
