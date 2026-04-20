import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair, SystemProgram, PublicKey, Connection } from "@solana/web3.js";
import { sendKeeperTxViaSender } from "../src/utils/solana.js";

const FAKE_SIG = "5".repeat(88);

describe("sendKeeperTxViaSender", () => {
  let connection: Connection;
  const signer = Keypair.generate();
  const noopIx = SystemProgram.transfer({
    fromPubkey: signer.publicKey,
    toPubkey: PublicKey.default,
    lamports: 1,
  });

  beforeEach(() => {
    connection = new Connection("https://mainnet.helius-rpc.com/?api-key=stub", "confirmed");
    vi.spyOn(connection, "getLatestBlockhash").mockResolvedValue({
      blockhash: "11111111111111111111111111111111",
      lastValidBlockHeight: 1,
    });
    vi.spyOn(connection, "getSignatureStatuses").mockResolvedValue({
      context: { slot: 1 },
      value: [{ slot: 1, confirmations: 1, err: null, confirmationStatus: "confirmed" }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs to sender.helius-rpc.com/fast with base64 tx and skipPreflight", async () => {
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { priorityFeeEstimate: 5000 } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: FAKE_SIG }), { status: 200 }),
      );

    const sig = await sendKeeperTxViaSender(connection, [noopIx], [signer]);

    expect(sig).toBe(FAKE_SIG);
    const senderCall = fetchMock.mock.calls[1];
    expect(String(senderCall[0])).toContain("sender.helius-rpc.com/fast");
    const body = JSON.parse(senderCall[1]!.body as string);
    expect(body.method).toBe("sendTransaction");
    expect(body.params[1].skipPreflight).toBe(true);
    expect(body.params[1].encoding).toBe("base64");
  });

  it("uses default priorityLevel=High and tipLamports=200000", async () => {
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { priorityFeeEstimate: 5000 } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: FAKE_SIG }), { status: 200 }),
      );

    await sendKeeperTxViaSender(connection, [noopIx], [signer]);

    const feeCall = fetchMock.mock.calls[0];
    const feeBody = JSON.parse(feeCall[1]!.body as string);
    expect(feeBody.params[0].options.priorityLevel).toBe("High");
  });

  it("throws on error response from Sender", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { priorityFeeEstimate: 5000 } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "bad" } }),
          { status: 200 },
        ),
      );

    await expect(
      sendKeeperTxViaSender(connection, [noopIx], [signer]),
    ).rejects.toThrow(/Helius Sender error/);
  });

  it("respects custom opts", async () => {
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { priorityFeeEstimate: 5000 } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: FAKE_SIG }), { status: 200 }),
      );

    await sendKeeperTxViaSender(connection, [noopIx], [signer], {
      priorityLevel: "VeryHigh",
      tipLamports: 500_000,
      computeUnitLimit: 200_000,
    });

    const feeBody = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(feeBody.params[0].options.priorityLevel).toBe("VeryHigh");
  });
});
