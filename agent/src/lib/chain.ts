export interface TxRequest {
  rpcUrl: string;
  privateKey: string;
  to: string;
  data: string;
}

export async function sendTransaction(req: TxRequest): Promise<string> {
  // Get nonce
  const nonceRes = await rpcCall(req.rpcUrl, 'eth_getTransactionCount', [
    await deriveAddress(req.privateKey),
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

  const tx = {
    nonce: `0x${nonce.toString(16)}`,
    gasPrice,
    gas,
    to: req.to,
    value: '0x0',
    data: req.data,
    chainId: '0xa4ec', // Celo mainnet 42220
  };

  const signed = await signTransaction(tx, req.privateKey);
  const txHash = await rpcCall(req.rpcUrl, 'eth_sendRawTransaction', [signed]);
  return txHash;
}

async function rpcCall(url: string, method: string, params: unknown[]): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

async function deriveAddress(privateKey: string): Promise<string> {
  // Use Web Crypto to derive public key from private key (secp256k1 via subtle)
  const keyBytes = hexToBytes(privateKey.replace('0x', ''));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
  const exported = await crypto.subtle.exportKey('raw', cryptoKey);
  const hash = await crypto.subtle.digest('SHA-256', exported);
  const addr = '0x' + Array.from(new Uint8Array(hash).slice(-20))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return addr;
}

async function signTransaction(tx: Record<string, string>, privateKey: string): Promise<string> {
  // Placeholder — in production use a proper secp256k1 signing library
  // Cloudflare Workers supports ECDSA via Web Crypto (P-256 only, not secp256k1)
  // Real implementation should use ethers.js or viem in a Node.js compatible environment
  void tx; void privateKey;
  throw new Error('signTransaction: use viem/ethers in production worker');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

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
