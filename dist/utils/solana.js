import { Connection, Keypair, PublicKey, SystemProgram, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
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
/**
 * #176: the v17 wrapper installs a 128 KB BumpAllocator and makes its first heap allocation
 * near heap_base+128KB on EVERY instruction, so any tx touching the wrapper aborts on-chain
 * (ProgramFailedToComplete / "Access violation in heap section") unless it requests a 128 KB
 * heap frame. Keeper txs all hit the wrapper, so request it by default.
 */
export const WRAPPER_HEAP_FRAME_BYTES = 128 * 1024;
const DEFAULT_KEEPER_OPTS = {
    skipPreflight: true,
    multiRpcBroadcast: true,
    simulateForCU: true,
    heapFrameBytes: WRAPPER_HEAP_FRAME_BYTES,
};
/**
 * #310: `pollSignatureStatus` throws "Transaction failed: ..." ONLY when a tx LANDED on-chain
 * and the program reverted it (vs never-landed timeouts / RPC errors). Detecting that lets the
 * retry loop surface the landed-and-reverted signal instead of a later attempt's transient
 * error — so consumers (e.g. the keeper's classifySendError) classify it as "reverted", not
 * "fail" (never landed).
 */
function isLandedRevertedError(err) {
    return getErrorMessage(err).startsWith("Transaction failed:");
}
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
    // Env override — skip RPC lookup entirely and use a fixed rate. Useful for
    // cost control on oracle-push keepers where "eventual land" is fine and the
    // dynamic p75 of recent fees is more expensive than needed.
    const override = process.env.PRIORITY_FEE_MICROLAMPORTS;
    if (override) {
        const parsed = parseInt(override, 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
            return { priorityFeeMicroLamports: parsed, computeUnitLimit: 400_000 };
        }
    }
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
    let landedRevertedErr; // #310
    // BH6 + BH11: Get dynamic priority fees once (outside retry loop)
    const { priorityFeeMicroLamports, computeUnitLimit } = await getRecentPriorityFees(connection);
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await acquireToken();
            const tx = new Transaction();
            // #176: request the wrapper's 128 KB heap frame (every wrapper tx needs it).
            tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: WRAPPER_HEAP_FRAME_BYTES }));
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
            if (isLandedRevertedError(err))
                landedRevertedErr = err; // #310
            const delay = is429(err)
                ? backoffMs(attempt, 2000, 30_000)
                : Math.min(1000 * 2 ** attempt, 8000);
            console.warn(`[sendWithRetry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw landedRevertedErr ?? lastErr; // #310
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
    // Helius Sender fast path — opt-in via env flag.
    if (process.env.USE_HELIUS_SENDER === "true") {
        const priorityLevel = (process.env.HELIUS_PRIORITY_LEVEL ?? "High");
        const tipLamports = parseInt(process.env.JITO_TIP_LAMPORTS ?? "200000", 10);
        let lastErr;
        let landedRevertedErr; // #310
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await sendKeeperTxViaSender(connection, instructions, signers, {
                    priorityLevel,
                    tipLamports,
                    computeUnitLimit: keeperOpts?.computeUnitLimit, // #311
                    priorityFeeMicroLamports: keeperOpts?.priorityFeeMicroLamports, // #311 / keeper#396
                    heapFrameBytes: keeperOpts?.heapFrameBytes ?? WRAPPER_HEAP_FRAME_BYTES, // #176
                });
            }
            catch (err) {
                lastErr = err;
                if (isLandedRevertedError(err))
                    landedRevertedErr = err; // #310
                const delay = is429(err)
                    ? backoffMs(attempt, 2000, 30_000)
                    : Math.min(1000 * 2 ** attempt, 8000);
                console.warn(`[sendWithRetryKeeper/sender] attempt ${attempt + 1}/${maxRetries} failed: ${getErrorMessage(err)}, retry in ${Math.round(delay)}ms`);
                await new Promise((r) => setTimeout(r, delay));
            }
        }
        throw landedRevertedErr ?? lastErr; // #310
    }
    const opts = { ...DEFAULT_KEEPER_OPTS, ...keeperOpts };
    let lastErr;
    let landedRevertedErr; // #310
    // #311: prefer the caller's tier-aware estimate; only derive internally when not supplied,
    // so the budget the caller gated on is the one actually broadcast.
    const priorityFeeMicroLamports = keeperOpts?.priorityFeeMicroLamports ??
        (await getRecentPriorityFees(connection)).priorityFeeMicroLamports;
    let computeUnitLimit;
    if (keeperOpts?.computeUnitLimit !== undefined) {
        computeUnitLimit = keeperOpts.computeUnitLimit;
    }
    else if (opts.simulateForCU) {
        computeUnitLimit = await simulateForComputeUnits(connection, instructions, signers[0]);
    }
    else {
        computeUnitLimit = 400_000;
    }
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await acquireToken();
            const tx = new Transaction();
            // #176: request the wrapper's heap frame first — every keeper tx hits the v17 wrapper.
            if (opts.heapFrameBytes > 0) {
                tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: opts.heapFrameBytes }));
            }
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
            // #310: a landed-and-reverted attempt means the instructions DID execute on-chain; that
            // signal must win over a later attempt's never-landed transient error.
            if (isLandedRevertedError(err))
                landedRevertedErr = err;
            const delay = is429(err)
                ? backoffMs(attempt, 2000, 30_000)
                : Math.min(1000 * 2 ** attempt, 8000);
            console.warn(`[sendWithRetryKeeper] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    // #310: surface a landed-and-reverted error in preference to a later transient one.
    throw landedRevertedErr ?? lastErr;
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
            return clampPriorityFee(Math.ceil(data.result.priorityFeeEstimate));
        }
        return 10_000;
    }
    catch {
        return 10_000;
    }
}
/**
 * Default ceiling for an RPC-supplied priority fee, in micro-lamports per CU.
 * At a 400k CU limit this is 400_000 lamports (0.0004 SOL) of priority fee for a
 * single transaction, which is far above any legitimate mainnet bid.
 */
const HELIUS_PRIORITY_FEE_DEFAULT_MAX = 1_000_000;
/**
 * percolator-keeper#396: getPriorityFeeEstimate is an RPC-controlled number that
 * was clamped from below (Math.max(fee, 1_000)) and not from above. The keeper
 * gates its SOL budget on its OWN estimate, so an RPC answering that call small
 * and this one large put a bid on chain that the budget never approved, bounded
 * only by wallet balance. A ceiling makes the worst case finite; the keeper
 * passing its gated fee through (see SenderSendOptions.priorityFeeMicroLamports)
 * removes the divergence entirely.
 */
function clampPriorityFee(fee) {
    const raw = Number(process.env.HELIUS_PRIORITY_FEE_MAX_MICROLAMPORTS);
    const ceiling = Number.isFinite(raw) && raw > 0 ? raw : HELIUS_PRIORITY_FEE_DEFAULT_MAX;
    return Math.min(Math.max(fee, 1_000), ceiling);
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
    const senderUrl = (() => {
        const configured = process.env.HELIUS_SENDER_URL?.trim();
        const sender = new URL(configured || "https://sender.helius-rpc.com/fast");
        if (apiKey && !sender.searchParams.has("api-key")) {
            sender.searchParams.set("api-key", apiKey);
        }
        return sender.toString();
    })();
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
 * Send a keeper transaction via Helius Sender API.
 * Composes: priority fee estimate + ComputeBudget + Jito tip + instructions + sign + send + poll.
 *
 * Requires connection.rpcEndpoint to be a Helius mainnet URL with api-key query param.
 */
export async function sendKeeperTxViaSender(connection, instructions, signers, opts = {}) {
    const priorityLevel = opts.priorityLevel ?? "High";
    const tipLamports = opts.tipLamports ?? 200_000;
    const computeUnitLimit = opts.computeUnitLimit ?? 400_000;
    const heapFrameBytes = opts.heapFrameBytes ?? WRAPPER_HEAP_FRAME_BYTES;
    const rpcUrl = connection.rpcEndpoint;
    // Collect unique account keys from all instructions for Helius priority-fee query.
    const accountKeys = Array.from(new Set(instructions.flatMap((ix) => ix.keys.map((k) => k.pubkey.toBase58()))));
    // #311: prefer the caller's gated estimate; only ask the RPC when absent. This
    // mirrors the non-Sender branch, which has honoured the override since #311 —
    // the Sender branch silently did not, so on mainnet (the only network it runs
    // on) the budget gate and the broadcast bid were independent numbers.
    const microLamports = opts.priorityFeeMicroLamports ??
        (await getHeliusPriorityFee(rpcUrl, accountKeys, priorityLevel));
    const tipIx = createJitoTipInstruction(signers[0].publicKey, tipLamports);
    const tx = new Transaction();
    if (heapFrameBytes > 0) {
        tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: heapFrameBytes })); // #176
    }
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports }), tipIx, ...instructions);
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = signers[0].publicKey;
    tx.sign(...signers);
    checkTransactionSize(tx);
    const sig = await sendViaHeliusSender(rpcUrl, tx.serialize());
    await pollSignatureStatus(connection, sig);
    return sig;
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
    const tipAccount = new PublicKey(randomJitoTipAccount());
    return SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: tipAccount,
        lamports,
    });
}
