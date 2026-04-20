import { describe, it, expect, afterEach } from "vitest";
import { Connection } from "@solana/web3.js";
import { getRecentPriorityFees } from "../src/utils/solana.js";

/**
 * Env override short-circuits the RPC lookup entirely. Used on oracle-push
 * keepers where we want a fixed, known-low priority-fee rate for cost control.
 */
describe("getRecentPriorityFees PRIORITY_FEE_MICROLAMPORTS override", () => {
  afterEach(() => {
    delete process.env.PRIORITY_FEE_MICROLAMPORTS;
  });

  it("returns the env value when set", async () => {
    process.env.PRIORITY_FEE_MICROLAMPORTS = "1000";
    const conn = new Connection("https://mainnet.helius-rpc.com/?api-key=stub", "confirmed");
    const res = await getRecentPriorityFees(conn);
    expect(res.priorityFeeMicroLamports).toBe(1000);
    expect(res.computeUnitLimit).toBe(400_000);
  });

  it("accepts 0 as an explicit override", async () => {
    process.env.PRIORITY_FEE_MICROLAMPORTS = "0";
    const conn = new Connection("https://mainnet.helius-rpc.com/?api-key=stub", "confirmed");
    const res = await getRecentPriorityFees(conn);
    expect(res.priorityFeeMicroLamports).toBe(0);
  });

  it("ignores non-numeric override and falls through to dynamic path", async () => {
    process.env.PRIORITY_FEE_MICROLAMPORTS = "not-a-number";
    // We don't assert the exact dynamic-path value since that depends on the RPC
    // mock; just assert the override did NOT short-circuit (would've returned NaN).
    // Bypass the fallthrough RPC noise by expecting either a valid number or a warn.
    // Test simply verifies parseInt("not-a-number") = NaN is rejected.
    const conn = new Connection("https://mainnet.helius-rpc.com/?api-key=stub", "confirmed");
    // The real RPC call will fail in this environment; getRecentPriorityFees catches
    // and returns the hard-coded 10_000 default in that case.
    const res = await getRecentPriorityFees(conn);
    expect(res.priorityFeeMicroLamports).not.toBe(NaN);
  });
});
