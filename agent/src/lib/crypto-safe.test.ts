/**
 * Unit tests for safe crypto wrapper functions.
 * Tests error recovery, safe operations, and validation suggestions.
 */

import { describe, it, expect } from 'vitest';
import {
  safelyDeriveAddress,
  safelySignHash,
  safelyEncodeTransaction,
  validatePrivateKeyWithSuggestions,
} from './crypto-safe';

describe('safelyDeriveAddress', () => {
  const validPrivateKey = '0x' + '01'.repeat(32);

  it('should successfully derive address for valid private key', () => {
    const result = safelyDeriveAddress(validPrivateKey);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data).toMatch(/^0x[a-f0-9]{40}$/i);
    expect(result.error).toBeUndefined();
  });

  it('should return error for zero private key', () => {
    const result = safelyDeriveAddress('0x' + '00'.repeat(32));
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.errorCode).toBe('INVALID_PRIVATE_KEY');
    expect(result.data).toBeUndefined();
  });

  it('should return error for invalid hex format', () => {
    const result = safelyDeriveAddress('0xGG' + 'ab'.repeat(15));
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.errorCode).toBe('INVALID_HEX');
  });

  it('should return error for key exceeding order', () => {
    const result = safelyDeriveAddress('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.errorCode).toBe('INVALID_PRIVATE_KEY');
  });

  it('should handle any error gracefully', () => {
    const result = safelyDeriveAddress('invalid');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('safelySignHash', () => {
  const validHash = '0x' + 'ab'.repeat(32);
  const validPrivateKey = '0x' + '01'.repeat(32);

  it('should successfully sign hash for valid inputs', () => {
    const result = safelySignHash(validHash, validPrivateKey);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.r).toBeDefined();
    expect(result.data?.s).toBeDefined();
    expect(result.data?.v).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('should return error for invalid hash', () => {
    const result = safelySignHash('0x' + 'ab'.repeat(16), validPrivateKey);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.errorCode).toBe('INVALID_HEX');
  });

  it('should return error for invalid private key', () => {
    const result = safelySignHash(validHash, '0x' + '00'.repeat(32));
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.errorCode).toBe('INVALID_PRIVATE_KEY');
  });

  it('should handle signature errors', () => {
    const result = safelySignHash('0xGG' + 'ab'.repeat(15), validPrivateKey);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('safelyEncodeTransaction', () => {
  const validTx = {
    nonce: '0x00',
    gasPrice: '0xff',
    gas: '0x5208',
    to: '0x1234567890123456789012345678901234567890',
    value: '0x00',
    data: '0x',
    chainId: '0x2a',
  };

  it('should successfully encode valid transaction', () => {
    const result = safelyEncodeTransaction(validTx);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.error).toBeUndefined();
  });

  it('should return error for missing required field', () => {
    const incompleteTx = { ...validTx };
    delete (incompleteTx as Partial<typeof validTx>).nonce;
    const result = safelyEncodeTransaction(incompleteTx as typeof validTx);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.errorCode).toBe('INVALID_TRANSACTION_FIELD');
  });

  it('should return error for invalid field', () => {
    const invalidTx = { ...validTx, gasPrice: 'INVALID_HEX' };
    const result = safelyEncodeTransaction(invalidTx as typeof validTx);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.errorCode).toMatch(/INVALID|ENCODING_FAILED/);
  });

  it('should handle encoding errors gracefully', () => {
    const badTx = { ...validTx, gas: '0xZZ' };
    const result = safelyEncodeTransaction(badTx as typeof validTx);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('validatePrivateKeyWithSuggestions', () => {
  it('should validate correct private key', () => {
    const result = validatePrivateKeyWithSuggestions('0x' + '01'.repeat(32));
    expect(result.isValid).toBe(true);
    expect(result.problem).toBeUndefined();
    expect(result.suggestion).toBeUndefined();
  });

  it('should reject null or undefined', () => {
    const result = validatePrivateKeyWithSuggestions(null as unknown as string);
    expect(result.isValid).toBe(false);
    expect(result.problem).toBeDefined();
    expect(result.suggestion).toBeDefined();
  });

  it('should reject wrong length with helpful message', () => {
    const result = validatePrivateKeyWithSuggestions('0x' + 'ab'.repeat(16));
    expect(result.isValid).toBe(false);
    expect(result.problem).toContain('length');
    expect(result.suggestion).toContain('32 bytes');
  });

  it('should reject invalid hex characters', () => {
    const result = validatePrivateKeyWithSuggestions('0xGG' + 'ab'.repeat(15));
    expect(result.isValid).toBe(false);
    expect(result.problem).toContain('hex');
    expect(result.suggestion).toContain('0-9');
  });

  it('should reject zero private key', () => {
    const result = validatePrivateKeyWithSuggestions('0x' + '00'.repeat(32));
    expect(result.isValid).toBe(false);
    expect(result.problem).toContain('zero');
    expect(result.suggestion).toContain('valid secp256k1');
  });

  it('should reject key exceeding order', () => {
    const result = validatePrivateKeyWithSuggestions('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    expect(result.isValid).toBe(false);
    expect(result.problem).toContain('exceeds');
    expect(result.suggestion).toContain('less than');
  });

  it('should provide guidance for empty string', () => {
    const result = validatePrivateKeyWithSuggestions('');
    expect(result.isValid).toBe(false);
    expect(result.problem).toBeDefined();
    expect(result.suggestion).toBeDefined();
  });

  it('should provide guidance for no prefix', () => {
    const validKeyWithoutPrefix = '01'.repeat(32);
    const result = validatePrivateKeyWithSuggestions(validKeyWithoutPrefix);
    expect(result.isValid).toBe(true);
  });
});

describe('Safe wrapper functions - integration', () => {
  it('should handle full workflow safely', () => {
    const privateKey = '0x' + '02'.repeat(32);
    const txHash = '0x' + 'cc'.repeat(32);

    const addressResult = safelyDeriveAddress(privateKey);
    expect(addressResult.success).toBe(true);

    const signResult = safelySignHash(txHash, privateKey);
    expect(signResult.success).toBe(true);

    const validation = validatePrivateKeyWithSuggestions(privateKey);
    expect(validation.isValid).toBe(true);
  });

  it('should handle errors in mixed workflow', () => {
    const invalidPrivateKey = '0x' + '00'.repeat(32);
    const validTxHash = '0x' + 'cc'.repeat(32);

    const addressResult = safelyDeriveAddress(invalidPrivateKey);
    expect(addressResult.success).toBe(false);

    const signResult = safelySignHash(validTxHash, invalidPrivateKey);
    expect(signResult.success).toBe(false);

    const validation = validatePrivateKeyWithSuggestions(invalidPrivateKey);
    expect(validation.isValid).toBe(false);
    expect(validation.problem).toBeDefined();
  });
});
