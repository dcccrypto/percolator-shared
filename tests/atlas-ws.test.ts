import { describe, it, expect } from "vitest";
import { WebSocketServer } from "ws";
import { createAtlasWs } from "../src/utils/atlas-ws.js";

describe("createAtlasWs", () => {
  it("throws when HELIUS_ATLAS_WS_URL and urlOverride both absent", () => {
    const prior = process.env.HELIUS_ATLAS_WS_URL;
    delete process.env.HELIUS_ATLAS_WS_URL;
    try {
      expect(() => createAtlasWs()).toThrow(/HELIUS_ATLAS_WS_URL/);
    } finally {
      if (prior) process.env.HELIUS_ATLAS_WS_URL = prior;
    }
  });

  it("sends subscription after connect and delivers notifications", async () => {
    const server = new WebSocketServer({ port: 0 });
    await new Promise<void>((r) => server.once("listening", () => r()));
    const addr = server.address();
    if (typeof addr !== "object" || !addr) throw new Error("no address");
    const url = `ws://localhost:${addr.port}`;

    let received: any;
    server.on("connection", (sock) => {
      sock.on("message", (raw) => {
        received = JSON.parse(raw.toString());
        // Simulate a transactionNotification back.
        sock.send(JSON.stringify({
          jsonrpc: "2.0",
          method: "transactionNotification",
          params: { result: { signature: "s1", slot: 42 }, subscription: 1 },
        }));
      });
    });

    const atlas = createAtlasWs(url);
    const received$ = new Promise<any>((resolve) => {
      atlas.onNotification((msg) => resolve(msg));
    });

    atlas.sub(1, "transactionSubscribe", [{ accountInclude: ["PERC"] }]);

    const note = await received$;
    expect(received.method).toBe("transactionSubscribe");
    expect(received.params[0].accountInclude).toEqual(["PERC"]);
    expect(note.method).toBe("transactionNotification");
    expect((note.params.result as any).slot).toBe(42);

    atlas.close();
    await new Promise<void>((r) => server.close(() => r()));
  }, 10_000);

  it("queues subs before open, drains on open", async () => {
    const server = new WebSocketServer({ port: 0 });
    await new Promise<void>((r) => server.once("listening", () => r()));
    const addr = server.address();
    if (typeof addr !== "object" || !addr) throw new Error("no address");
    const url = `ws://localhost:${addr.port}`;

    const atlas = createAtlasWs(url);
    // Call sub() immediately, before the socket opens.
    atlas.sub(7, "accountSubscribe", ["someAccount"]);

    const received: any = await new Promise((resolve) => {
      server.on("connection", (sock) => {
        sock.on("message", (raw) => resolve(JSON.parse(raw.toString())));
      });
    });

    expect(received.id).toBe(7);
    expect(received.method).toBe("accountSubscribe");

    atlas.close();
    await new Promise<void>((r) => server.close(() => r()));
  }, 10_000);
});
