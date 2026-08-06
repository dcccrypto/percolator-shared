import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair, SystemProgram, PublicKey, Connection, Transaction } from "@solana/web3.js";
import { sendWithRetryKeeper } from "../src/utils/solana.js";

/**
 * PoC — duplicate landed transaction on confirmation-timeout/-error retry.
 *
 * sendWithRetryKeeper rebuilds the transaction with a FRESH blockhash and
 * re-signs (a NEW signature) on every retry attempt, and pollSignatureStatus
 * observes only the primary connection with no lastValidBlockHeight check. When
 * the primary lags or errors during confirmation, the loop re-signs with a new
 * blockhash and broadcasts a SECOND, DISTINCT signature — while the first
 * attempt (multi-RPC broadcast, blockhash valid ~150 slots) is still landable.
 * Because the two signatures differ, Solana's signature-level dedup cannot
 * collapse them, so both can land: duplicate execution and duplicate fees for a
 * single logical action, with only one attempt booked against the budget.
 *
 * Invariant a correct sender must hold: within a blockhash's validity window,
 * retries must re-broadcast the SAME signed transaction (one signature), so the
 * chain admits at most one landing. This PoC forces a transient confirmation
 * failure and asserts every broadcast carried a single signature. It FAILS
 * before the fix (distinct signatures across retries) and PASSES after.
 */

function firstSigB64(raw: Buffer | Uint8Array): string {
  const tx = Transaction.from(raw as Buffer);
  return Buffer.from(tx.signature ?? Buffer.alloc(0)).toString("base64");
}

describe("PoC: keeper send retries must reuse one signature (no duplicate landing)", () => {
  const signer = Keypair.generate();
  const ix = SystemProgram.transfer({
    fromPubkey: signer.publicKey,
    toPubkey: PublicKey.default,
    lamports: 1,
  });
  let conn: Connection;
  const broadcasts: string[] = [];

  beforeEach(() => {
    broadcasts.length = 0;
    conn = new Connection("https://mainnet.helius-rpc.com/?api-key=stub", "confirmed");

    // Distinct blockhash on each fetch, so a rebuild yields a distinct signature.
    const blockhashes = [
      Keypair.generate().publicKey.toBase58(),
      Keypair.generate().publicKey.toBase58(),
      Keypair.generate().publicKey.toBase58(),
    ];
    let i = 0;
    vi.spyOn(conn, "getLatestBlockhash").mockImplementation(async () => ({
      blockhash: blockhashes[Math.min(i++, blockhashes.length - 1)],
      lastValidBlockHeight: 1000,
    }));

    // Confirmation check fails transiently (lagging/erroring primary) → the send
    // loop retries. The prior attempt's tx remains landable on other RPCs.
    vi.spyOn(conn, "getSignatureStatuses").mockRejectedValue(
      new Error("RPC 503 during confirmation"),
    );

    vi.spyOn(conn, "sendRawTransaction").mockImplementation(async (raw) => {
      broadcasts.push(firstSigB64(raw as Buffer));
      return "5".repeat(88);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("re-broadcasts a single signature across retries", async () => {
    const err = await sendWithRetryKeeper(conn, [ix], [signer], 2, {
      multiRpcBroadcast: false,
      // Skip internal fee/CU derivation (pinned by the #311 tests).
      computeUnitLimit: 200_000,
      priorityFeeMicroLamports: 1_000,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(Error); // both attempts fail confirmation

    expect(broadcasts.length).toBeGreaterThanOrEqual(2);
    // Distinct signatures across retries defeat Solana's signature-level dedup,
    // letting a lagging first attempt AND the retry both land.
    expect(new Set(broadcasts).size).toBe(1);
  }, 15_000);
});
