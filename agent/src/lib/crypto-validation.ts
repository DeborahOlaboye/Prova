/**
 * Validation utilities for cryptographic operations.
 * Provides helper functions to validate hex strings, private keys, and other crypto inputs.
 */

import { InvalidHexError, InvalidPrivateKeyError } from './errors';

/**
 * Validates if a string is a valid hexadecimal format.
 * @param value - The value to validate
 * @param paramName - Name of the parameter for error messages
 * @throws InvalidHexError if not valid hex
 */
export function validateHexString(value: string, paramName: string = 'value'): void {
  if (typeof value !== 'string') {
    throw new InvalidHexError(`${paramName} must be a string, got ${typeof value}`);
  }

  if (!value) {
    throw new InvalidHexError(`${paramName} cannot be empty`);
  }

  const cleanHex = value.replace('0x', '');
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new InvalidHexError(`${paramName} contains invalid hex characters`);
  }

  if (cleanHex.length % 2 !== 0) {
    throw new InvalidHexError(`${paramName} has odd length: ${cleanHex.length}`);
  }
}

/**
 * Validates hex string and ensures it's a specific byte length.
 * @param value - The hex string to validate
 * @param expectedBytes - Expected number of bytes
 * @param paramName - Name of the parameter for error messages
 * @throws InvalidHexError if validation fails
 */
export function validateHexLength(
  value: string,
  expectedBytes: number,
  paramName: string = 'value'
): void {
  validateHexString(value, paramName);
  
  const cleanHex = value.replace('0x', '');
  const actualBytes = cleanHex.length / 2;
  
  if (actualBytes !== expectedBytes) {
    throw new InvalidHexError(
      `${paramName} must be ${expectedBytes} bytes (${expectedBytes * 2} hex chars), got ${actualBytes} bytes`
    );
  }
}

/**
 * Validates a private key is valid for secp256k1.
 * Private key must be 32 bytes and within valid range [1, n-1].
 * @param privateKey - The private key hex string
 * @throws InvalidPrivateKeyError if validation fails
 */
export function validatePrivateKey(privateKey: string): void {
  validateHexLength(privateKey, 32, 'privateKey');
  
  const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  const keyBigInt = BigInt(privateKey.startsWith('0x') ? privateKey : '0x' + privateKey);
  
  if (keyBigInt <= 0n) {
    throw new InvalidPrivateKeyError('Private key must be greater than 0');
  }
  
  if (keyBigInt >= SECP256K1_N) {
    throw new InvalidPrivateKeyError(
      `Private key must be less than secp256k1 order (n): ${SECP256K1_N.toString(16)}`
    );
  }
}

/**
 * Validates an Ethereum/Celo address format.
 * @param address - The address to validate
 * @throws InvalidHexError if validation fails
 */
export function validateAddress(address: string): void {
  if (typeof address !== 'string') {
    throw new InvalidHexError(`address must be a string, got ${typeof address}`);
  }

  const cleanAddr = address.replace('0x', '');
  
  if (cleanAddr.length !== 40) {
    throw new InvalidHexError(`address must be 20 bytes (40 hex chars), got ${cleanAddr.length}`);
  }

  if (!/^[0-9a-fA-F]{40}$/.test(cleanAddr)) {
    throw new InvalidHexError('address contains invalid hex characters');
  }
}

/**
 * Validates transaction hash format.
 * @param txHash - The transaction hash to validate
 * @throws InvalidHexError if validation fails
 */
export function validateTransactionHash(txHash: string): void {
  validateHexLength(txHash, 32, 'txHash');
}

/**
 * Validates public key point coordinates (x, y).
 * @param x - The x coordinate as bigint
 * @param y - The y coordinate as bigint
 * @throws Error if validation fails
 */
export function validatePublicKeyPoint(x: bigint, y: bigint): void {
  const SECP256K1_P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
  
  if (x < 0n || x >= SECP256K1_P) {
    throw new Error('Invalid public key: x coordinate out of range');
  }
  
  if (y < 0n || y >= SECP256K1_P) {
    throw new Error('Invalid public key: y coordinate out of range');
  }
}

/**
 * Validates signature components (r, s, v).
 * @param r - The r component
 * @param s - The s component
 * @param v - The recovery id
 * @throws SignatureError if validation fails
 */
export function validateSignatureComponents(r: bigint, s: bigint, v: number): void {
  const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

  if (r === 0n) {
    throw new Error('Invalid signature: r component is zero');
  }

  if (s === 0n) {
    throw new Error('Invalid signature: s component is zero');
  }

  if (r < 1n || r >= SECP256K1_N) {
    throw new Error('Invalid signature: r out of valid range');
  }

  if (s < 1n || s >= SECP256K1_N) {
    throw new Error('Invalid signature: s out of valid range');
  }

  if (v !== 27 && v !== 28) {
    throw new Error(`Invalid signature: v must be 27 or 28, got ${v}`);
  }
}

/**
 * Validates a complete transaction object for encoding.
 * @param tx - Transaction object to validate
 * @throws InvalidHexError if any field is invalid
 */
export function validateTransactionObject(tx: {
  nonce: string;
  gasPrice: string;
  gas: string;
  to: string;
  value: string;
  data: string;
  chainId: string;
}): void {
  if (!tx || typeof tx !== 'object') {
    throw new InvalidHexError('Transaction must be an object');
  }

  const requiredFields = ['nonce', 'gasPrice', 'gas', 'to', 'value', 'data', 'chainId'];
  for (const field of requiredFields) {
    if (!(field in tx)) {
      throw new InvalidHexError(`Missing required transaction field: ${field}`);
    }
  }

  const fieldValidations = [
    { field: 'nonce', validator: validateHexString },
    { field: 'gasPrice', validator: validateHexString },
    { field: 'gas', validator: validateHexString },
    { field: 'to', validator: validateHexString },
    { field: 'value', validator: validateHexString },
    { field: 'data', validator: (v: string) => validateHexString(v || '0x', 'data') },
    { field: 'chainId', validator: validateHexString },
  ];

  for (const { field, validator } of fieldValidations) {
    try {
      const value = (tx as Record<string, string>)[field];
      validator(value || '0x', field);
    } catch (error) {
      throw new InvalidHexError(
        `Invalid transaction field "${field}": ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }
}
