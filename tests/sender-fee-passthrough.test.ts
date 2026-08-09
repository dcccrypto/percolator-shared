import { describe, it, expect, vi, afterEach } from "vitest";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { getHeliusPriorityFee, sendKeeperTxViaSender } from "../src/utils/solana.js";

/**
 * #311 / percolator-keeper#396: the keeper computes a tier-aware priority fee,
 * gates its SOL budget on it, and passes it down as
 * `keeperOpts.priorityFeeMicroLamports`. The non-Sender branch honours that
 * override — its JSDoc says "so the budget the caller gated on is the one
 * actually broadcast" — but the Helius Sender branch never forwarded it, so on
 * MAINNET (the only network the Sender runs on, and the one the keeper is
 * required to enable it for) the broadcast fee came from getHeliusPriorityFee
 * instead: a different, RPC-controlled source with a floor and NO ceiling.
 *
 * A hostile or merely spiking RPC could therefore answer the keeper's estimator
 * with a small number (budget approves) and getPriorityFeeEstimate with an
 * arbitrarily large one (broadcast bids it), with the gap bounded only by wallet
 * balance.
 */

const RPC = "https://mainnet.helius-rpc.com/?api-key=stub";

/** pollSignatureStatus validates base58 shape, so the stub must look like a real signature. */
const FAKE_SIG = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789ABCDEFGHJKLMNPQRSTUVW";

function dummyIx(): TransactionInstruction {
  return new TransactionInstruction({ programId: PublicKey.default, keys: [], data: Buffer.alloc(0) });
}

function fakeConnection() {
  return {
    rpcEndpoint: RPC,
    getLatestBlockhash: vi.fn(async () => ({ blockhash: "11111111111111111111111111111111" })),
    getSignatureStatuses: vi.fn(async () => ({ value: [{ confirmationStatus: "confirmed", err: null }] })),
  } as any;
}

afterEach(() => {
  delete process.env.HELIUS_PRIORITY_FEE_MAX_MICROLAMPORTS;
  vi.restoreAllMocks();
});

describe("getHeliusPriorityFee ceiling", () => {
  it("caps an absurd RPC estimate instead of returning it verbatim", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ result: { priorityFeeEstimate: 1_000_000_000 } }), { status: 200 }),
    );
    const fee = await getHeliusPriorityFee(RPC, ["k"], "High");
    expect(fee).toBeLessThanOrEqual(1_000_000);
  });

  it("still returns a normal estimate untouched", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ result: { priorityFeeEstimate: 5_000 } }), { status: 200 }),
    );
    expect(await getHeliusPriorityFee(RPC, ["k"], "High")).toBe(5_000);
  });

  it("keeps the existing 1_000 floor", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ result: { priorityFeeEstimate: 5 } }), { status: 200 }),
    );
    expect(await getHeliusPriorityFee(RPC, ["k"], "High")).toBe(1_000);
  });

  it("honours an operator-supplied ceiling", async () => {
    process.env.HELIUS_PRIORITY_FEE_MAX_MICROLAMPORTS = "2000";
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ result: { priorityFeeEstimate: 50_000 } }), { status: 200 }),
    );
    expect(await getHeliusPriorityFee(RPC, ["k"], "High")).toBe(2_000);
  });
});

describe("sendKeeperTxViaSender priority-fee passthrough", () => {
  it("broadcasts the caller's fee and never queries getPriorityFeeEstimate", async () => {
    // A fresh Response per call: a Response body can only be read once, so a
    // single mockResolvedValue object breaks on the second fetch.
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ jsonrpc: "2.0", result: FAKE_SIG }), { status: 200 }),
    );

    await sendKeeperTxViaSender(fakeConnection(), [dummyIx()], [Keypair.generate()], {
      priorityFeeMicroLamports: 1_234,
      computeUnitLimit: 200_000,
      tipLamports: 1,
      heapFrameBytes: 0,
    });

    const estimateCalls = fetchMock.mock.calls.filter((c) =>
      String((c[1] as RequestInit | undefined)?.body ?? "").includes("getPriorityFeeEstimate"),
    );
    expect(estimateCalls).toHaveLength(0);
  });

  it("falls back to the RPC estimate when the caller supplies no fee", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ jsonrpc: "2.0", result: FAKE_SIG }), { status: 200 }),
    );

    await sendKeeperTxViaSender(fakeConnection(), [dummyIx()], [Keypair.generate()], {
      computeUnitLimit: 200_000,
      tipLamports: 1,
      heapFrameBytes: 0,
    });

    const estimateCalls = fetchMock.mock.calls.filter((c) =>
      String((c[1] as RequestInit | undefined)?.body ?? "").includes("getPriorityFeeEstimate"),
    );
    expect(estimateCalls.length).toBeGreaterThan(0);
  });
});
