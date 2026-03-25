import { Keypair, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import bs58 from "bs58";
import { acquireToken, getPrimaryConnection, getFallbackConnection, backoffMs } from "./rpc-client.js";
import { createLogger } from "../logger.js";
export { getPrimaryConnection as getConnection, getFallbackConnection };
const logger = createLogger("rpc:send");
// BH9: Maximum transaction size in bytes (Solana limit is 1232 bytes)
const MAX_TRANSACTION_SIZE = 1232;
export function loadKeypair(raw) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
        const arr = JSON.parse(trimmed);
        return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    return Keypair.fromSecretKey(bs58.decode(trimmed));
}
/**
 * BH11: Fetch recent priority fees from RPC to determine optimal priority fee.
 * BH6: Returns both priority fee and recommended compute units.
 * Falls back to defaults on error.
 */
export async function getRecentPriorityFees(connection) {
    try {
        await acquireToken();
        // Get recent prioritization fees for the last 150 slots
        const recentFees = await connection.getRecentPrioritizationFees();
        if (recentFees.length === 0) {
            logger.warn("No recent priority fees found, using defaults");
            return { priorityFeeMicroLamports: 10_000, computeUnitLimit: 400_000 };
        }
        // Use 75th percentile to balance between cost and reliability
        const sorted = recentFees
            .map(f => f.prioritizationFee)
            .sort((a, b) => a - b);
        const p75Index = Math.floor(sorted.length * 0.75);
        const priorityFee = sorted[p75Index] || 10_000;
        // Ensure minimum fee during congestion
        const finalFee = Math.max(priorityFee, 1_000);
        // Default compute units (can be adjusted based on instruction complexity)
        const computeUnitLimit = 400_000;
        return { priorityFeeMicroLamports: finalFee, computeUnitLimit };
    }
    catch (err) {
        logger.warn("Failed to fetch priority fees, using defaults", { error: err instanceof Error ? err.message : String(err) });
        return { priorityFeeMicroLamports: 10_000, computeUnitLimit: 400_000 };
    }
}
/**
 * BH9: Check if transaction size exceeds Solana's limit (1232 bytes).
 * Throws error if oversized.
 */
export function checkTransactionSize(tx) {
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    if (serialized.length > MAX_TRANSACTION_SIZE) {
        throw new Error(`Transaction size ${serialized.length} bytes exceeds maximum ${MAX_TRANSACTION_SIZE} bytes`);
    }
}
function is429(err) {
    if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        return msg.includes("429") || msg.includes("too many requests") || msg.includes("rate limit");
    }
    return false;
}
/**
 * Poll getSignatureStatuses until confirmed or timeout.
 * More reliable than confirmTransaction which can falsely report expiry on devnet.
 */
export async function pollSignatureStatus(connection, signature, timeoutMs = 60_000) {
    // Validate signature format before polling to avoid wasting RPC calls
    const base58SigRegex = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
    if (!base58SigRegex.test(signature)) {
        throw new Error(`Invalid signature format: ${signature}`);
    }
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await acquireToken();
        const resp = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
        const status = resp.value[0];
        if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
            if (status.err)
                throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
            return;
        }
        await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Transaction ${signature} not confirmed after ${timeoutMs}ms`);
}
export async function sendWithRetry(connection, ix, signers, maxRetries = 3) {
    let lastErr;
    // BH6 + BH11: Get dynamic priority fees once (outside retry loop)
    const { priorityFeeMicroLamports, computeUnitLimit } = await getRecentPriorityFees(connection);
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await acquireToken();
            const tx = new Transaction();
            // BH6 + BH11: Add compute budget instructions
            tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports }));
            tx.add(ix);
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
            tx.recentBlockhash = blockhash;
            tx.feePayer = signers[0].publicKey;
            tx.sign(...signers);
            // BH9: Check transaction size before sending
            checkTransactionSize(tx);
            const opts = { skipPreflight: false, preflightCommitment: "confirmed" };
            await acquireToken();
            const sig = await connection.sendRawTransaction(tx.serialize(), opts);
            // Use getSignatureStatuses polling instead of confirmTransaction
            // (confirmTransaction can falsely report "block height exceeded" on devnet)
            await pollSignatureStatus(connection, sig);
            return sig;
        }
        catch (err) {
            lastErr = err;
            const delay = is429(err)
                ? backoffMs(attempt, 2000, 30_000)
                : Math.min(1000 * 2 ** attempt, 8000);
            // PERC-213: Structured log visible in Railway dashboard
            logger.warn("sendWithRetry attempt failed", {
                attempt: attempt + 1,
                maxRetries,
                delayMs: Math.round(delay),
                error: lastErr instanceof Error ? lastErr.message.slice(0, 120) : String(lastErr).slice(0, 120),
                is429: is429(lastErr),
            });
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw lastErr;
}
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
export async function sendWithRetryKeeper(connection, ixs, signers, maxRetries = 3) {
    let lastErr;
    // Fetch priority fees once outside the retry loop
    const { priorityFeeMicroLamports, computeUnitLimit } = await getRecentPriorityFees(connection);
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        // On retries after a network error, try fallback RPC
        const conn = attempt === 0 ? connection : getFallbackConnection();
        try {
            await acquireToken();
            const tx = new Transaction();
            // Compute budget first (improves queue priority)
            tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports }));
            for (const ix of ixs) {
                tx.add(ix);
            }
            const { blockhash } = await conn.getLatestBlockhash("confirmed");
            tx.recentBlockhash = blockhash;
            tx.feePayer = signers[0].publicKey;
            tx.sign(...signers);
            // Validate size before sending
            checkTransactionSize(tx);
            await acquireToken();
            const sig = await conn.sendRawTransaction(tx.serialize(), {
                skipPreflight: true, // Keeper validates pre-send; skip for speed
                preflightCommitment: "confirmed",
            });
            await pollSignatureStatus(conn, sig);
            return sig;
        }
        catch (err) {
            lastErr = err;
            const delay = is429(err)
                ? backoffMs(attempt, 2000, 30_000)
                : Math.min(1000 * 2 ** attempt, 8000);
            logger.warn("sendWithRetryKeeper attempt failed", {
                attempt: attempt + 1,
                maxRetries,
                delayMs: Math.round(delay),
                error: lastErr instanceof Error ? lastErr.message.slice(0, 120) : String(lastErr).slice(0, 120),
                is429: is429(lastErr),
            });
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw lastErr;
}
