/**
 * Crypto module index - single point of import for all cryptographic utilities.
 * 
 * This index file provides convenient access to:
 * - Core crypto functions (address derivation, signing, hashing)
 * - Validation utilities
 * - Safe wrapper functions with error recovery
 * - Error types with specific codes
 * - Constants for Ethereum/secp256k1
 * 
 * @example
 * import {
 *   deriveAddress,
 *   signHash,
 *   validatePrivateKey,
 *   safelyDeriveAddress,
 *   InvalidPrivateKeyError,
 *   SECP256K1_N,
 * } from './crypto/index';
 */

// Core crypto functions
export {
  hexToBytes,
  bytesToHex,
  keccak256,
  deriveAddress,
  signHash,
  encodeTransaction,
} from './crypto';

// Re-exported validation utilities from crypto module
export {
  validateHexString,
  validateHexLength,
  validatePrivateKeyInput,
  validateTransactionHash,
  validatePublicKeyPoint,
  validateSignatureComponents,
  validateTransactionObject,
} from './crypto';

// Re-exported error types from crypto module
export {
  InvalidHexError,
  InvalidPrivateKeyError,
  SignatureError,
  EllipticCurveError,
} from './crypto';

// Dedicated validation module
export {
  validateHexString as validateHex,
  validatePrivateKey,
  validateAddress,
  validateTransactionHash as validateHash,
  validatePublicKeyPoint,
  validateSignatureComponents,
  validateTransactionObject,
} from './crypto-validation';

// Safe wrapper functions with error recovery
export {
  safelyDeriveAddress,
  safelySignHash,
  safelyEncodeTransaction,
  validatePrivateKeyWithSuggestions,
  type SafeOperationResult,
} from './crypto-safe';

// Error types
export {
  CryptoError,
  InvalidHexError as InvalidHexFormatError,
  InvalidPrivateKeyError,
  SignatureError,
  EllipticCurveError,
} from './errors';

// Constants
export {
  SECP256K1_P,
  SECP256K1_N,
  SECP256K1_GX,
  SECP256K1_GY,
  PRIVATE_KEY_BYTES,
  PRIVATE_KEY_HEX_LENGTH,
  ADDRESS_BYTES,
  ADDRESS_HEX_LENGTH,
  TRANSACTION_HASH_BYTES,
  TRANSACTION_HASH_HEX_LENGTH,
  KECCAK256_BYTES,
  VALID_RECOVERY_IDS,
  MIN_PRIVATE_KEY,
  MAX_PRIVATE_KEY,
  SECP256K1_N_HALF,
  KECCAK256_RATE,
  KECCAK256_CAPACITY,
  CONSTANTS_INFO,
} from './crypto-constants';
