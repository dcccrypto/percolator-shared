/**
 * Signer Module
 *
 * Centralized place to get the sealed signer.
 * Loads the crank keypair once and provides sealed signing access.
 */
import { SealedSigner } from "./sealedKeypair.js";
/**
 * Get the sealed signer for crank operations.
 * Loads the keypair from CRANK_KEYPAIR env var on first call.
 * Subsequent calls return the same sealed signer.
 *
 * @throws Error if CRANK_KEYPAIR env var is not set or invalid
 */
export declare function getSealedSigner(): SealedSigner;
/**
 * Get the crank wallet public key (string).
 * Safe to log/display (no private key exposure).
 */
export declare function getCrankPublicKey(): string;
