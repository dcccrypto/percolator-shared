import { EventEmitter } from "node:events";
export type ServerEvent = "market.creating" | "market.created" | "market.updated" | "price.updated" | "crank.success" | "crank.failure" | "crank.stale" | "trade.executed" | "position.liquidated" | "liquidation.success" | "liquidation.failure" | "price.engine.degraded" | "price.engine.recovered";
export interface EventPayload {
    event: ServerEvent;
    slabAddress: string;
    timestamp: number;
    data: Record<string, unknown>;
}
declare class ServerEventBus extends EventEmitter {
    private subscriptions;
    publish(event: ServerEvent, slabAddress: string, data?: Record<string, unknown>): void;
    subscribe(event: ServerEvent | "*", listener: (payload: EventPayload) => void): () => void;
    getSubscriptionCount(event: ServerEvent | "*"): number;
}
export declare const eventBus: ServerEventBus;
export {};
