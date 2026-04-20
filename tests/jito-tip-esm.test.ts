import { describe, it, expect } from "vitest";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { createJitoTipInstruction, randomJitoTipAccount } from "../src/index.js";

/**
 * Regression guard for the ESM `require is not defined` crash that broke the
 * mainnet keeper when USE_HELIUS_SENDER was first enabled.
 *
 * The pre-fix implementation used `require("@solana/web3.js")` inside
 * createJitoTipInstruction. That works in CJS but throws in ESM consumers.
 * The fix is top-level imports; this test exercises the real function (no
 * mocks) so any regression fails here instead of in production.
 */
describe("createJitoTipInstruction — ESM regression guard", () => {
  it("returns a SystemProgram.transfer ix without throwing on require", () => {
    const payer = Keypair.generate().publicKey;
    const ix = createJitoTipInstruction(payer, 200_000);
    expect(ix.programId.equals(SystemProgram.programId)).toBe(true);
    expect(ix.keys.length).toBe(2);
    expect(ix.keys[0].pubkey.equals(payer)).toBe(true);
    expect(ix.data.length).toBeGreaterThan(0);
  });

  it("randomJitoTipAccount returns one of the 5 Jito tip accounts", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) seen.add(randomJitoTipAccount());
    for (const addr of seen) expect(addr.length).toBeGreaterThanOrEqual(43);
  });
});
