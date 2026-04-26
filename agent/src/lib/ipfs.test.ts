import { describe, it, expect } from 'vitest';
import { isValidIPFSHash } from './ipfs';

describe('IPFS utilities', () => {
  describe('isValidIPFSHash', () => {
    it('should validate Qm hash format', () => {
      expect(isValidIPFSHash('QmHash12345678901234567890123456789012345678901234'))
        .toBe(true);
    });

    it('should validate bafy hash format', () => {
      expect(isValidIPFSHash('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'))
        .toBe(true);
    });

    it('should handle ipfs:// prefix', () => {
      expect(isValidIPFSHash('ipfs://QmHash12345678901234567890123456789012345678901234'))
        .toBe(true);
    });

    it('should reject invalid hash', () => {
      expect(isValidIPFSHash('invalid')).toBe(false);
    });
  });
});
