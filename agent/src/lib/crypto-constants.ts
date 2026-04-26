/**
 * Secp256k1 and Ethereum cryptographic constants.
 * Exported for use in validation and contract interaction code.
 */

/**
 * Secp256k1 field prime
 * Used for all elliptic curve operations
 */
export const SECP256K1_P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;

/**
 * Secp256k1 curve order
 * All private keys must be less than this value
 */
export const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

/**
 * Secp256k1 generator point X coordinate
 */
export const SECP256K1_GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;

/**
 * Secp256k1 generator point Y coordinate
 */
export const SECP256K1_GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;

/**
 * Private key length in bytes
 * All secp256k1 private keys must be exactly 32 bytes
 */
export const PRIVATE_KEY_BYTES = 32;

/**
 * Private key length in hex characters (without 0x prefix)
 */
export const PRIVATE_KEY_HEX_LENGTH = 64;

/**
 * Ethereum address length in bytes
 * Derived from last 20 bytes of keccak256(publicKey)
 */
export const ADDRESS_BYTES = 20;

/**
 * Ethereum address length in hex characters (without 0x prefix)
 */
export const ADDRESS_HEX_LENGTH = 40;

/**
 * Transaction hash length in bytes
 * Standard for Ethereum transaction hashes
 */
export const TRANSACTION_HASH_BYTES = 32;

/**
 * Transaction hash length in hex characters (without 0x prefix)
 */
export const TRANSACTION_HASH_HEX_LENGTH = 64;

/**
 * Keccak-256 hash output length in bytes
 */
export const KECCAK256_BYTES = 32;

/**
 * Valid ECDSA recovery ids for signature verification
 * v must be 27 or 28 (1 or 0 in compact form, but Ethereum uses 27/28)
 */
export const VALID_RECOVERY_IDS = [27, 28] as const;

/**
 * Minimum valid private key value (must be > 0)
 */
export const MIN_PRIVATE_KEY = 1n;

/**
 * Maximum valid private key value (must be < SECP256K1_N)
 */
export const MAX_PRIVATE_KEY = SECP256K1_N - 1n;

/**
 * Half of secp256k1 order (for signature malleability protection)
 * If s > SECP256K1_N / 2, we negate it to keep it small
 */
export const SECP256K1_N_HALF = SECP256K1_N / 2n;

/**
 * Keccak-256 parameters
 * Capacity: 256 bits
 * Rate: 1088 bits (136 bytes)
 */
export const KECCAK256_RATE = 136;
export const KECCAK256_CAPACITY = 256;

/**
 * String representations of constants for logging and debugging
 */
export const CONSTANTS_INFO = {
  SECP256K1_P: `0x${SECP256K1_P.toString(16)}`,
  SECP256K1_N: `0x${SECP256K1_N.toString(16)}`,
  SECP256K1_GX: `0x${SECP256K1_GX.toString(16)}`,
  SECP256K1_GY: `0x${SECP256K1_GY.toString(16)}`,
  PRIVATE_KEY_BYTES,
  ADDRESS_BYTES,
  TRANSACTION_HASH_BYTES,
} as const;
