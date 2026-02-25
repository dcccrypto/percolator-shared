/**
 * Network Validation Module
 *
 * Ensures that network configuration (RPC, PROGRAM_ID) matches the intended
 * deployment network. Prevents accidental mainnet operations on devnet/testnet.
 */
export type NetworkType = "devnet" | "testnet" | "mainnet";
interface NetworkConfig {
    network: NetworkType;
    rpcUrl: string;
    programIds: string[];
}
/**
 * Validate network configuration at startup.
 * Throws if configuration is invalid or unsafe.
 */
export declare function validateNetworkConfig(env: {
    NETWORK?: string;
    RPC_URL?: string;
    PROGRAM_ID?: string;
    FORCE_MAINNET?: string;
}): NetworkConfig;
/**
 * Validate configuration and throw with helpful error messages on failure.
 * Call this once at app startup.
 */
export declare function ensureNetworkConfigValid(env: NodeJS.ProcessEnv): void;
/**
 * Check if we're running against mainnet.
 * Useful for conditional logic that should behave differently on mainnet.
 */
export declare function isMainnet(env: NodeJS.ProcessEnv): boolean;
/**
 * Get the expected RPC URL for a network (used for validation).
 */
export declare function getDefaultRpcUrl(network: NetworkType): string;
export {};
