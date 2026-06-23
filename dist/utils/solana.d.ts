import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
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
    /**
     * #311: caller-provided compute unit limit (e.g. the keeper's CuEstimator result). When set,
     * it OVERRIDES the internal simulateForCU/default so the budget the caller gated on is the
     * budget actually broadcast. Undefined ⇒ derive internally.
     */
    computeUnitLimit?: number;
    /**
     * #311: caller-provided priority fee in micro-lamports (e.g. the keeper's tier-aware
     * HeliusPriorityFeeEstimator result). When set, it OVERRIDES getRecentPriorityFees.
     * Undefined ⇒ derive internally.
     */
    priorityFeeMicroLamports?: number;
    /**
     * #176: heap frame to request, in bytes. Defaults to 128 KB because the v17 wrapper installs
     * a 128 KB BumpAllocator and aborts (ProgramFailedToComplete) on every instruction without it.
     * Set 0 to omit (non-wrapper txs).
     */
    heapFrameBytes?: number;
}
/**
 * Default keeper send options: Optimized for fast, reliable crank iterations.
 *
 * All three optimizations enabled by default:
 *   - skipPreflight: Saves 20-50ms per transaction
 *   - multiRpcBroadcast: Improves landing rate to ~95%
 *   - simulateForCU: Validates compute units independently
 *
 * See KeeperSendOptions JSDoc for design rationale and safety guarantees.
 *
 * IMPORTANT: These defaults are ONLY safe for keeper transactions.
 * User transactions MUST use validateUserTransaction() + standard RPC.sendTx().
 */
/**
 * #176: the v17 wrapper installs a 128 KB BumpAllocator and makes its first heap allocation
 * near heap_base+128KB on EVERY instruction, so any tx touching the wrapper aborts on-chain
 * (ProgramFailedToComplete / "Access violation in heap section") unless it requests a 128 KB
 * heap frame. Keeper txs all hit the wrapper, so request it by default.
 */
export declare const WRAPPER_HEAP_FRAME_BYTES: number;
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
    /** #176: heap frame to request, in bytes (default 128 KB; 0 to omit). */
    heapFrameBytes?: number;
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
export declare function createJitoTipInstruction(payer: PublicKey, lamports?: number): TransactionInstruction;
