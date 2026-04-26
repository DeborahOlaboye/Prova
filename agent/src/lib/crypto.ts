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
