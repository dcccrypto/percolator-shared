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
export declare function createAtlasWs(urlOverride?: string): AtlasWs;
