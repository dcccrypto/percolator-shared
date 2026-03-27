import { z } from "zod";
/**
 * Base58 address schema for Solana public keys.
 * GH#1667: string-length bounds (32-44) are sufficient because a 32-byte
 * key cannot exceed 44 base58 chars mathematically. The regex rejects
 * non-base58 characters. Actual 32-byte decode validation happens at the
 * API layer via `new PublicKey(addr)`.
 */
export declare const slabAddressSchema: z.ZodString;
/**
 * Market registration schema for POST /markets
 */
export declare const marketRegistrationSchema: z.ZodObject<{
    slabAddress: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * Pagination schema with defaults
 */
export declare const paginationSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
/**
 * Environment variables schema
 * Required in production, optional with defaults in dev
 */
declare const envSchemaBase: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<{
        production: "production";
        development: "development";
        test: "test";
    }>>;
    RPC_URL: z.ZodOptional<z.ZodString>;
    FALLBACK_RPC_URL: z.ZodOptional<z.ZodString>;
    HELIUS_API_KEY: z.ZodOptional<z.ZodString>;
    HELIUS_DEVNET_API_KEY: z.ZodOptional<z.ZodString>;
    HELIUS_MAINNET_API_KEY: z.ZodOptional<z.ZodString>;
    SUPABASE_URL: z.ZodOptional<z.ZodString>;
    SUPABASE_KEY: z.ZodOptional<z.ZodString>;
    SUPABASE_SERVICE_ROLE_KEY: z.ZodOptional<z.ZodString>;
    CRANK_KEYPAIR: z.ZodOptional<z.ZodString>;
    PROGRAM_ID: z.ZodOptional<z.ZodString>;
    ALL_PROGRAM_IDS: z.ZodOptional<z.ZodString>;
    PORT: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    CRANK_INTERVAL_MS: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    CRANK_INACTIVE_INTERVAL_MS: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    DISCOVERY_INTERVAL_MS: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    HELIUS_WEBHOOK_SECRET: z.ZodOptional<z.ZodString>;
    WEBHOOK_URL: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type EnvSchema = z.infer<typeof envSchemaBase>;
/**
 * Validate environment variables at startup
 * Throws clear errors on missing vars in production
 */
export declare function validateEnv(): EnvSchema;
export {};
