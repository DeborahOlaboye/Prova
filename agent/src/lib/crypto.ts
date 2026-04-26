/**
 * Cryptographic utilities for Ethereum address derivation and transaction signing.
 * 
 * This module provides secp256k1 operations needed for Celo/Ethereum compatibility.
 * Since Cloudflare Workers Web Crypto API only supports P-256 (not secp256k1),
 * we implement secp256k1 operations using pure JavaScript for compatibility.
 * 
 * @remarks
 * Ethereum and Celo use the secp256k1 elliptic curve for key derivation.
 * The P-256 curve (used by Web Crypto) is NOT compatible with Ethereum addresses.
 */

import {
  InvalidHexError,
  InvalidPrivateKeyError,
  SignatureError,
  EllipticCurveError,
} from './errors';
import {
  validateHexString,
  validateHexLength,
  validatePrivateKey as validatePrivateKeyInput,
  validateTransactionHash,
  validatePublicKeyPoint,
  validateSignatureComponents,
} from './crypto-validation';

/**
 * Convert a hexadecimal string to a Uint8Array.
 * @throws InvalidHexError if the hex string is invalid
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace('0x', '');
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string: odd length');
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert a Uint8Array to a hexadecimal string.
 * @throws Error if input is invalid
 */
export function bytesToHex(bytes: Uint8Array): string {
  if (!bytes || bytes.length === 0) {
    throw new Error('Cannot convert empty byte array to hex');
  }
  
  return '0x' + Array.from(bytes)
    .map(b => {
      if (b < 0 || b > 255) {
        throw new Error(`Invalid byte value: ${b}. Expected value between 0 and 255`);
      }
      return b.toString(16).padStart(2, '0');
    })
    .join('');
}

// Keccak-256 round constants
const KECCAK_RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
  0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
  0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
  0x8000000000008080n, 0x0000000000000001n, 0x8000000080008008n
];

/**
 * Secp256k1 curve parameters
 */
const SECP256K1_P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const SECP256K1_GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
const SECP256K1_GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;

/**
 * Modular exponentiation for BigInt
 */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    exp = exp / 2n;
    base = (base * base) % mod;
  }
  return result;
}

/**
 * Modular inverse using Fermat's little theorem
 */
function modInverse(a: bigint, mod: bigint): bigint {
  return modPow(a, mod - 2n, mod);
}

/**
 * Point addition on secp256k1
 * @throws EllipticCurveError if operation fails
 */
function pointAdd(
  x1: bigint, y1: bigint,
  x2: bigint, y2: bigint
): [bigint, bigint] | null {
  try {
    if (x1 === 0n && y1 === 0n) return [x2, y2];
    if (x2 === 0n && y2 === 0n) return [x1, y1];
    if (x1 === x2 && y1 === y2) {
      // Point doubling
      if (y1 === 0n) return null;
      const slopeDouble = (3n * x1 * x1 * modInverse(2n * y1, SECP256K1_P)) % SECP256K1_P;
      const x3 = (slopeDouble * slopeDouble - 2n * x1) % SECP256K1_P;
      const y3 = (slopeDouble * (x1 - x3) - y1) % SECP256K1_P;
      return [x3, y3];
    }
    if (x1 === x2) return null; // Point at infinity

    let slopeAdd = ((y2 - y1) % SECP256K1_P + SECP256K1_P) % SECP256K1_P;
    slopeAdd = (slopeAdd * modInverse((x2 - x1 + SECP256K1_P) % SECP256K1_P, SECP256K1_P)) % SECP256K1_P;
    const x3 = (slopeAdd * slopeAdd - x1 - x2) % SECP256K1_P;
    const y3 = (slopeAdd * (x1 - x3) - y1) % SECP256K1_P;
    return [x3, y3];
  } catch (error) {
    throw new EllipticCurveError(
      `Point addition failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Scalar multiplication on secp256k1 using double-and-add algorithm
 * @throws EllipticCurveError if operation fails
 */
function pointMultiply(k: bigint, gx: bigint, gy: bigint): [bigint, bigint] | null {
  try {
    let rx = 0n, ry = 0n; // Result point (point at infinity)
    let tx = gx, ty = gy; // Temporary point (generator)

    while (k > 0n) {
      if (k & 1n) {
        const result = pointAdd(rx, ry, tx, ty);
        if (!result) return null;
        [rx, ry] = result;
      }
      const doubled = pointAdd(tx, ty, tx, ty);
      if (!doubled) return null;
      [tx, ty] = doubled;
      k >>= 1n;
    }

    return [rx, ry];
  } catch (error) {
    throw new EllipticCurveError(
      `Scalar multiplication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Derive Ethereum/Celo address from a secp256k1 private key.
 * 
 * @param privateKey - 32-byte secp256k1 private key as hex string
 * @returns Ethereum address (20 bytes) as hex string with 0x prefix
 * @throws InvalidPrivateKeyError if private key is invalid
 * @throws EllipticCurveError if point operations fail
 */
export function deriveAddress(privateKey: string): string {
  try {
    // Validate input
    validatePrivateKeyInput(privateKey);

    const privateKeyBigInt = BigInt(privateKey.startsWith('0x') ? privateKey : '0x' + privateKey);

    // Multiply generator point by private key
    const result = pointMultiply(privateKeyBigInt, SECP256K1_GX, SECP256K1_GY);
    if (!result) {
      throw new EllipticCurveError('Invalid private key: resulted in point at infinity');
    }

    const [x, y] = result;
    
    // Validate resulting public key point
    validatePublicKeyPoint(x, y);

    // Convert x and y to 32-byte hex strings
    const xHex = x.toString(16).padStart(64, '0');
    const yHex = y.toString(16).padStart(64, '0');

    // Concatenate x and y (uncompressed public key without 0x04 prefix)
    const publicKeyBytes = hexToBytes(xHex + yHex);

    // Hash with Keccak-256
    const hash = keccak256(publicKeyBytes);

    // Take last 20 bytes as address
    const address = '0x' + bytesToHex(hash.slice(12));
    return address;
  } catch (error) {
    if (error instanceof InvalidPrivateKeyError || error instanceof EllipticCurveError) {
      throw error;
    }
    throw new InvalidPrivateKeyError(
      `Failed to derive address: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Compute Keccak-256 hash of input bytes.
 */
export function keccak256(data: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  return keccak256Pure(new Uint8Array(data));
}

function keccak256Pure(data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const state = new Uint8Array(200);
  const rate = 136;

  const padded = new Uint8Array(Math.ceil((data.length + 1) / rate) * rate + rate);
  padded.set(data);
  padded[data.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate && offset + i < padded.length; i++) {
      state[i] ^= padded[offset + i];
    }
    keccakF1600(state);
  }

  return state.slice(0, 32);
}

function keccakF1600(state: Uint8Array<ArrayBuffer>): void {
  const lanes = new Array(25).fill(0n);
  for (let i = 0; i < 25; i++) {
    lanes[i] = stateToLane(state, i);
  }

  for (let round = 0; round < 24; round++) {
    const C = new Array(5).fill(0n);
    const D = new Array(5).fill(0n);
    for (let x = 0; x < 5; x++) {
      C[x] = lanes[x] ^ lanes[x + 5] ^ lanes[x + 10] ^ lanes[x + 15] ^ lanes[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      D[x] = rotl64(C[(x + 4) % 5], 1) ^ C[(x + 1) % 5];
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        lanes[x + 5 * y] ^= D[x];
      }
    }

    const B = new Array(25).fill(0n);
    const rotationOffsets: [number, number][] = [
      [0, 0], [1, 3], [2, 6], [3, 10], [4, 15],
      [0, 21], [1, 28], [2, 36], [3, 45], [4, 55],
      [0, 2], [1, 14], [2, 27], [3, 41], [4, 56]
    ];
    const pi: [number, number][] = [
      [0, 0], [1, 1], [2, 2], [3, 3], [4, 4],
      [1, 0], [2, 1], [3, 2], [4, 3], [0, 4],
      [2, 0], [3, 1], [4, 2], [0, 3], [1, 4]
    ];
    for (let t = 0; t < 25; t++) {
      const [x, y] = rotationOffsets[t];
      B[pi[t][0] + 5 * pi[t][1]] = rotl64(lanes[t], pi[t][0] + 5 * pi[t][1]);
    }

    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const idx = x + 5 * y;
        lanes[idx] = B[idx] ^ ((~B[(x + 1) % 5 + 5 * y]) & B[(x + 2) % 5 + 5 * y]);
      }
    }

    lanes[0] ^= KECCAK_RC[round];
  }

  for (let i = 0; i < 25; i++) {
    laneToState(state, i, lanes[i]);
  }
}

function stateToLane(state: Uint8Array<ArrayBuffer>, idx: number): bigint {
  let lane = 0n;
  for (let i = 0; i < 8; i++) {
    lane |= BigInt(state[idx * 8 + i]) << BigInt(i * 8);
  }
  return lane;
}

function laneToState(state: Uint8Array<ArrayBuffer>, idx: number, lane: bigint): void {
  for (let i = 0; i < 8; i++) {
    state[idx * 8 + i] = Number((lane >> BigInt(i * 8)) & 0xFFn);
  }
}

function rotl64(n: bigint, offset: number): bigint {
  const shift = BigInt(offset);
  return ((n << shift) | (n >> (64n - shift))) & 0xFFFFFFFFFFFFFFFFn;
}

/**
 * Sign a transaction hash using secp256k1.
 * 
 * @param txHash - 32-byte transaction hash as hex string
 * @param privateKey - 32-byte secp256k1 private key as hex string
 * @returns Signature components (r, s, v)
 * @throws InvalidPrivateKeyError if private key is invalid
 * @throws InvalidHexError if transaction hash is invalid
 * @throws SignatureError if signature generation fails
 */
export function signHash(txHash: string, privateKey: string): {
  r: string;
  s: string;
  v: number;
} {
  try {
    // Validate inputs
    validateTransactionHash(txHash);
    validatePrivateKeyInput(privateKey);

    const hashBytes = hexToBytes(txHash);
    const privateKeyBigInt = BigInt(privateKey.startsWith('0x') ? privateKey : '0x' + privateKey);

    const k = generateDeterministicK(hashBytes, hexToBytes(privateKey));
    
    try {
      const point = pointMultiply(k, SECP256K1_GX, SECP256K1_GY);
      if (!point) {
        throw new SignatureError('Invalid k value: resulted in point at infinity');
      }
      
      const r = point[0];
      if (r === 0n) {
        throw new SignatureError('Invalid signature: r component is zero');
      }

      const z = BigInt(txHash.startsWith('0x') ? txHash : '0x' + txHash);
      const kInv = modInverse(k, SECP256K1_N);
      let s = (kInv * (z + r * privateKeyBigInt)) % SECP256K1_N;
      
      if (s === 0n) {
        throw new SignatureError('Invalid signature: s component is zero');
      }

      // Ensure low s value for signature malleability protection
      if (s > SECP256K1_N / 2n) {
        s = SECP256K1_N - s;
      }

      const v = (point[1] % 2n) === 0n ? 27 : 28;
      
      // Validate signature components
      validateSignatureComponents(r, s, v);

      return {
        r: '0x' + r.toString(16).padStart(64, '0'),
        s: '0x' + s.toString(16).padStart(64, '0'),
        v: v
      };
    } catch (error) {
      if (error instanceof SignatureError) {
        throw error;
      }
      throw new SignatureError(
        `Failed to generate signature: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  } catch (error) {
    if (error instanceof InvalidPrivateKeyError || error instanceof InvalidHexError || error instanceof SignatureError) {
      throw error;
    }
    throw new SignatureError(
      `Signature operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

function generateDeterministicK(messageHash: Uint8Array, privateKey: Uint8Array): bigint {
  const combined = new Uint8Array(messageHash.length + privateKey.length);
  combined.set(messageHash);
  combined.set(privateKey, messageHash.length);
  
  const hash = keccak256(combined);
  
  let k = BigInt('0x' + bytesToHex(hash)) % SECP256K1_N;
  if (k === 0n) {
    k = 1n;
  }
  
  return k;
}

/**
 * Encode a transaction for signing using RLP encoding.
 * 
 * @param tx - Transaction object with required fields
 * @returns Encoded transaction bytes
 * @throws InvalidHexError if any field is invalid hex
 */
export function encodeTransaction(tx: {
  nonce: string;
  gasPrice: string;
  gas: string;
  to: string;
  value: string;
  data: string;
  chainId: string;
}): Uint8Array {
  // Validate all transaction fields
  const fields = [
    { value: tx.nonce, name: 'nonce' },
    { value: tx.gasPrice, name: 'gasPrice' },
    { value: tx.gas, name: 'gas' },
    { value: tx.to, name: 'to' },
    { value: tx.value, name: 'value' },
    { value: tx.data || '0x', name: 'data' },
    { value: tx.chainId, name: 'chainId' },
  ];

  for (const field of fields) {
    try {
      validateHexString(field.value, field.name);
    } catch (error) {
      throw new InvalidHexError(
        `Transaction field "${field.name}" is invalid: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  const encodedFields = [
    hexToBytes(tx.nonce),
    hexToBytes(tx.gasPrice),
    hexToBytes(tx.gas),
    hexToBytes(tx.to),
    hexToBytes(tx.value),
    hexToBytes(tx.data || '0x'),
    hexToBytes(tx.chainId),
    hexToBytes('0x'),
    hexToBytes('0x'),
  ];

  return rlpEncode(encodedFields);
}

function rlpEncode(items: Uint8Array[]): Uint8Array {
  let encoded = new Uint8Array(0);
  
  for (const item of items) {
    if (item.length === 1 && item[0] === 0) {
      encoded = concatUint8Arrays(encoded, new Uint8Array([0]));
    } else if (item.length === 1 && item[0] < 0x80) {
      encoded = concatUint8Arrays(encoded, item);
    } else {
      const prefix = 0x80 + item.length;
      encoded = concatUint8Arrays(encoded, new Uint8Array([prefix]));
      encoded = concatUint8Arrays(encoded, item);
    }
  }

  const arrayPrefix = 0xc0 + encoded.length;
  return concatUint8Arrays(new Uint8Array([arrayPrefix]), encoded);
}

function concatUint8Arrays(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}