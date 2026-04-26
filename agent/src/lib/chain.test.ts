/**
 * Unit tests for chain utilities.
 * Tests transaction validation, error handling, and ABI encoding.
 */

import { describe, it, expect } from 'vitest';
import {
  encodeMarkCompleted,
  encodeMarkDisputed,
  encodeMarkRefunded,
  encodeReleaseFunds,
  encodeRefundFunds,
  encodeEscalateToArbiters,
  encodeRecordCompletion,
} from './chain';

describe('ABI encoding functions', () => {
  const testJobId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  describe('encodeMarkCompleted', () => {
    it('should encode markCompleted function call', () => {
      const result = encodeMarkCompleted(testJobId);
      expect(result).toBe('0x375b8f5e' + testJobId.replace('0x', ''));
    });

    it('should pad jobId to 64 hex chars', () => {
      const shortId = '0xabc';
      const result = encodeMarkCompleted(shortId);
      expect(result).toBe('0x375b8f5e0000000000000000000000000000000000000000000000000000000000000abc');
    });
  });

  describe('encodeMarkDisputed', () => {
    it('should encode markDisputed function call', () => {
      const result = encodeMarkDisputed(testJobId);
      expect(result).toBe('0x8a5e7c0d' + testJobId.replace('0x', ''));
    });
  });

  describe('encodeMarkRefunded', () => {
    it('should encode markRefunded function call', () => {
      const result = encodeMarkRefunded(testJobId);
      expect(result).toBe('0x9b3f6a1c' + testJobId.replace('0x', ''));
    });
  });

  describe('encodeReleaseFunds', () => {
    it('should encode releaseFunds function call', () => {
      const result = encodeReleaseFunds(testJobId);
      expect(result).toBe('0x84b0196e' + testJobId.replace('0x', ''));
    });
  });

  describe('encodeRefundFunds', () => {
    it('should encode refundFunds function call', () => {
      const result = encodeRefundFunds(testJobId);
      expect(result).toBe('0x278ecde1' + testJobId.replace('0x', ''));
    });
  });

  describe('encodeEscalateToArbiters', () => {
    it('should encode escalateToArbiters function call', () => {
      const result = encodeEscalateToArbiters(testJobId);
      expect(result).toBe('0x5c19a95c' + testJobId.replace('0x', ''));
    });
  });

  describe('encodeRecordCompletion', () => {
    it('should encode recordCompletion function call', () => {
      const freelancer = '0x1234567890123456789012345678901234567890';
      const jobId = testJobId;
      const rating = 80;
      const amount = BigInt('10000000000000000000'); // 10 cUSD

      const result = encodeRecordCompletion(freelancer, jobId, rating, amount);

      expect(result.startsWith('0x3ccfd60b')).toBe(true);
      expect(result.length).toBe(10 + 64 * 4); // selector + 4 params
    });

    it('should handle zero rating', () => {
      const freelancer = '0x1234567890123456789012345678901234567890';
      const jobId = testJobId;
      const rating = 0;
      const amount = BigInt('10000000000000000000');

      const result = encodeRecordCompletion(freelancer, jobId, rating, amount);
      expect(result).toBeDefined();
    });

    it('should handle maximum rating', () => {
      const freelancer = '0x1234567890123456789012345678901234567890';
      const jobId = testJobId;
      const rating = 100;
      const amount = BigInt('10000000000000000000');

      const result = encodeRecordCompletion(freelancer, jobId, rating, amount);
      expect(result).toBeDefined();
    });
  });
});