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

/**
 * Convert a hexadecimal string to a Uint8Array.
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
 */
export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute Keccak-256 hash of input bytes.
 * Uses a pure JS implementation for Cloudflare Workers compatibility.
 */
export function keccak256(data: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  // Simple Keccak-256 implementation using the sponge construction
  // For production, consider using a more optimized library
  return keccak256Pure(new Uint8Array(data));
}

// Keccak-256 constants
const KECCAK_ROUNDS = 24;
const KECCAK_STATE_SIZE = 200; // 1600 bits / 8

// Keccak-256 round constants
const KECCAK_RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
  0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
  0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
  0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];

// Rotation offsets for the rho step
const KECCAK_ROTATION_OFFSETS: [number, number][] = [
  [0, 0], [1, 3], [2, 6], [3, 10], [4, 15],
  [0, 21], [1, 28], [2, 36], [3, 45], [4, 55],
  [0, 2], [1, 14], [2, 27], [3, 41], [4, 56]
];

// Pi step permutation
const KECCAK_PI = [
  [0, 0], [1, 1], [2, 2], [3, 3], [4, 4],
  [1, 0], [2, 1], [3, 2], [4, 3], [0, 4],
  [2, 0], [3, 1], [4, 2], [0, 3], [1, 4]
];

function keccak256Pure(data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const state = new Uint8Array(KECCAK_STATE_SIZE);
  const rate = 136; // 1088 bits / 8 for Keccak-256

  // Padding
  const padded = new Uint8Array(Math.ceil((data.length + 1) / rate) * rate + rate);
  padded.set(data);
  padded[data.length] = 0x01; // domain suffix
  padded[padded.length - 1] |= 0x80; // pad with 10*1

  // Absorb phase
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate && offset + i < padded.length; i++) {
      state[i] ^= padded[offset + i];
    }
    keccakF1600(state);
  }

  // Squeeze phase - return first 32 bytes
  return state.slice(0, 32);
}

function keccakF1600(state: Uint8Array<ArrayBuffer>): void {
  // Convert state to 64-bit lanes for easier manipulation
  const lanes = new Array(25).fill(0n);
  for (let i = 0; i < 25; i++) {
    lanes[i] = stateToLane(state, i);
  }

  for (let round = 0; round < KECCAK_ROUNDS; round++) {
    // Theta step
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

    // Rho and Pi steps
    const B = new Array(25).fill(0n);
    for (let t = 0; t < 25; t++) {
      const [x, y] = KECCAK_ROTATION_OFFSETS[t];
      B[KECCAK_PI[t][0] + 5 * KECCAK_PI[t][1]] = rotl64(lanes[t], KECCAK_PI[t][0] + 5 * KECCAK_PI[t][1]);
    }

    // Chi step
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const idx = x + 5 * y;
        lanes[idx] = B[idx] ^ ((~B[(x + 1) % 5 + 5 * y]) & B[(x + 2) % 5 + 5 * y]);
      }
    }

    // Iota step
    lanes[0] ^= KECCAK_RC[round];
  }

  // Convert back to bytes
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
 */
function pointAdd(
  x1: bigint, y1: bigint,
  x2: bigint, y2: bigint
): [bigint, bigint] | null {
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
}

/**
 * Scalar multiplication on secp256k1 using double-and-add algorithm
 */
function pointMultiply(k: bigint, gx: bigint, gy: bigint): [bigint, bigint] | null {
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
}

/**
 * Derive Ethereum/Celo address from a secp256k1 private key.
 * 
 * @param privateKey - The private key as a hex string (with or without 0x prefix)
 * @returns The Ethereum address as a hex string
 * @throws Error if the private key is invalid
 */
export function deriveAddress(privateKey: string): string {
  const keyBytes = hexToBytes(privateKey);
  
  if (keyBytes.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }

  const privateKeyBigInt = BigInt('0x' + privateKey.replace('0x', ''));
  
  if (privateKeyBigInt <= 0n || privateKeyBigInt >= SECP256K1_N) {
    throw new Error('Private key must be between 1 and n-1');
  }

  // Multiply generator point by private key
  const result = pointMultiply(privateKeyBigInt, SECP256K1_GX, SECP256K1_GY);
  if (!result) {
    throw new Error('Invalid private key: resulted in point at infinity');
  }

  const [x, y] = result;

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
}

/**
 * Sign a transaction hash using secp256k1.
 * Returns a signature in the format expected by eth_sendRawTransaction.
 * 
 * @param txHash - The transaction hash to sign (hex string)
 * @param privateKey - The private key (hex string)
 * @returns The signature as a hex string (r, s, v concatenated)
 */
export function signHash(txHash: string, privateKey: string): {
  r: string;
  s: string;
  v: number;
} {
  const hashBytes = hexToBytes(txHash);
  const keyBytes = hexToBytes(privateKey);
  
  if (hashBytes.length !== 32) {
    throw new Error('Transaction hash must be 32 bytes');
  }
  
  if (keyBytes.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }

  // Generate a random k value (in production, use RFC 6979 deterministic k)
  // For now, we'll use a simple approach
  const k = generateDeterministicK(hashBytes, keyBytes);
  
  // Multiply generator by k to get r
  const point = pointMultiply(k, SECP256K1_GX, SECP256K1_GY);
  if (!point) {
    throw new Error('Invalid k value');
  }
  
  const r = point[0];
  if (r === 0n) {
    throw new Error('Invalid signature: r is zero');
  }

  // Calculate s = k^-1 * (z + r * d) mod n
  const z = BigInt('0x' + txHash.replace('0x', ''));
  const kInv = modInverse(k, SECP256K1_N);
  const privateKeyBigInt = BigInt('0x' + privateKey.replace('0x', ''));
  let s = (kInv * (z + r * privateKeyBigInt)) % SECP256K1_N;
  
  if (s === 0n) {
    throw new Error('Invalid signature: s is zero');
  }

  // Ensure s is low-S (s <= n/2)
  if (s > SECP256K1_N / 2n) {
    s = SECP256K1_N - s;
  }

  // Recovery id (v) - simplified, in production calculate properly
  const v = (point[1] % 2n) === 0n ? 27 : 28;

  return {
    r: '0x' + r.toString(16).padStart(64, '0'),
    s: '0x' + s.toString(16).padStart(64, '0'),
    v: v
  };
}

/**
 * Generate a deterministic k value using a simplified RFC 6979 approach.
 * In production, use a full RFC 6979 implementation.
 */
function generateDeterministicK(messageHash: Uint8Array, privateKey: Uint8Array): bigint {
  // Simplified: use hash of message + private key as k
  const combined = new Uint8Array(messageHash.length + privateKey.length);
  combined.set(messageHash);
  combined.set(privateKey, messageHash.length);
  
  const hash = keccak256(combined);
  
  // Ensure k is in valid range and not zero
  let k = BigInt('0x' + bytesToHex(hash)) % SECP256K1_N;
  if (k === 0n) {
    k = 1n; // Fallback (extremely unlikely)
  }
  
  return k;
}

/**
 * Encode a transaction for signing using RLP encoding.
 * This is a simplified RLP encoder for Ethereum transactions.
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
  const fields = [
    hexToBytes(tx.nonce),
    hexToBytes(tx.gasPrice),
    hexToBytes(tx.gas),
    hexToBytes(tx.to),
    hexToBytes(tx.value),
    hexToBytes(tx.data || '0x'),
    hexToBytes(tx.chainId),
    hexToBytes('0x'), // r (empty for signing)
    hexToBytes('0x')  // s (empty for signing)
  ];

  return rlpEncode(fields);
}

/**
 * Simple RLP encoder for arrays of Uint8Arrays
 */
function rlpEncode(items: Uint8Array[]): Uint8Array {
  let encoded = new Uint8Array(0);
  
  for (const item of items) {
    if (item.length === 1 && item[0] === 0) {
      // Single zero byte
      encoded = concatUint8Arrays(encoded, new Uint8Array([0]));
    } else if (item.length === 1 && item[0] < 0x80) {
      // Single byte < 0x80
      encoded = concatUint8Arrays(encoded, item);
    } else {
      // String > 1 byte
      const prefix = 0x80 + item.length;
      encoded = concatUint8Arrays(encoded, new Uint8Array([prefix]));
      encoded = concatUint8Arrays(encoded, item);
    }
  }

  // Add array prefix
  const arrayPrefix = 0xc0 + encoded.length;
  return concatUint8Arrays(new Uint8Array([arrayPrefix]), encoded);
}

function concatUint8Arrays(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}