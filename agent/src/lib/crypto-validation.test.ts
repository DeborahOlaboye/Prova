/**
 * Unit tests for crypto validation and error handling.
 * Tests all validation utilities and error types.
 */

import { describe, it, expect } from 'vitest';
import {
  validateHexString,
  validateHexLength,
  validatePrivateKey,
  validateAddress,
  validateTransactionHash,
  validatePublicKeyPoint,
  validateSignatureComponents,
  validateTransactionObject,
} from './crypto-validation';
import {
  CryptoError,
  InvalidHexError,
  InvalidPrivateKeyError,
  SignatureError,
  EllipticCurveError,
} from './errors';

describe('CryptoError Types', () => {
  it('should create CryptoError with code and cause', () => {
    const cause = new Error('test cause');
    const error = new CryptoError('test message', 'TEST_CODE', cause);
    expect(error.message).toBe('test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.cause).toBe(cause);
    expect(error.name).toBe('CryptoError');
  });

  it('should create InvalidHexError with correct type', () => {
    const error = new InvalidHexError('test message');
    expect(error.message).toBe('test message');
    expect(error.code).toBe('INVALID_HEX');
    expect(error.name).toBe('InvalidHexError');
    expect(error instanceof CryptoError).toBe(true);
  });

  it('should create InvalidPrivateKeyError with correct type', () => {
    const error = new InvalidPrivateKeyError('test message');
    expect(error.message).toBe('test message');
    expect(error.code).toBe('INVALID_PRIVATE_KEY');
    expect(error.name).toBe('InvalidPrivateKeyError');
    expect(error instanceof CryptoError).toBe(true);
  });

  it('should create SignatureError with correct type', () => {
    const error = new SignatureError('test message');
    expect(error.message).toBe('test message');
    expect(error.code).toBe('SIGNATURE_FAILED');
    expect(error.name).toBe('SignatureError');
    expect(error instanceof CryptoError).toBe(true);
  });

  it('should create EllipticCurveError with correct type', () => {
    const error = new EllipticCurveError('test message');
    expect(error.message).toBe('test message');
    expect(error.code).toBe('ELLIPTIC_CURVE_FAILED');
    expect(error.name).toBe('EllipticCurveError');
    expect(error instanceof CryptoError).toBe(true);
  });
});

describe('validateHexString', () => {
  it('should accept valid hex strings', () => {
    expect(() => validateHexString('0xabc123')).not.toThrow();
    expect(() => validateHexString('0xDEF456')).not.toThrow();
    expect(() => validateHexString('0x00')).not.toThrow();
  });

  it('should reject non-string inputs', () => {
    expect(() => validateHexString(123 as unknown as string)).toThrow(InvalidHexError);
    expect(() => validateHexString(null as unknown as string)).toThrow(InvalidHexError);
  });

  it('should reject empty strings', () => {
    expect(() => validateHexString('')).toThrow(InvalidHexError);
    expect(() => validateHexString('0x')).toThrow(InvalidHexError);
  });

  it('should reject odd-length hex', () => {
    expect(() => validateHexString('0xabc')).toThrow(InvalidHexError);
    expect(() => validateHexString('0xabcde')).toThrow(InvalidHexError);
  });

  it('should reject invalid hex characters', () => {
    expect(() => validateHexString('0xGHIJ')).toThrow(InvalidHexError);
    expect(() => validateHexString('0x12ZZ')).toThrow(InvalidHexError);
  });
});

describe('validateHexLength', () => {
  it('should accept hex strings of correct byte length', () => {
    expect(() => validateHexLength('0xabcd', 2)).not.toThrow();
    expect(() => validateHexLength('0x' + 'ab'.repeat(32), 32)).not.toThrow();
  });

  it('should reject hex strings of incorrect byte length', () => {
    expect(() => validateHexLength('0xab', 2)).toThrow(InvalidHexError);
    expect(() => validateHexLength('0x' + 'ab'.repeat(16), 32)).toThrow(InvalidHexError);
  });
});

describe('validatePrivateKey', () => {
  const validKey = '0x' + '01'.repeat(32);
  const keyTooLarge = '0x' + 'ff'.repeat(32);

  it('should accept valid private keys', () => {
    expect(() => validatePrivateKey(validKey)).not.toThrow();
  });

  it('should reject private key with zero value', () => {
    expect(() => validatePrivateKey('0x' + '00'.repeat(32))).toThrow(InvalidPrivateKeyError);
  });

  it('should reject private key that exceeds secp256k1 order', () => {
    expect(() => validatePrivateKey(keyTooLarge)).toThrow(InvalidPrivateKeyError);
  });

  it('should reject private key not 32 bytes', () => {
    expect(() => validatePrivateKey('0x' + 'ab'.repeat(16))).toThrow(InvalidHexError);
    expect(() => validatePrivateKey('0x' + 'ab'.repeat(64))).toThrow(InvalidHexError);
  });
});

describe('validateAddress', () => {
  it('should accept valid Ethereum addresses', () => {
    expect(() => validateAddress('0x1234567890123456789012345678901234567890')).not.toThrow();
    expect(() => validateAddress('0xaAbBcCdDeEfF00112233445566778899aAbBcCdD')).not.toThrow();
  });

  it('should reject non-string addresses', () => {
    expect(() => validateAddress(123 as unknown as string)).toThrow(InvalidHexError);
  });

  it('should reject addresses with incorrect length', () => {
    expect(() => validateAddress('0x12345')).toThrow(InvalidHexError);
    expect(() => validateAddress('0x' + '01'.repeat(32))).toThrow(InvalidHexError);
  });

  it('should reject addresses with invalid characters', () => {
    expect(() => validateAddress('0xGGGG567890123456789012345678901234567890')).toThrow(InvalidHexError);
  });
});

describe('validateTransactionHash', () => {
  it('should accept valid 32-byte hashes', () => {
    expect(() => validateTransactionHash('0x' + 'ab'.repeat(32))).not.toThrow();
  });

  it('should reject hashes not 32 bytes', () => {
    expect(() => validateTransactionHash('0x' + 'ab'.repeat(16))).toThrow(InvalidHexError);
    expect(() => validateTransactionHash('0x' + 'ab'.repeat(64))).toThrow(InvalidHexError);
  });
});

describe('validatePublicKeyPoint', () => {
  it('should accept valid point coordinates', () => {
    const validX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
    const validY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;
    expect(() => validatePublicKeyPoint(validX, validY)).not.toThrow();
  });

  it('should reject negative coordinates', () => {
    expect(() => validatePublicKeyPoint(-1n, 100n)).toThrow();
  });

  it('should reject coordinates out of field range', () => {
    const outOfRange = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC30n;
    expect(() => validatePublicKeyPoint(outOfRange, 100n)).toThrow();
  });
});

describe('validateSignatureComponents', () => {
  it('should accept valid signature components', () => {
    const r = 1n;
    const s = 2n;
    const v = 27;
    expect(() => validateSignatureComponents(r, s, v)).not.toThrow();
  });

  it('should reject zero r value', () => {
    expect(() => validateSignatureComponents(0n, 2n, 27)).toThrow();
  });

  it('should reject zero s value', () => {
    expect(() => validateSignatureComponents(1n, 0n, 27)).toThrow();
  });

  it('should reject invalid v values', () => {
    expect(() => validateSignatureComponents(1n, 2n, 26)).toThrow();
    expect(() => validateSignatureComponents(1n, 2n, 29)).toThrow();
    expect(() => validateSignatureComponents(1n, 2n, 0)).toThrow();
  });

  it('should accept v value of 27 or 28', () => {
    expect(() => validateSignatureComponents(1n, 2n, 27)).not.toThrow();
    expect(() => validateSignatureComponents(1n, 2n, 28)).not.toThrow();
  });
});

describe('validateTransactionObject', () => {
  const validTx = {
    nonce: '0x00',
    gasPrice: '0xff',
    gas: '0x5208',
    to: '0x1234567890123456789012345678901234567890',
    value: '0x00',
    data: '0x',
    chainId: '0x2a',
  };

  it('should accept valid transaction objects', () => {
    expect(() => validateTransactionObject(validTx)).not.toThrow();
  });

  it('should reject null or non-object inputs', () => {
    expect(() => validateTransactionObject(null as unknown as typeof validTx)).toThrow(InvalidHexError);
    expect(() => validateTransactionObject({} as unknown as typeof validTx)).toThrow(InvalidHexError);
  });

  it('should reject transactions with missing fields', () => {
    const {nonce, ...incomplete} = validTx;
    expect(() => validateTransactionObject(incomplete as unknown as typeof validTx)).toThrow(InvalidHexError);
  });

  it('should reject transactions with invalid field values', () => {
    const invalidTx = { ...validTx, gasPrice: 'INVALID' };
    expect(() => validateTransactionObject(invalidTx as unknown as typeof validTx)).toThrow(InvalidHexError);
  });
});
