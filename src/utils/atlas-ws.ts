import WebSocket from "ws";
import { createLogger } from "../logger.js";

const log = createLogger("atlas-ws");

export interface AtlasWs {
  /** Send a JSON-RPC request (e.g. "transactionSubscribe"). Safe to call before connect. */
  sub(id: number, method: string, params: unknown[]): void;
  /** Register a listener for any `*Notification` message. Multiple listeners supported. */
  onNotification(cb: (msg: AtlasNotification) => void): void;
  /** Close the underlying socket. */
  close(): void;
  /** True if socket is OPEN. */
  readonly isOpen: boolean;
}

export interface AtlasNotification {
  jsonrpc: "2.0";
  method: string;
  params: {
    result: unknown;
    subscription: number;
  };
}

export function createAtlasWs(urlOverride?: string): AtlasWs {
  const url = urlOverride ?? process.env.HELIUS_ATLAS_WS_URL;
  if (!url) {
    throw new Error("HELIUS_ATLAS_WS_URL not set (expected wss://atlas-mainnet.helius-rpc.com?api-key=...)");
  }

  const ws = new WebSocket(url);
  const listeners: Array<(msg: AtlasNotification) => void> = [];
  const pendingSubs: Array<{ id: number; method: string; params: unknown[] }> = [];

  ws.on("open", () => {
    log.info("atlas-ws connected", { url: url.split("?")[0] });
    // Drain queued subscriptions.
    for (const s of pendingSubs.splice(0)) {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: s.id, method: s.method, params: s.params }));
    }
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as Partial<AtlasNotification>;
      if (msg.method && msg.method.endsWith("Notification") && msg.params) {
        for (const l of listeners) l(msg as AtlasNotification);
      }
    } catch (err) {
      log.warn("atlas-ws message parse failed", { err: String(err) });
    }
  });

  ws.on("error", (err) => {
    log.error("atlas-ws error", { err: String(err) });
  });

  ws.on("close", (code, reason) => {
    log.warn("atlas-ws closed", { code, reason: reason.toString() });
  });

  return {
    sub(id, method, params) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      } else {
        pendingSubs.push({ id, method, params });
      }
    },
    onNotification(cb) {
      listeners.push(cb);
    },
    close() {
      ws.close();
    },
    get isOpen() {
      return ws.readyState === WebSocket.OPEN;
    },
  };
}
