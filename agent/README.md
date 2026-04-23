# Prova Agent

Cloudflare Workers + Durable Objects agent layer for Prova.

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
