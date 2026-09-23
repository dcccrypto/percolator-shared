import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Origin-header support for the primary/fallback RPC connections (v18 wire
 * migration). Some devnet Helius keys (e.g. the padre.gg-provisioned key used
 * by percolator-oracle-keeper's devnetConn) are Origin-restricted: every call
 * 401s "Unauthorized" without the exact registered Origin header. This tests
 * that rpc-client.ts forwards `config.rpcOrigin` (env `RPC_UPSTREAM_ORIGIN`)
 * into `new Connection(url, { httpHeaders: { Origin } })`, and that omitting
 * it preserves the prior `new Connection(url, "confirmed")` behaviour exactly
 * (backward compatibility — most deployments never set an Origin).
 *
 * We spy on the `Connection` constructor via a partial `@solana/web3.js`
 * mock rather than inspecting a live Connection instance, because web3.js
 * does not expose the httpHeaders it was constructed with on any public
 * property.
 */

const connectionCalls: Array<[string, unknown]> = [];

vi.mock("@solana/web3.js", async () => {
  const actual = await vi.importActual<typeof import("@solana/web3.js")>("@solana/web3.js");
  class SpyConnection {
    constructor(endpoint: string, config?: unknown) {
      connectionCalls.push([endpoint, config]);
    }
  }
  return { ...actual, Connection: SpyConnection };
});

afterEach(() => {
  connectionCalls.length = 0;
  vi.resetModules();
  vi.doUnmock("../../src/config.js");
});

describe("rpc-client Origin support", () => {
  it("passes no httpHeaders when rpcOrigin is unset (backward compatible)", async () => {
    vi.doMock("../../src/config.js", () => ({
      config: {
        rpcUrl: "https://api.devnet.solana.com",
        fallbackRpcUrl: "https://api.mainnet-beta.solana.com",
        rpcOrigin: undefined,
      },
    }));

    const { getPrimaryConnection, getFallbackConnection } = await import("../../src/utils/rpc-client.js");
    getPrimaryConnection();
    getFallbackConnection();

    expect(connectionCalls).toEqual([
      ["https://api.devnet.solana.com", "confirmed"],
      ["https://api.mainnet-beta.solana.com", "confirmed"],
    ]);
  });

  it("passes the Origin header on both connections when rpcOrigin is set", async () => {
    vi.doMock("../../src/config.js", () => ({
      config: {
        rpcUrl: "https://devnet.helius-rpc.com/?api-key=padre",
        fallbackRpcUrl: "https://api.devnet.solana.com",
        rpcOrigin: "https://trade.padre.gg",
      },
    }));

    const { getPrimaryConnection, getFallbackConnection } = await import("../../src/utils/rpc-client.js");
    getPrimaryConnection();
    getFallbackConnection();

    expect(connectionCalls).toEqual([
      [
        "https://devnet.helius-rpc.com/?api-key=padre",
        { commitment: "confirmed", httpHeaders: { Origin: "https://trade.padre.gg" } },
      ],
      [
        "https://api.devnet.solana.com",
        { commitment: "confirmed", httpHeaders: { Origin: "https://trade.padre.gg" } },
      ],
    ]);
  });
});
