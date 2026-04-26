/**
 * Unit tests for cryptographic utilities.
 * Tests secp256k1 address derivation, Keccak-256 hashing, and transaction signing.
 * 
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import {
  hexToBytes,
  bytesToHex,
  keccak256,
  deriveAddress,
  signHash,
} from './crypto';

/**
 * Encode string to Uint8Array (polyfill for environments without TextEncoder)
 */
function stringToBytes(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

describe('hexToBytes', () => {
  it('should convert hex string to bytes', () => {
    const result = hexToBytes('0xdeadbeef');
    expect(result).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('should convert hex string without 0x prefix', () => {
    const result = hexToBytes('deadbeef');
    expect(result).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('should throw on odd length hex string', () => {
    expect(() => hexToBytes('0xdeadb')).toThrow('Invalid hex string: odd length');
  });

  it('should handle empty string', () => {
    const result = hexToBytes('0x');
    expect(result).toEqual(new Uint8Array([]));
  });
});

describe('bytesToHex', () => {
  it('should convert bytes to hex string', () => {
    const result = bytesToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    expect(result).toBe('0xdeadbeef');
  });

  it('should handle single byte', () => {
    const result = bytesToHex(new Uint8Array([0x0a]));
    expect(result).toBe('0x0a');
  });

  it('should handle empty array', () => {
    const result = bytesToHex(new Uint8Array([]));
    expect(result).toBe('0x');
  });

  it('should pad single digit bytes', () => {
    const result = bytesToHex(new Uint8Array([0x00, 0x0f, 0x10]));
    expect(result).toBe('0x000f10');
  });
});

describe('keccak256', () => {
  it('should compute keccak256 hash of empty input', () => {
    const result = keccak256(new Uint8Array([]));
    // Keccak-256 of empty input
    const expected = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';
    expect(bytesToHex(result)).toBe(expected);
  });

  it('should compute keccak256 hash of "hello"', () => {
    const input = stringToBytes('hello');
    const result = keccak256(input);
    // Keccak-256 of "hello"
    const expected = '0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8';
    expect(bytesToHex(result)).toBe(expected);
  });

  it('should produce consistent hashes', () => {
    const input1 = stringToBytes('test');
    const input2 = stringToBytes('test');
    const hash1 = keccak256(input1);
    const hash2 = keccak256(input2);
    expect(bytesToHex(hash1)).toBe(bytesToHex(hash2));
  });

  it('should produce different hashes for different inputs', () => {
    const input1 = stringToBytes('hello');
    const input2 = stringToBytes('world');
    const hash1 = keccak256(input1);
    const hash2 = keccak256(input2);
    expect(bytesToHex(hash1)).not.toBe(bytesToHex(hash2));
  });
});

describe('deriveAddress', () => {
  // Known test vectors from Ethereum
  const TEST_VECTORS = [
    {
      privateKey: '0x4c0883a69102937d6231471b5dbb6204fe512961708279f8c5d3b0d3b3e1c5a7',
      expectedAddress: '0xb4fA75bf4aC714f6F30E47B309475dA8Ed84166C',
    },
    {
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      expectedAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    },
    {
      privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      expectedAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    },
  ];

  it('should derive correct address from known private key', () => {
    for (const vector of TEST_VECTORS) {
      const address = deriveAddress(vector.privateKey);
      expect(address.toLowerCase()).toBe(vector.expectedAddress.toLowerCase());
    }
  });

  it('should throw on invalid private key length', () => {
    expect(() => deriveAddress('0xdeadbeef')).toThrow('Private key must be 32 bytes');
  });

  it('should throw on zero private key', () => {
    const zeroKey = '0x' + '00'.repeat(32);
    expect(() => deriveAddress(zeroKey)).toThrow('Private key must be between 1 and n-1');
  });

  it('should throw on private key >= n', () => {
    const nKey = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141';
    expect(() => deriveAddress(nKey)).toThrow('Private key must be between 1 and n-1');
  });

  it('should accept private key without 0x prefix', () => {
    const address1 = deriveAddress('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    const address2 = deriveAddress('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    expect(address1).toBe(address2);
  });
});

describe('signHash', () => {
  it('should produce valid signature components', () => {
    const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const txHash = '0x' + 'ab'.repeat(32);

    const signature = signHash(txHash, privateKey);

    expect(signature.r).toMatch(/^0x[0-9a-f]{64}$/);
    expect(signature.s).toMatch(/^0x[0-9a-f]{64}$/);
    expect([27, 28]).toContain(signature.v);
  });

  it('should throw on invalid tx hash length', () => {
    expect(() => signHash('0xdeadbeef', '0x' + 'ab'.repeat(32))).toThrow('Transaction hash must be 32 bytes');
  });

  it('should throw on invalid private key length', () => {
    const txHash = '0x' + 'ab'.repeat(32);
    expect(() => signHash(txHash, '0xdeadbeef')).toThrow('Private key must be 32 bytes');
  });

  it('should produce deterministic signatures', () => {
    const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const txHash = '0x' + 'ab'.repeat(32);

    const sig1 = signHash(txHash, privateKey);
    const sig2 = signHash(txHash, privateKey);

    expect(sig1.r).toBe(sig2.r);
    expect(sig1.s).toBe(sig2.s);
    expect(sig1.v).toBe(sig2.v);
  });
});