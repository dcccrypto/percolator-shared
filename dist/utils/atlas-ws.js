import WebSocket from "ws";
import { createLogger } from "../logger.js";
const log = createLogger("atlas-ws");
export function createAtlasWs(urlOverride) {
    const url = urlOverride ?? process.env.HELIUS_ATLAS_WS_URL;
    if (!url) {
        throw new Error("HELIUS_ATLAS_WS_URL not set (expected wss://atlas-mainnet.helius-rpc.com?api-key=...)");
    }
    const ws = new WebSocket(url);
    const listeners = [];
    const pendingSubs = [];
    let pingTimer = null;
    function stopPing() {
        if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
        }
    }
    ws.on("open", () => {
        log.info("atlas-ws connected", { url: url.split("?")[0] });
        stopPing();
        pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            }
        }, 60_000);
        pingTimer.unref?.();
        // Drain queued subscriptions.
        for (const s of pendingSubs.splice(0)) {
            ws.send(JSON.stringify({ jsonrpc: "2.0", id: s.id, method: s.method, params: s.params }));
        }
    });
    ws.on("message", (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.method && msg.method.endsWith("Notification") && msg.params) {
                for (const l of listeners)
                    l(msg);
            }
        }
        catch (err) {
            log.warn("atlas-ws message parse failed", { err: String(err) });
        }
    });
    ws.on("error", (err) => {
        log.error("atlas-ws error", { err: String(err) });
    });
    ws.on("close", (code, reason) => {
        stopPing();
        log.warn("atlas-ws closed", { code, reason: reason.toString() });
    });
    return {
        sub(id, method, params) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
            }
            else {
                pendingSubs.push({ id, method, params });
            }
        },
        onNotification(cb) {
            listeners.push(cb);
        },
        close() {
            stopPing();
            ws.close();
        },
        get isOpen() {
            return ws.readyState === WebSocket.OPEN;
        },
    };
}
