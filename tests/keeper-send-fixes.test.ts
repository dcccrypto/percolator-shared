import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  Keypair,
  SystemProgram,
  PublicKey,
  Connection,
  Transaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { sendWithRetryKeeper, WRAPPER_HEAP_FRAME_BYTES } from "../src/utils/solana.js";

const FAKE_SIG = "5".repeat(88);

// ComputeBudget instruction discriminants (first data byte).
const CB_REQUEST_HEAP_FRAME = 1;
const CB_SET_CU_LIMIT = 2;
const CB_SET_CU_PRICE = 3;

function cbIx(tx: Transaction, disc: number) {
  return tx.instructions.find(
    (i) => i.programId.equals(ComputeBudgetProgram.programId) && i.data[0] === disc,
  );
}
function u32le(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true);
}
function u64le(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset + offset, 8).getBigUint64(0, true);
}

describe("sendWithRetryKeeper — #176 / #310 / #311 fixes", () => {
  const signer = Keypair.generate();
  const ix = SystemProgram.transfer({
    fromPubkey: signer.publicKey,
    toPubkey: PublicKey.default,
    lamports: 1,
  });
  let conn: Connection;

  beforeEach(() => {
    conn = new Connection("https://mainnet.helius-rpc.com/?api-key=stub", "confirmed");
    vi.spyOn(conn, "getLatestBlockhash").mockResolvedValue({
      blockhash: "11111111111111111111111111111111",
      lastValidBlockHeight: 1,
    });
    // Default: confirmed + no error (clean land).
    vi.spyOn(conn, "getSignatureStatuses").mockResolvedValue({
      context: { slot: 1 },
      value: [{ slot: 1, confirmations: 1, err: null, confirmationStatus: "confirmed" }],
    } as never);
  });
  afterEach(() => {
    delete process.env.USE_HELIUS_SENDER;
    delete process.env.PRIORITY_FEE_MICROLAMPORTS;
    vi.restoreAllMocks();
  });

  // ── #176: every keeper tx must request the wrapper's 128KB heap frame ──────
  it("#176: requests a 128KB heap frame by default", async () => {
    let sent: Transaction | undefined;
    vi.spyOn(conn, "sendRawTransaction").mockImplementation(async (raw) => {
      sent = Transaction.from(raw as Buffer);
      return FAKE_SIG;
    });
    vi.spyOn(conn, "getRecentPrioritizationFees").mockResolvedValue([
      { slot: 1, prioritizationFee: 1000 },
    ]);
    vi.spyOn(conn, "simulateTransaction").mockResolvedValue({
      context: { slot: 1 },
      value: { err: null, unitsConsumed: 50_000, logs: [] },
    } as never);

    await sendWithRetryKeeper(conn, [ix], [signer], 1, { multiRpcBroadcast: false });

    const hf = cbIx(sent!, CB_REQUEST_HEAP_FRAME);
    expect(hf).toBeDefined();
    expect(u32le(hf!.data, 1)).toBe(WRAPPER_HEAP_FRAME_BYTES);
    expect(WRAPPER_HEAP_FRAME_BYTES).toBe(128 * 1024);
  });

  it("#176: omits the heap frame when heapFrameBytes: 0", async () => {
    let sent: Transaction | undefined;
    vi.spyOn(conn, "sendRawTransaction").mockImplementation(async (raw) => {
      sent = Transaction.from(raw as Buffer);
      return FAKE_SIG;
    });
    vi.spyOn(conn, "getRecentPrioritizationFees").mockResolvedValue([
      { slot: 1, prioritizationFee: 1000 },
    ]);
    vi.spyOn(conn, "simulateTransaction").mockResolvedValue({
      context: { slot: 1 },
      value: { err: null, unitsConsumed: 50_000, logs: [] },
    } as never);

    await sendWithRetryKeeper(conn, [ix], [signer], 1, {
      multiRpcBroadcast: false,
      heapFrameBytes: 0,
    });
    expect(cbIx(sent!, CB_REQUEST_HEAP_FRAME)).toBeUndefined();
  });

  // ── #311: caller-provided CU + priority fee win; internal derivation skipped ─
  it("#311: uses the caller's computeUnitLimit + priorityFee and skips internal derivation", async () => {
    let sent: Transaction | undefined;
    vi.spyOn(conn, "sendRawTransaction").mockImplementation(async (raw) => {
      sent = Transaction.from(raw as Buffer);
      return FAKE_SIG;
    });
    const feeSpy = vi
      .spyOn(conn, "getRecentPrioritizationFees")
      .mockResolvedValue([{ slot: 1, prioritizationFee: 99_999 }]);
    const simSpy = vi.spyOn(conn, "simulateTransaction").mockResolvedValue({
      context: { slot: 1 },
      value: { err: null, unitsConsumed: 999_999, logs: [] },
    } as never);

    await sendWithRetryKeeper(conn, [ix], [signer], 1, {
      multiRpcBroadcast: false,
      computeUnitLimit: 123_456,
      priorityFeeMicroLamports: 777,
    });

    expect(u32le(cbIx(sent!, CB_SET_CU_LIMIT)!.data, 1)).toBe(123_456);
    expect(u64le(cbIx(sent!, CB_SET_CU_PRICE)!.data, 1)).toBe(777n);
    // The keeper's estimate is authoritative — no internal fee fetch / CU simulation.
    expect(feeSpy).not.toHaveBeenCalled();
    expect(simSpy).not.toHaveBeenCalled();
  });

  // ── #310: a landed-and-reverted attempt must win over a later transient error ─
  it("#310: surfaces the landed-and-reverted error, not a later never-landed one", async () => {
    vi.spyOn(conn, "getRecentPrioritizationFees").mockResolvedValue([
      { slot: 1, prioritizationFee: 1000 },
    ]);
    vi.spyOn(conn, "simulateTransaction").mockResolvedValue({
      context: { slot: 1 },
      value: { err: null, unitsConsumed: 50_000, logs: [] },
    } as never);
    // Attempt 1 broadcasts & lands; attempt 2+ never land (transient send failure).
    let sendCall = 0;
    vi.spyOn(conn, "sendRawTransaction").mockImplementation(async () => {
      sendCall += 1;
      if (sendCall === 1) return FAKE_SIG;
      throw new Error("RPC timeout — never landed");
    });
    // Attempt 1's status: landed and reverted.
    vi.spyOn(conn, "getSignatureStatuses").mockResolvedValue({
      context: { slot: 1 },
      value: [
        {
          slot: 1,
          confirmations: 1,
          err: { InstructionError: [0, { Custom: 8 }] },
          confirmationStatus: "confirmed",
        },
      ],
    } as never);

    // Without the fix, the thrown error would be the attempt-2 "RPC timeout" (never-landed),
    // misclassifying a real on-chain revert. With the fix it is the landed-reverted error.
    await expect(
      sendWithRetryKeeper(conn, [ix], [signer], 2, { multiRpcBroadcast: false }),
    ).rejects.toThrow(/Transaction failed:/);
  }, 15_000);
});
