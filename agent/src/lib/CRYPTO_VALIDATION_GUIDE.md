# Crypto Module - Validation & Error Handling Guide

## Overview

The crypto module has been significantly enhanced with comprehensive validation, specific error types, and safe wrapper functions for robust cryptographic operations.

## New Features

### 1. Specific Error Types

All crypto operations now throw specific, typed errors instead of generic `Error` objects:

- **`CryptoError`**: Base class for all cryptographic errors
  - `code`: Error code for programmatic handling
  - `cause`: Optional nested error for debugging

- **`InvalidHexError`**: Thrown when hex string format is invalid
  - Invalid characters, odd length, or empty string
  - Error code: `INVALID_HEX`

- **`InvalidPrivateKeyError`**: Thrown when private key validation fails
  - Key length not 32 bytes, value is zero, or exceeds secp256k1 order
  - Error code: `INVALID_PRIVATE_KEY`

- **`SignatureError`**: Thrown when signature generation fails
  - r or s components are zero, or invalid k value
  - Error code: `SIGNATURE_FAILED`

- **`EllipticCurveError`**: Thrown when elliptic curve operations fail
  - Point addition or scalar multiplication errors
  - Error code: `ELLIPTIC_CURVE_FAILED`

### 2. Validation Utilities

Comprehensive validation functions available in `crypto-validation.ts`:

```typescript
// Hex string validation
validateHexString(value: string, paramName?: string): void
validateHexLength(value: string, expectedBytes: number, paramName?: string): void

// Key validation
validatePrivateKey(privateKey: string): void
validateAddress(address: string): void
validateTransactionHash(txHash: string): void

// Cryptographic validation
validatePublicKeyPoint(x: bigint, y: bigint): void
validateSignatureComponents(r: bigint, s: bigint, v: number): void

// Transaction validation
validateTransactionObject(tx: TransactionObject): void
```

### 3. Safe Wrapper Functions

Low-risk alternatives to core functions with error recovery:

```typescript
import { safelyDeriveAddress, safelySignHash, safelyEncodeTransaction } from './crypto-safe';

// Returns SafeOperationResult<T> instead of throwing
const result = safelyDeriveAddress(privateKey);
if (result.success) {
  console.log('Address:', result.data);
} else {
  console.error('Error:', result.error, 'Code:', result.errorCode);
}
```

### 4. Validation Suggestions

Get actionable feedback for invalid inputs:

```typescript
import { validatePrivateKeyWithSuggestions } from './crypto-safe';

const result = validatePrivateKeyWithSuggestions(userInput);
if (!result.isValid) {
  console.error(result.problem);      // User-friendly error message
  console.log(result.suggestion);      // How to fix it
}
```

## Usage Examples

### Basic Usage with Error Handling

```typescript
import { deriveAddress, InvalidPrivateKeyError } from './crypto';

try {
  const address = deriveAddress('0x...');
  console.log('Address:', address);
} catch (error) {
  if (error instanceof InvalidPrivateKeyError) {
    console.error('Invalid private key:', error.message);
  } else if (error instanceof InvalidHexError) {
    console.error('Invalid hex format:', error.message);
  }
}
```

### Safe Wrapper Usage

```typescript
import { safelyDeriveAddress, validatePrivateKeyWithSuggestions } from './crypto-safe';

// First, validate the input
const validation = validatePrivateKeyWithSuggestions(userInput);
if (!validation.isValid) {
  showError(validation.suggestion);
  return;
}

// Then safely derive address
const result = safelyDeriveAddress(userInput);
if (result.success) {
  useAddress(result.data);
} else {
  showError(result.error?.message);
}
```

### Transaction Encoding with Validation

```typescript
import { encodeTransaction, validateTransactionObject } from './crypto';

const tx = {
  nonce: '0x00',
  gasPrice: '0x3b9aca00',
  gas: '0x5208',
  to: '0x1234567890123456789012345678901234567890',
  value: '0x0',
  data: '0x',
  chainId: '0x01',
};

// Validate first
try {
  validateTransactionObject(tx);
  const encoded = encodeTransaction(tx);
  // Use encoded transaction
} catch (error) {
  console.error('Transaction validation failed:', error.message);
}
```

### Signing with Complete Error Handling

```typescript
import {
  signHash,
  InvalidPrivateKeyError,
  InvalidHexError,
  SignatureError,
} from './crypto';

const txHash = '0x...';
const privateKey = '0x...';

try {
  const sig = signHash(txHash, privateKey);
  console.log(`r: ${sig.r}, s: ${sig.s}, v: ${sig.v}`);
} catch (error) {
  if (error instanceof InvalidPrivateKeyError) {
    console.error('Private key validation failed');
  } else if (error instanceof InvalidHexError) {
    console.error('Input format error');
  } else if (error instanceof SignatureError) {
    console.error('Signature generation failed');
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Error Codes Reference

| Error Type | Code | Cause |
|-----------|------|-------|
| InvalidHexError | INVALID_HEX | Invalid hex format, odd length, or invalid characters |
| InvalidPrivateKeyError | INVALID_PRIVATE_KEY | Invalid key length, zero value, or exceeds order |
| SignatureError | SIGNATURE_FAILED | r/s components are zero or k value invalid |
| EllipticCurveError | ELLIPTIC_CURVE_FAILED | Point addition or scalar multiplication failed |

## Migration Guide

### If upgrading from old code:

**Before:**
```typescript
try {
  const address = deriveAddress(key);
} catch (error) {
  // Generic Error type, no way to distinguish errors
  console.error(error.message);
}
```

**After:**
```typescript
import { deriveAddress, InvalidPrivateKeyError } from './crypto';

try {
  const address = deriveAddress(key);
} catch (error) {
  if (error instanceof InvalidPrivateKeyError) {
    // Handle key validation error specifically
  } else {
    // Handle other errors
  }
}
```

## Best Practices

1. **Always validate inputs early**
   ```typescript
   validateHexString(userInput, 'privateKey');
   validateAddress(addressInput);
   ```

2. **Use specific error types**
   ```typescript
   } catch (error) {
     if (error instanceof InvalidPrivateKeyError) { /* ... */ }
     if (error instanceof InvalidHexError) { /* ... */ }
   }
   ```

3. **Use safe wrappers in user-facing code**
   ```typescript
   // For APIs or UI that shouldn't crash
   const result = safelyDeriveAddress(userInput);
   ```

4. **Get suggestions for better UX**
   ```typescript
   const validation = validatePrivateKeyWithSuggestions(userInput);
   if (!validation.isValid) {
     showUserMessage(validation.suggestion); // Helpful, actionable message
   }
   ```

5. **Re-export for convenience**
   ```typescript
   // Easier for consumers
   import { validateHexString, InvalidHexError } from './crypto';
   // Instead of
   // import { validateHexString } from './crypto-validation';
   // import { InvalidHexError } from './errors';
   ```

## Test Coverage

Comprehensive test suites ensure reliability:

- `crypto.test.ts` - Core crypto function tests
- `crypto-validation.test.ts` - Validation function tests (235+ test cases)
- `crypto-safe.test.ts` - Safe wrapper function tests

Run tests with:
```bash
npm test -- src/lib/crypto*.test.ts
```

## Performance Considerations

- Validation is optimized for early rejection of invalid inputs
- No unnecessary allocations in hot paths
- Keccak-256 implementation is pure JavaScript (suitable for edge environments)

## Future Improvements

- [ ] Add batch validation for multiple transactions
- [ ] Implement caching for repeated address derivations
- [ ] Add support for hardware wallet integration
- [ ] Performance metrics for signature operations
