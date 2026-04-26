# Prova Agent

Cloudflare Workers + Durable Objects agent layer for Prova.

## Cryptography

The agent uses proper **secp256k1** elliptic curve cryptography for Ethereum/Celo address derivation and transaction signing. This is implemented in pure TypeScript for Cloudflare Workers compatibility.

### Key Functions

| Function | Purpose |
|---|---|
| `deriveAddress(privateKey)` | Derive Ethereum address from secp256k1 private key |
| `keccak256(data)` | Compute Keccak-256 hash (used for addresses and tx signing) |
| `signHash(txHash, privateKey)` | Sign a transaction hash with secp256k1 |
| `sendTransaction(req)` | Construct, sign, and broadcast a Celo transaction |

### Testing

```bash
npm install
npm test        # Run tests once
npm run test:watch  # Run tests in watch mode
```

## Agents

| Agent | Route prefix | Purpose |
|---|---|---|
| `JobAgent` | `/job/*` | Evaluates work submissions via Claude, executes on-chain release/refund |
| `DisputeAgent` | `/dispute/*` | Collects party arguments, re-evaluates disputes, escalates to arbiters |
| `ReputationAgent` | `/reputation/*` | Records completed job scores on-chain |

## Endpoints

### POST /webhook/work-submitted
Called after a freelancer submits work. Triggers AI evaluation.
```json
{ "jobId": "0x...", "criteriaIPFSHash": "ipfs://...", "deliverableIPFSHash": "ipfs://..." }
```

> **Call ordering note:** `releaseFunds` on EscrowVault accepts both `SUBMITTED` and `COMPLETED`
> job status, so the agent can call `markCompleted` before or after `releaseFunds` without reverting.

### POST /dispute/submit-argument
Submit a client or freelancer argument for a disputed job.
```json
{ "jobId": "0x...", "role": "client|freelancer", "argument": "..." }
```

### POST /dispute/resolve
Re-evaluate a dispute with full context.
```json
{ "jobId": "0x...", "criteriaIPFSHash": "ipfs://...", "deliverableIPFSHash": "ipfs://..." }
```

### POST /reputation/record
Record a completed job on the ReputationLedger.
```json
{ "freelancer": "0x...", "jobId": "0x...", "clientRating": 80, "amountEarned": "20000000000000000000" }
```

### GET /health
Returns `{ "status": "ok", "ts": <timestamp> }`.

## Error Handling

The agent uses custom error classes for clear error handling:

| Error Class | Description |
|---|---|
| `ValidationError` | Invalid input parameters (bad address, missing fields) |
| `RPCError` | Network/RPC node failures with error codes |
| `TransactionError` | Transaction construction/signing failures |

## Setup

```bash
npm install
# Set secrets
wrangler secret put CELO_PRIVATE_KEY
wrangler secret put CLAUDE_API_KEY
wrangler secret put CLOUDFLARE_AI_GATEWAY_URL
wrangler secret put JOB_REGISTRY_ADDRESS
wrangler secret put ESCROW_VAULT_ADDRESS
wrangler secret put REPUTATION_LEDGER_ADDRESS
# Run locally
wrangler dev
# Deploy
wrangler deploy
```
