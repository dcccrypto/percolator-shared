import "dotenv/config";
export declare const config: {
    readonly rpcUrl: string;
    readonly programId: string;
    /** Comma-separated list of all program IDs to scan for markets */
    readonly allProgramIds: string[];
    readonly supabaseUrl: string;
    readonly supabaseKey: string;
    readonly supabaseServiceRoleKey: string;
    readonly heliusApiKey: string;
    readonly fallbackRpcUrl: string;
    /**
     * Optional Origin header value for the primary/fallback RPC connections
     * (rpc-client.ts). Some devnet Helius keys are Origin-restricted (401s
     * "Unauthorized" without the exact registered Origin) — set
     * RPC_UPSTREAM_ORIGIN to that value when running against such a key.
     * Unset (the default) preserves the prior no-header behaviour.
     */
    readonly rpcOrigin: string | undefined;
    readonly port: number;
    readonly crankIntervalMs: number;
    readonly crankInactiveIntervalMs: number;
    /** Route keeper transactions via Helius Sender API when true (Phase 1 perf upgrade) */
    readonly useHeliusSender: boolean;
    /** Jito tip in lamports for Sender dual-routing (0.0002 SOL = 200000 min) */
    readonly jitoTipLamports: number;
    /** Priority fee level for getPriorityFeeEstimate */
    readonly heliusPriorityLevel: "Min" | "Low" | "Medium" | "High" | "VeryHigh";
    /** BH4: Reduced to 60s to catch markets created/deleted within smaller window */
    readonly discoveryIntervalMs: number;
    /** Helius webhook secret for auth validation */
    readonly webhookSecret: string;
    /** Public URL for webhook registration (e.g. Railway URL) */
    readonly webhookUrl: string;
};
