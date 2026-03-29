import { Connection, Keypair, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import bs58 from "bs58";
import { acquireToken, getPrimaryConnection, getFallbackConnection, backoffMs } from "./rpc-client.js";
import { getErrorMessage } from "../errors.js";
export { getPrimaryConnection as getConnection, getFallbackConnection };
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
const DEFAULT_KEEPER_OPTS = {
    skipPreflight: true,
    multiRpcBroadcast: true,
    simulateForCU: true,
};
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
            console.warn("[getRecentPriorityFees] No recent fees found, using defaults");
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
        const msg = getErrorMessage(err);
        console.warn("[getRecentPriorityFees] Failed to fetch priority fees:", msg);
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
    // Check if it's an object with a code property (for structured errors)
    if (typeof err === "object" && err !== null && typeof err.code === "number") {
        return err.code === 429;
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
            console.warn(`[sendWithRetry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw lastErr;
}
// ---------------------------------------------------------------------------
// PERC-204: Simulate transaction to get tight compute unit limit
// ---------------------------------------------------------------------------
/**
 * Simulate a transaction to determine actual CU consumption, then set a tight
 * limit (actual + 10% buffer). This improves queue position under congestion
 * because effective fee-per-CU is higher with a tighter limit.
 *
 * Falls back to the default 400k if simulation fails.
 */
async function simulateForComputeUnits(connection, instructions, feePayer) {
    try {
        const simTx = new Transaction();
        // Use a generous CU limit for simulation
        simTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
        for (const ix of instructions)
            simTx.add(ix);
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        simTx.recentBlockhash = blockhash;
        simTx.feePayer = feePayer.publicKey;
        await acquireToken();
        const simResult = await connection.simulateTransaction(simTx);
        if (simResult.value.err) {
            // Simulation failed — use safe default
            return 400_000;
        }
        const unitsConsumed = simResult.value.unitsConsumed ?? 0;
        if (unitsConsumed === 0)
            return 400_000;
        // Add 10% buffer to actual consumption (minimum 50k for safety)
        return Math.max(Math.ceil(unitsConsumed * 1.1), 50_000);
    }
    catch {
        return 400_000;
    }
}
// ---------------------------------------------------------------------------
// PERC-204: Multi-RPC parallel broadcast
// ---------------------------------------------------------------------------
/**
 * Broadcast a signed raw transaction to multiple RPC endpoints simultaneously.
 * Returns the signature from the first endpoint that accepts it.
 * Duplicate transactions are de-duped by the Solana network (same signature).
 *
 * This increases landing rate by 20-40% because if one RPC has a degraded
 * path to the leader, another may succeed.
 */
async function broadcastToMultipleRpcs(rawTx, primaryConnection, opts) {
    const connections = [primaryConnection];
    // Add fallback connection as second broadcast target
    try {
        const fallback = getFallbackConnection();
        if (fallback)
            connections.push(fallback);
    }
    catch { /* no fallback configured */ }
    // Add additional RPC endpoints from environment
    const extraRpcs = process.env.EXTRA_RPC_URLS?.split(",").filter(Boolean) ?? [];
    for (const url of extraRpcs.slice(0, 3)) { // cap at 3 extra
        try {
            connections.push(new Connection(url, "confirmed"));
        }
        catch { /* invalid URL, skip */ }
    }
    if (connections.length <= 1) {
        // Only primary available — send normally
        return primaryConnection.sendRawTransaction(rawTx, opts);
    }
    // Fire-and-forget to all endpoints simultaneously
    const results = await Promise.allSettled(connections.map(conn => conn.sendRawTransaction(rawTx, opts)));
    // Return first successful signature
    for (const result of results) {
        if (result.status === "fulfilled")
            return result.value;
    }
    // All failed — throw the primary's error
    const primaryResult = results[0];
    if (primaryResult.status === "rejected")
        throw primaryResult.reason;
    throw new Error("All RPC endpoints failed to accept transaction");
}
/**
 * Send a transaction with keeper-mode optimizations:
 * - skipPreflight=true (saves ~20-50ms per tx)
 * - Multi-RPC parallel broadcast (+20-40% landing rate)
 * - Simulation-based tight CU limit (better queue position)
 * - Dynamic 75th-percentile priority fees
 */
export async function sendWithRetryKeeper(connection, instructions, signers, maxRetries = 3, keeperOpts) {
    const opts = { ...DEFAULT_KEEPER_OPTS, ...keeperOpts };
    let lastErr;
    const { priorityFeeMicroLamports } = await getRecentPriorityFees(connection);
    let computeUnitLimit = 400_000;
    if (opts.simulateForCU) {
        computeUnitLimit = await simulateForComputeUnits(connection, instructions, signers[0]);
    }
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await acquireToken();
            const tx = new Transaction();
            tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports }));
            for (const ix of instructions)
                tx.add(ix);
            const { blockhash } = await connection.getLatestBlockhash("confirmed");
            tx.recentBlockhash = blockhash;
            tx.feePayer = signers[0].publicKey;
            tx.sign(...signers);
            checkTransactionSize(tx);
            const sendOpts = {
                skipPreflight: opts.skipPreflight,
                preflightCommitment: "confirmed",
            };
            await acquireToken();
            let sig;
            if (opts.multiRpcBroadcast) {
                sig = await broadcastToMultipleRpcs(tx.serialize(), connection, sendOpts);
            }
            else {
                sig = await connection.sendRawTransaction(tx.serialize(), sendOpts);
            }
            await pollSignatureStatus(connection, sig);
            return sig;
        }
        catch (err) {
            lastErr = err;
            const delay = is429(err)
                ? backoffMs(attempt, 2000, 30_000)
                : Math.min(1000 * 2 ** attempt, 8000);
            console.warn(`[sendWithRetryKeeper] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw lastErr;
}
// ═════════════════════════════════════════════════════════════════════════════
// Helius-Optimized Transaction Sending (Sender API + Priority Fee Estimate)
// ═════════════════════════════════════════════════════════════════════════════
/** Jito tip accounts for Sender API transactions */
const JITO_TIP_ACCOUNTS = [
    "4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE",
    "D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ",
    "9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta",
    "5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn",
    "2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD",
];
/**
 * Get priority fee estimate from Helius API (program-specific, more accurate than getRecentPrioritizationFees).
 * Falls back to 10,000 microLamports if Helius API unavailable.
 */
export async function getHeliusPriorityFee(rpcUrl, accountKeys, level = "High") {
    try {
        const res = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "getPriorityFeeEstimate",
                params: [{ accountKeys, options: { priorityLevel: level } }],
            }),
        });
        const data = await res.json();
        if (data?.result?.priorityFeeEstimate) {
            return Math.max(Math.ceil(data.result.priorityFeeEstimate), 1_000);
        }
        return 10_000;
    }
    catch {
        return 10_000;
    }
}
/**
 * Send a serialized transaction via Helius Sender API.
 * Dual-routes to validators + Jito for maximum landing probability.
 * Returns the transaction signature.
 *
 * Requirements: transaction MUST include a Jito tip instruction.
 */
export async function sendViaHeliusSender(rpcUrl, rawTx) {
    // Extract the base URL and API key from the RPC URL
    const url = new URL(rpcUrl);
    const apiKey = url.searchParams.get("api-key") || "";
    const senderUrl = `https://sender.helius-rpc.com/fast?api-key=${apiKey}`;
    const res = await fetch(senderUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "sendTransaction",
            params: [
                Buffer.from(rawTx).toString("base64"),
                { encoding: "base64", skipPreflight: true, maxRetries: 0 },
            ],
        }),
    });
    const data = await res.json();
    if (data?.error) {
        throw new Error(`Helius Sender error: ${JSON.stringify(data.error)}`);
    }
    return data.result;
}
/**
 * Pick a random Jito tip account.
 */
export function randomJitoTipAccount() {
    return JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
}
/**
 * Create a Jito tip instruction (SOL transfer to tip account).
 * Default: 200,000 lamports (0.0002 SOL) — minimum for Helius Sender dual-routing.
 */
export function createJitoTipInstruction(payer, lamports = 200_000) {
    const tipAccount = new (require("@solana/web3.js").PublicKey)(randomJitoTipAccount());
    return require("@solana/web3.js").SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: tipAccount,
        lamports,
    });
}
