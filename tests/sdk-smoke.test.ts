/**
 * SDK publish smoke test — runs against the *installed* @percolatorct/sdk package.
 *
 * Purpose: catch publish-time regressions (missing exports, bad tarball, files: glob
 * mistakes, dist/ not regenerated) that are invisible when pnpm uses a workspace link.
 *
 * @percolatorct/shared does NOT import any SDK runtime code in its source — it depends
 * on the SDK only for type definitions (MarketConfig, EngineState, etc.) which are
 * re-exported to consumers.  This test therefore focuses on verifying that the SDK's
 * type-bearing runtime exports are present so that a shared build that references those
 * types doesn't break when the SDK tarball is unpacked.
 *
 * Rationale: even type-only consumer packages break at publish time when the SDK's dist/
 * is missing or stale.  A minimal import-existence check is the right scope here — no
 * round-trips are forced because shared has no SDK runtime call sites.
 *
 * This test does NOT make RPC calls or DB connections.
 *
 * Pinned version: @percolatorct/sdk@1.0.0-beta.33
 * Update this comment when the workflow pins a new version.
 */

import { describe, it, expect } from "vitest";

// ── 1. Runtime exports that carry the type definitions shared needs ───────────
// @percolatorct/shared depends on @percolatorct/sdk as a peer/direct dependency
// but its source files do not call any SDK functions at runtime (confirmed by grep).
// We import the runtime-present symbols that back the SDK's exported types so that:
//   a) TypeScript compilation of shared still works after an SDK publish, and
//   b) Missing-export regressions (e.g. a re-export dropped from dist/index.js) are caught.
import {
  // Constants that downstream consumers of shared compare against
  SLAB_MAGIC,
  ENGINE_OFF,
  ENGINE_MARK_PRICE_OFF,
  SLAB_TIERS_V12_17,
  IX_TAG,
  // Functions whose types flow into shared's re-export surface
  parseHeader,
  parseConfig,
  parseEngine,
  parseAllAccounts,
  detectSlabLayout,
  discoverMarkets,
  getProgramId,
  getMatcherProgramId,
  getCurrentNetwork,
  PROGRAM_IDS,
} from "@percolatorct/sdk";

// Type-only imports — the primary SDK surface shared uses
import type {
  SlabHeader,
  MarketConfig,
  EngineState,
  RiskParams,
  SlabLayout,
  DiscoveredMarket,
  AdlRankingResult,
  AdlRankedPosition,
} from "@percolatorct/sdk";

// ── 2. Constants present ──────────────────────────────────────────────────────

describe("@percolatorct/sdk exports — constants (shared)", () => {
  it("SLAB_MAGIC is a bigint matching 'PERCOLAT' ASCII bytes", () => {
    expect(typeof SLAB_MAGIC).toBe("bigint");
    expect(SLAB_MAGIC).toBe(0x504552434f4c4154n);
  });

  it("ENGINE_OFF is a positive number", () => {
    expect(typeof ENGINE_OFF).toBe("number");
    expect(ENGINE_OFF).toBeGreaterThan(0);
  });

  it("ENGINE_MARK_PRICE_OFF is a positive number", () => {
    expect(typeof ENGINE_MARK_PRICE_OFF).toBe("number");
    expect(ENGINE_MARK_PRICE_OFF).toBeGreaterThan(0);
  });

  it("SLAB_TIERS_V12_17 is a non-empty object", () => {
    expect(typeof SLAB_TIERS_V12_17).toBe("object");
    expect(SLAB_TIERS_V12_17).not.toBeNull();
    expect(Object.keys(SLAB_TIERS_V12_17).length).toBeGreaterThan(0);
  });

  it("IX_TAG is a non-empty object with at least 10 entries", () => {
    expect(typeof IX_TAG).toBe("object");
    expect(Object.keys(IX_TAG).length).toBeGreaterThanOrEqual(10);
  });
});

// ── 3. Parse / utility functions are exported ─────────────────────────────────

describe("@percolatorct/sdk exports — function shapes (shared)", () => {
  it("parseHeader is a function", () => {
    expect(typeof parseHeader).toBe("function");
  });

  it("parseConfig is a function", () => {
    expect(typeof parseConfig).toBe("function");
  });

  it("parseEngine is a function", () => {
    expect(typeof parseEngine).toBe("function");
  });

  it("parseAllAccounts is a function", () => {
    expect(typeof parseAllAccounts).toBe("function");
  });

  it("detectSlabLayout is a function", () => {
    expect(typeof detectSlabLayout).toBe("function");
  });

  it("discoverMarkets is a function", () => {
    expect(typeof discoverMarkets).toBe("function");
  });
});

// ── 4. Config / program-id exports ────────────────────────────────────────────

import { PublicKey } from "@solana/web3.js";

describe("@percolatorct/sdk exports — program IDs (shared)", () => {
  it("getProgramId returns a valid PublicKey for devnet", () => {
    const id = getProgramId("devnet");
    expect(id).toBeInstanceOf(PublicKey);
    expect(id.toBase58().length).toBeGreaterThan(0);
  });

  it("getMatcherProgramId returns a valid PublicKey for devnet", () => {
    const id = getMatcherProgramId("devnet");
    expect(id).toBeInstanceOf(PublicKey);
  });

  it("PROGRAM_IDS has devnet and mainnet keys", () => {
    expect(PROGRAM_IDS).toHaveProperty("devnet");
    expect(PROGRAM_IDS).toHaveProperty("mainnet");
  });

  it("getCurrentNetwork returns devnet or mainnet", () => {
    const net = getCurrentNetwork();
    expect(["devnet", "mainnet"]).toContain(net);
  });
});

// ── 5. detectSlabLayout minimal round-trip ────────────────────────────────────

describe("@percolatorct/sdk exports — detectSlabLayout round-trip (shared)", () => {
  it("returns null for an unknown size", () => {
    expect(detectSlabLayout(1)).toBeNull();
  });

  it("returns a SlabLayout for a registered tier size", () => {
    const tiers: Array<{ dataSize: number }> = Object.values(
      SLAB_TIERS_V12_17 as Record<string, { dataSize: number }>
    );
    if (tiers.length === 0) return;
    const knownSize = tiers[0]!.dataSize;
    const layout = detectSlabLayout(knownSize);
    expect(layout).not.toBeNull();
    if (layout !== null) {
      expect(typeof layout.bitmapWords).toBe("number");
      expect(typeof layout.maxAccounts).toBe("number");
    }
  });
});
