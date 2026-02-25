import { EventEmitter } from "node:events";
class ServerEventBus extends EventEmitter {
    // BM4: Track subscriptions to prevent listener leaks
    subscriptions = new Map();
    publish(event, slabAddress, data = {}) {
        const payload = {
            event,
            slabAddress,
            timestamp: Date.now(),
            data,
        };
        this.emit(event, payload);
        this.emit("*", payload);
    }
    subscribe(event, listener) {
        this.on(event, listener);
        // Track subscription count
        const key = event;
        this.subscriptions.set(key, (this.subscriptions.get(key) ?? 0) + 1);
        // Return unsubscribe function
        return () => {
            this.off(event, listener);
            const count = this.subscriptions.get(key) ?? 0;
            if (count > 0) {
                this.subscriptions.set(key, count - 1);
            }
        };
    }
    getSubscriptionCount(event) {
        return this.subscriptions.get(event) ?? 0;
    }
}
export const eventBus = new ServerEventBus();
// H7: Increase max listeners to handle many markets
// BM4: Set max to prevent unchecked listener growth
eventBus.setMaxListeners(100);
