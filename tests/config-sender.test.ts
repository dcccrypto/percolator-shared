import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Sender config flags", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.USE_HELIUS_SENDER;
    delete process.env.JITO_TIP_LAMPORTS;
    delete process.env.HELIUS_PRIORITY_LEVEL;
  });
  afterEach(() => {
    vi.resetModules();
    delete process.env.USE_HELIUS_SENDER;
    delete process.env.JITO_TIP_LAMPORTS;
    delete process.env.HELIUS_PRIORITY_LEVEL;
  });

  it("defaults useHeliusSender to false", async () => {
    const { config } = await import("../src/config.js");
    expect(config.useHeliusSender).toBe(false);
  });

  it("reads USE_HELIUS_SENDER=true", async () => {
    process.env.USE_HELIUS_SENDER = "true";
    const { config } = await import("../src/config.js");
    expect(config.useHeliusSender).toBe(true);
  });

  it("defaults jitoTipLamports to 200000", async () => {
    const { config } = await import("../src/config.js");
    expect(config.jitoTipLamports).toBe(200_000);
  });

  it("reads JITO_TIP_LAMPORTS env", async () => {
    process.env.JITO_TIP_LAMPORTS = "500000";
    const { config } = await import("../src/config.js");
    expect(config.jitoTipLamports).toBe(500_000);
  });

  it("defaults heliusPriorityLevel to High", async () => {
    const { config } = await import("../src/config.js");
    expect(config.heliusPriorityLevel).toBe("High");
  });

  it("accepts VeryHigh", async () => {
    process.env.HELIUS_PRIORITY_LEVEL = "VeryHigh";
    const { config } = await import("../src/config.js");
    expect(config.heliusPriorityLevel).toBe("VeryHigh");
  });
});
