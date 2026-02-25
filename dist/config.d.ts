import "dotenv/config";
export declare const config: {
    readonly rpcUrl: string;
    readonly programId: string;
    /** Comma-separated list of all program IDs to scan for markets */
    readonly allProgramIds: string[];
    readonly crankKeypair: string;
    readonly supabaseUrl: string;
    readonly supabaseKey: string;
    readonly supabaseServiceRoleKey: string;
    readonly heliusApiKey: string;
    readonly fallbackRpcUrl: string;
    readonly port: number;
    readonly crankIntervalMs: number;
    readonly crankInactiveIntervalMs: number;
    /** BH4: Reduced to 60s to catch markets created/deleted within smaller window */
    readonly discoveryIntervalMs: number;
    /** Helius webhook secret for auth validation */
    readonly webhookSecret: string;
    /** Public URL for webhook registration (e.g. Railway URL) */
    readonly webhookUrl: string;
};
