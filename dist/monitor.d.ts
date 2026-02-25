interface MonitorThresholds {
    /** Max consecutive failures before alerting */
    maxConsecutiveFailures: number;
    /** Max time in ms since last success before alerting */
    maxStalenessMs: number;
    /** Max error rate (0-1) before alerting */
    maxErrorRate: number;
    /** Window size for error rate calculation */
    errorRateWindow: number;
}
/**
 * Service health monitor with automatic Discord alerting.
 *
 * Tracks consecutive failures, staleness, and error rates.
 * Sends Discord alerts when thresholds are exceeded.
 * Auto-recovers and sends resolution alerts.
 */
export declare class ServiceMonitor {
    private state;
    private thresholds;
    private serviceName;
    private checkName;
    constructor(serviceName: string, checkName: string, thresholds?: Partial<MonitorThresholds>);
    /**
     * Record a successful check
     */
    recordSuccess(): Promise<void>;
    /**
     * Record a failed check
     */
    recordFailure(error?: string): Promise<void>;
    /**
     * Get current error rate (0-1)
     */
    getErrorRate(): number;
    /**
     * Get current monitor status
     */
    getStatus(): {
        healthy: boolean;
        consecutiveFailures: number;
        errorRate: number;
        timeSinceSuccessMs: number;
        alertActive: boolean;
    };
    private pushResult;
    private canAlert;
}
/**
 * Create standard monitors for a service
 */
export declare function createServiceMonitors(serviceName: string): {
    rpc: ServiceMonitor;
    scan: ServiceMonitor;
    oracle: ServiceMonitor;
    db: ServiceMonitor;
};
export {};
