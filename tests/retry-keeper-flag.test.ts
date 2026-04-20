import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair, SystemProgram, PublicKey, Connection } from "@solana/web3.js";
import { sendWithRetryKeeper } from "../src/utils/solana.js";

const FAKE_SIG = "5".repeat(88);

describe("sendWithRetryKeeper honors USE_HELIUS_SENDER flag", () => {
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
    vi.spyOn(conn, "getSignatureStatuses").mockResolvedValue({
      context: { slot: 1 },
      value: [{ slot: 1, confirmations: 1, err: null, confirmationStatus: "confirmed" }],
    });
  });
  afterEach(() => {
    delete process.env.USE_HELIUS_SENDER;
    delete process.env.HELIUS_PRIORITY_LEVEL;
    delete process.env.JITO_TIP_LAMPORTS;
    vi.restoreAllMocks();
  });

  it("uses Sender POST when USE_HELIUS_SENDER=true", async () => {
    process.env.USE_HELIUS_SENDER = "true";
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { priorityFeeEstimate: 5000 } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: "2.0", result: FAKE_SIG }), { status: 200 }),
      );
    const sig = await sendWithRetryKeeper(conn, [ix], [signer]);
    expect(sig).toBe(FAKE_SIG);
    const sawSender = fetchMock.mock.calls.some((c) => String(c[0]).includes("sender.helius-rpc.com"));
    expect(sawSender).toBe(true);
  });

  it("uses sendRawTransaction path when flag unset", async () => {
    delete process.env.USE_HELIUS_SENDER;
    const sendRawSpy = vi.spyOn(conn, "sendRawTransaction").mockResolvedValue(FAKE_SIG);
    vi.spyOn(conn, "getRecentPrioritizationFees").mockResolvedValue([
      { slot: 1, prioritizationFee: 1000 },
    ]);
    const sig = await sendWithRetryKeeper(conn, [ix], [signer]);
    expect(sig).toBe(FAKE_SIG);
    expect(sendRawSpy).toHaveBeenCalled();
  });

  it("retries up to maxRetries when Sender fails then succeeds", async () => {
    process.env.USE_HELIUS_SENDER = "true";
    const fetchMock = vi.spyOn(global, "fetch")
      // first attempt: priority-fee ok, then Sender error
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { priorityFeeEstimate: 5000 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: -1, message: "flaky" } }), { status: 200 }))
      // second attempt: both ok
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { priorityFeeEstimate: 5000 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", result: FAKE_SIG }), { status: 200 }));

    const sig = await sendWithRetryKeeper(conn, [ix], [signer], 2);
    expect(sig).toBe(FAKE_SIG);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);
  }, 15_000);
});
