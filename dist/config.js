import "dotenv/config";
import { validateEnv } from "./validation.js";
import { validateNetworkConfig, ensureNetworkConfigValid } from "./networkValidation.js";
// Validate network configuration at startup (prevents mainnet accidents)
// Skip in test environment — tests manage env vars dynamically
if (!process.env.VITEST && process.env.NODE_ENV !== "test") {
    ensureNetworkConfigValid(process.env);
}
// Validate environment variables
const env = validateEnv();
// Try network validation; fall back to defaults in test/dev when env vars are absent
let networkConfig;
try {
    networkConfig = validateNetworkConfig(process.env);
}
catch {
    // In test environments the NETWORK / PROGRAM_ID vars are usually unset.
    // Fall back to safe devnet defaults so the config module stays importable.
    networkConfig = {
        network: "devnet",
        // PERC-469: prefer network-specific key, fall back to generic
        rpcUrl: env.RPC_URL ?? `https://devnet.helius-rpc.com/?api-key=${env.HELIUS_DEVNET_API_KEY ?? env.HELIUS_API_KEY ?? ""}`,
        programIds: [env.PROGRAM_ID ?? "FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD"],
    };
}
export const config = {
    // Network is validated above; use the validated RPC URL
    rpcUrl: networkConfig.rpcUrl,
    // PROGRAM_ID is required and validated above
    programId: networkConfig.programIds[0],
    /** Comma-separated list of all program IDs to scan for markets */
    // ALL_PROGRAM_IDS: comma-separated list of program IDs to scan for markets.
    // Falls back to the single PROGRAM_ID from networkValidation if not set.
    // The previous default of 3 devnet program IDs caused pointless 429s on mainnet.
    allProgramIds: (env.ALL_PROGRAM_IDS ?? networkConfig.programIds[0] ?? "").split(",").filter(Boolean),
    // NOTE: Private key is NOT stored in config anymore.
    // Use getSealedSigner() from signer.ts to get signing capability.
    // Raw key material never exposed; only sign() interface provided.
    supabaseUrl: env.SUPABASE_URL ?? "",
    supabaseKey: env.SUPABASE_KEY ?? "",
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    // PERC-469: heliusApiKey — network-aware key selection for internal service use
    heliusApiKey: (networkConfig.network === "mainnet"
        ? (process.env.HELIUS_MAINNET_API_KEY ?? env.HELIUS_API_KEY ?? "")
        : (process.env.HELIUS_DEVNET_API_KEY ?? env.HELIUS_API_KEY ?? "")),
    fallbackRpcUrl: env.FALLBACK_RPC_URL ?? "https://api.devnet.solana.com",
    port: env.PORT ?? 3001,
    crankIntervalMs: env.CRANK_INTERVAL_MS ?? 30_000,
    crankInactiveIntervalMs: env.CRANK_INACTIVE_INTERVAL_MS ?? 60_000,
    /** Route keeper transactions via Helius Sender API when true (Phase 1 perf upgrade) */
    useHeliusSender: process.env.USE_HELIUS_SENDER === "true",
    /** Jito tip in lamports for Sender dual-routing (0.0002 SOL = 200000 min) */
    jitoTipLamports: parseInt(process.env.JITO_TIP_LAMPORTS ?? "200000", 10),
    /** Priority fee level for getPriorityFeeEstimate */
    heliusPriorityLevel: (process.env.HELIUS_PRIORITY_LEVEL ?? "High"),
    /** BH4: Reduced to 60s to catch markets created/deleted within smaller window */
    discoveryIntervalMs: env.DISCOVERY_INTERVAL_MS ?? 300_000,
    /** Helius webhook secret for auth validation */
    webhookSecret: env.HELIUS_WEBHOOK_SECRET ?? "",
    /** Public URL for webhook registration (e.g. Railway URL) */
    webhookUrl: env.WEBHOOK_URL ?? "",
};
