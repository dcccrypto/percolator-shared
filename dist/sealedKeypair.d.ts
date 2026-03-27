/**
 * Sealed Keypair Module
 *
 * Provides a signer interface that seals the private key and never exposes it.
 * The private key is loaded once on app startup and only used for signing.
 * Raw key material is never stored in config or logged.
 */
import { Transaction, VersionedTransaction } from "@solana/web3.js";
/**
 * Sealed signer that never exposes the private key.
 * Only provides sign() capability.
 */
export interface SealedSigner {
    /** Public key of the signer */
    publicKey(): string;
    /** Sign a transaction (sealed key never exposed) */
    signTransaction(tx: Transaction | VersionedTransaction): Transaction | VersionedTransaction;
    /** Sign a message */
    signMessage(message: Uint8Array): Uint8Array;
}
/**
 * Load and seal a keypair from environment variable.
 * The private key is never stored in config or exposed.
 *
 * @throws Error if CRANK_KEYPAIR is not set or invalid
 */
export declare function loadSealedKeypair(env: NodeJS.ProcessEnv): SealedSigner;
/**
 * Validate that a sealed signer is properly configured.
 * @throws Error if public key doesn't match expected address
 */
export declare function validateSigner(signer: SealedSigner, expectedPublicKey?: string): void;
