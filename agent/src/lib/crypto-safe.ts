/**
 * Safe wrapper functions for crypto operations with error recovery.
 * Provides convenience functions with built-in error handling and recovery mechanisms.
 */

import {
  deriveAddress,
  signHash,
  encodeTransaction,
} from './crypto';
import {
  InvalidPrivateKeyError,
  InvalidHexError,
  SignatureError,
  CryptoError,
} from './errors';

/**
 * Result of a safe operation attempt.
 */
export interface SafeOperationResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  errorCode?: string;
}

/**
 * Safely derive an address from a private key with error recovery.
 * 
 * Catches and categorizes errors, providing useful recovery information.
 * 
 * @param privateKey - The private key hex string
 * @returns Result object with success flag, data, and error if failed
 * 
 * @example
 * const result = safelyDeriveAddress('0x...');
 * if (result.success) {
 *   console.log('Address:', result.data);
 * } else {
 *   console.error('Error:', result.error);
 * }
 */
export function safelyDeriveAddress(privateKey: string): SafeOperationResult<string> {
  try {
    const address = deriveAddress(privateKey);
    return {
      success: true,
      data: address,
    };
  } catch (error) {
    if (error instanceof InvalidPrivateKeyError) {
      return {
        success: false,
        error,
        errorCode: 'INVALID_PRIVATE_KEY',
      };
    }
    if (error instanceof InvalidHexError) {
      return {
        success: false,
        error,
        errorCode: 'INVALID_HEX',
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Unknown error'),
      errorCode: 'UNKNOWN',
    };
  }
}

/**
 * Safely sign a transaction hash with error recovery.
 * 
 * Catches and categorizes errors, providing useful recovery information.
 * 
 * @param txHash - The transaction hash hex string
 * @param privateKey - The private key hex string
 * @returns Result object with success flag, signature components if successful
 * 
 * @example
 * const result = safelySignHash('0x...', '0x...');
 * if (result.success) {
 *   console.log('Signature:', result.data);
 * }
 */
export function safelySignHash(
  txHash: string,
  privateKey: string
): SafeOperationResult<{
  r: string;
  s: string;
  v: number;
}> {
  try {
    const signature = signHash(txHash, privateKey);
    return {
      success: true,
      data: signature,
    };
  } catch (error) {
    if (error instanceof InvalidPrivateKeyError) {
      return {
        success: false,
        error,
        errorCode: 'INVALID_PRIVATE_KEY',
      };
    }
    if (error instanceof InvalidHexError) {
      return {
        success: false,
        error,
        errorCode: 'INVALID_HEX',
      };
    }
    if (error instanceof SignatureError) {
      return {
        success: false,
        error,
        errorCode: 'SIGNATURE_FAILED',
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Unknown error'),
      errorCode: 'UNKNOWN',
    };
  }
}

/**
 * Safely encode a transaction with error recovery.
 * 
 * Catches and categorizes errors, providing useful recovery information.
 * 
 * @param tx - The transaction object to encode
 * @returns Result object with success flag, encoded transaction if successful
 * 
 * @example
 * const result = safelyEncodeTransaction(txObject);
 * if (result.success) {
 *   console.log('Encoded:', result.data);
 * }
 */
export function safelyEncodeTransaction(tx: {
  nonce: string;
  gasPrice: string;
  gas: string;
  to: string;
  value: string;
  data: string;
  chainId: string;
}): SafeOperationResult<Uint8Array> {
  try {
    const encoded = encodeTransaction(tx);
    return {
      success: true,
      data: encoded,
    };
  } catch (error) {
    if (error instanceof InvalidHexError) {
      return {
        success: false,
        error,
        errorCode: 'INVALID_TRANSACTION_FIELD',
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Unknown error'),
      errorCode: 'ENCODING_FAILED',
    };
  }
}

/**
 * Validate a private key and return recovery suggestions if invalid.
 * 
 * Provides specific feedback about what's wrong with a private key.
 * 
 * @param privateKey - The private key hex string to validate
 * @returns Validation result with error details if invalid
 */
export function validatePrivateKeyWithSuggestions(
  privateKey: string
): {
  isValid: boolean;
  problem?: string;
  suggestion?: string;
} {
  try {
    if (!privateKey || typeof privateKey !== 'string') {
      return {
        isValid: false,
        problem: 'Private key must be a non-empty string',
        suggestion: 'Provide a valid hex string with "0x" prefix or address format',
      };
    }

    const cleanKey = privateKey.replace('0x', '');

    if (cleanKey.length !== 64) {
      return {
        isValid: false,
        problem: `Private key has invalid length: ${cleanKey.length} hex chars (expected 64)`,
        suggestion: `Private key must be 32 bytes = 64 hex characters`,
      };
    }

    if (!/^[0-9a-fA-F]*$/.test(cleanKey)) {
      return {
        isValid: false,
        problem: 'Private key contains invalid hex characters',
        suggestion: 'Only use 0-9, a-f, A-F characters',
      };
    }

    const keyBigInt = BigInt(privateKey);
    if (keyBigInt === 0n) {
      return {
        isValid: false,
        problem: 'Private key cannot be zero',
        suggestion: 'Use a valid secp256k1 private key between 1 and n-1',
      };
    }

    const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
    if (keyBigInt >= SECP256K1_N) {
      return {
        isValid: false,
        problem: 'Private key exceeds secp256k1 order (n)',
        suggestion: `Use a key less than ${SECP256K1_N.toString(16)}`,
      };
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      problem: 'Error validating private key',
      suggestion: `Check if key is a valid hex string: ${error instanceof Error ? error.message : 'unknown'}`,
    };
  }
}
