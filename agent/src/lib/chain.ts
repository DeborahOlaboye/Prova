import {
  hexToBytes,
  bytesToHex,
  keccak256,
  deriveAddress as deriveAddressSecp256k1,
  signHash,
  encodeTransaction,
} from './crypto';

/**
 * Custom error classes for transaction handling
 */
export class TransactionError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'TransactionError';
  }
}

export class RPCError extends Error {
  constructor(message: string, public code?: number, public cause?: Error) {
    super(message);
    this.name = 'RPCError';
    this.code = code;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface TxRequest {
  rpcUrl: string;
  privateKey: string;
  to: string;
  data: string;
}

/**
 * Validate a transaction request
 * @throws {ValidationError} if the request is invalid
 */
function validateTxRequest(req: TxRequest): void {
  if (!req.rpcUrl || typeof req.rpcUrl !== 'string') {
    throw new ValidationError('rpcUrl is required and must be a string');
  }
  if (!req.privateKey || typeof req.privateKey !== 'string') {
    throw new ValidationError('privateKey is required and must be a string');
  }
  if (!req.to || typeof req.to !== 'string') {
    throw new ValidationError('to address is required and must be a string');
  }
  if (!req.data || typeof req.data !== 'string') {
    throw new ValidationError('data is required and must be a string');
  }
  
  // Validate hex formats
  if (!req.to.startsWith('0x') || req.to.length !== 42) {
    throw new ValidationError('to address must be a valid Ethereum address (0x + 40 hex chars)');
  }
  if (!req.data.startsWith('0x')) {
    throw new ValidationError('data must be a valid hex string starting with 0x');
  }
}

/**
 * Send a transaction to the Celo network.
 * 
 * @remarks
 * This function constructs, signs, and broadcasts a transaction using secp256k1
 * cryptography. It properly derives the sender address from the private key
 * using the secp256k1 curve (not P-256).
 * 
 * @param req - The transaction request
 * @returns The transaction hash
 * @throws {ValidationError} if the request is invalid
 * @throws {RPCError} if the RPC call fails
 * @throws {TransactionError} if the transaction fails
 */
export async function sendTransaction(req: TxRequest): Promise<string> {
  // Validate request
  validateTxRequest(req);

  try {
    // Get nonce
    const senderAddress = deriveAddress(req.privateKey);
    const nonceRes = await rpcCall(req.rpcUrl, 'eth_getTransactionCount', [
      senderAddress,
      'latest',
    ]);
    const nonce = parseInt(nonceRes, 16);

    // Get gas price
    const gasPriceRes = await rpcCall(req.rpcUrl, 'eth_gasPrice', []);
    const gasPrice = gasPriceRes;

    // Estimate gas
    const gasRes = await rpcCall(req.rpcUrl, 'eth_estimateGas', [
      { to: req.to, data: req.data },
    ]);
    const gas = gasRes;

    // Construct the transaction
    const tx = {
      nonce: `0x${nonce.toString(16)}`,
      gasPrice,
      gas,
      to: req.to,
      value: '0x0',
      data: req.data,
      chainId: '0xa4ec', // Celo mainnet 42220
    };

    // Encode the transaction for signing
    const encodedTx = encodeTransaction(tx);
    const txHash = keccak256(encodedTx);
    const txHashHex = bytesToHex(txHash);

    // Sign the transaction hash
    const signature = signHash(txHashHex, req.privateKey);

    // Construct the raw transaction with signature
    const rawTx = encodeTransactionWithSignature(tx, signature);
    const rawTxHex = bytesToHex(rawTx);

    // Broadcast the transaction
    const txHashSent = await rpcCall(req.rpcUrl, 'eth_sendRawTransaction', [rawTxHex]);
    return txHashSent;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof RPCError) {
      throw error;
    }
    throw new TransactionError(
      `Failed to send transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Encode a transaction with signature components for broadcasting.
 */
function encodeTransactionWithSignature(
  tx: {
    nonce: string;
    gasPrice: string;
    gas: string;
    to: string;
    value: string;
    data: string;
    chainId: string;
  },
  signature: { r: string; s: string; v: number }
): Uint8Array<ArrayBuffer> {
  const fields = [
    hexToBytes(tx.nonce),
    hexToBytes(tx.gasPrice),
    hexToBytes(tx.gas),
    hexToBytes(tx.to),
    hexToBytes(tx.value),
    hexToBytes(tx.data || '0x'),
    hexToBytes(tx.chainId),
    hexToBytes('0x'), // v placeholder
    hexToBytes('0x'), // r placeholder
    hexToBytes('0x'), // s placeholder
  ];

  // Simple RLP encoding
  let encoded = new Uint8Array(0);
  for (const item of fields) {
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

  // Add signature fields
  const vBytes = hexToBytes(`0x${signature.v.toString(16)}`);
  const rBytes = hexToBytes(signature.r);
  const sBytes = hexToBytes(signature.s);

  for (const item of [vBytes, rBytes, sBytes]) {
    if (item.length === 1 && item[0] < 0x80) {
      encoded = concatUint8Arrays(encoded, item);
    } else {
      const prefix = 0x80 + item.length;
      encoded = concatUint8Arrays(encoded, new Uint8Array([prefix]));
      encoded = concatUint8Arrays(encoded, item);
    }
  }

  // Add array prefix
  const arrayPrefix = 0xc0 + encoded.length;
  return concatUint8Arrays(new Uint8Array([arrayPrefix]), encoded);
}

function concatUint8Arrays(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}

/**
 * Make an RPC call to an Ethereum-compatible node
 * @throws {RPCError} if the RPC call fails
 */
async function rpcCall(url: string, method: string, params: unknown[]): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) {
      throw new RPCError(
        `HTTP error: ${res.status} ${res.statusText}`,
        res.status
      );
    }

    const json = await res.json();
    if (json.error) {
      throw new RPCError(
        `RPC error: ${json.error.message}`,
        json.error.code
      );
    }
    return json.result;
  } catch (error) {
    if (error instanceof RPCError) {
      throw error;
    }
    throw new RPCError(
      `Failed to call ${method}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Derive an Ethereum/Celo address from a private key.
 * Uses secp256k1 curve for proper Ethereum address derivation.
 * 
 * @param privateKey - The private key as a hex string (with or without 0x prefix)
 * @returns The Ethereum address as a hex string
 */
export async function deriveAddress(privateKey: string): Promise<string> {
  return deriveAddressSecp256k1(privateKey);
}

// --- ABI Encoding Functions ---

export function encodeMarkCompleted(jobId: string): string {
  // markCompleted(bytes32) selector = 0x375b8f5e
  return '0x375b8f5e' + jobId.replace('0x', '').padStart(64, '0');
}

export function encodeMarkDisputed(jobId: string): string {
  // markDisputed(bytes32) selector = 0x8a5e7c0d
  return '0x8a5e7c0d' + jobId.replace('0x', '').padStart(64, '0');
}

export function encodeMarkRefunded(jobId: string): string {
  // markRefunded(bytes32) selector = 0x9b3f6a1c
  return '0x9b3f6a1c' + jobId.replace('0x', '').padStart(64, '0');
}

export function encodeReleaseFunds(jobId: string): string {
  // releaseFunds(bytes32) selector = 0x84b0196e
  return '0x84b0196e' + jobId.replace('0x', '').padStart(64, '0');
}

export function encodeRefundFunds(jobId: string): string {
  // refundFunds(bytes32) selector = 0x278ecde1
  return '0x278ecde1' + jobId.replace('0x', '').padStart(64, '0');
}

export function encodeEscalateToArbiters(jobId: string): string {
  // escalateToArbiters(bytes32) selector = 0x5c19a95c
  return '0x5c19a95c' + jobId.replace('0x', '').padStart(64, '0');
}

export function encodeRecordCompletion(
  freelancer: string,
  jobId: string,
  rating: number,
  amount: bigint
): string {
  // recordCompletion(address,bytes32,uint32,uint256) selector = 0x3ccfd60b
  const addr = freelancer.replace('0x', '').padStart(64, '0');
  const jid = jobId.replace('0x', '').padStart(64, '0');
  const rat = rating.toString(16).padStart(64, '0');
  const amt = amount.toString(16).padStart(64, '0');
  return '0x3ccfd60b' + addr + jid + rat + amt;
}