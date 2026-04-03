# Prova

**AI-arbitrated freelance work escrow on Celo.**

*Prova* — Italian and Spanish for "proof." Every job on this platform is a proof: proof of work submitted, proof of criteria met, proof of payment released.

Prova is a decentralized gig work platform where clients post tasks with cUSD bounties, freelancers submit deliverables, and an AI agent evaluates completion against the acceptance criteria — automatically releasing escrow on pass, mediating disputes on conflict, and building a portable on-chain reputation for every worker.

No central authority. No payment rails that block African freelancers. No waiting for client confirmation.

---

## The Problem

African freelancers are systematically excluded from the global gig economy:

- PayPal and Stripe are unavailable or heavily restricted in most African countries
- Upwork and Fiverr accounts are frequently suspended for African users
- Existing Web3 freelance platforms require crypto-native clients — a tiny market
- Simple escrow dApps still require manual confirmation from the client, creating delays and payment disputes
- Freelancers have no portable reputation — their work history is siloed in each platform

---

## How It Works

1. **Client posts a job** — title, acceptance criteria in plain language, cUSD bounty, deadline
2. **Smart contract locks the bounty** in escrow
3. **Freelancer accepts and submits work** — deliverables uploaded to IPFS (text, links, files, code)
4. **AI agent evaluates the submission** — Claude via Cloudflare AI Gateway reads the criteria and deliverable, returns pass/fail with confidence score and reasoning
5. **On pass** — escrow releases automatically to freelancer's MiniPay wallet
6. **On dispute** — both parties submit arguments; AI re-evaluates with full context; if unresolved, a staked human arbiter pool votes
7. **On-chain reputation** — every completed job updates the freelancer's ReputationLedger, publicly queryable by any protocol

---

## Architecture

```
MiniPay Frontend (Next.js + viem)
        │
        ▼
Celo Smart Contracts
  JobRegistry · EscrowVault · ReputationLedger · ArbiterPool
        │
        ▼
Cloudflare Agents SDK (Durable Objects)
  JobAgent · DisputeAgent · ReputationAgent
        │
        ▼
Cloudflare AI Gateway
  Claude Sonnet (complex) · Claude Haiku (simple) · budget caps
        │
        ▼
IPFS (web3.storage) — criteria + deliverables
```

---

## Smart Contracts

| Contract | Purpose |
|---|---|
| `JobRegistry` | Posts jobs, manages lifecycle (OPEN → IN_PROGRESS → SUBMITTED → COMPLETED / DISPUTED) |
| `EscrowVault` | Holds cUSD bounties; releases only via authorized agent or arbiter pool decision |
| `ReputationLedger` | Immutable on-chain reputation scores; portable across protocols |
| `ArbiterPool` | Staked human arbiters who vote on deadlocked disputes; earn 2 cUSD per case |

Contracts are written in Solidity and built with [Foundry](https://book.getfoundry.sh/).

---

## AI Evaluation System

Every work submission is evaluated by Claude via Cloudflare AI Gateway:

- **Confidence > 0.85** → automatic decision (release or refund)
- **Confidence 0.60–0.85** → both parties notified, 48hr manual resolution window
- **Dispute raised** → DisputeAgent collects arguments and re-evaluates with full context
- **Deadlock** → ArbiterPool (random selection, secret vote, slash for bad votes)

**Cost routing:**
- Short jobs (< 500 word criteria) → Claude Haiku
- Long / complex jobs → Claude Sonnet
- All disputes → Claude Sonnet regardless of length
- Per-evaluation budget cap: $0.05 enforced via AI Gateway

---

## Reputation Score

```
score = (completionRate × 40) + (disputeWinRate × 20) + (avgClientRating × 25) + (experienceScore × 15)
```

Score range: 0–100. Displayed as a badge on freelancer profiles. Queryable on-chain by any dApp or protocol.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Celo L2 |
| Smart Contracts | Solidity 0.8.x · Foundry |
| Frontend | Next.js 14 · viem · wagmi · Tailwind CSS |
| File Storage | IPFS via web3.storage |
| Agent Infrastructure | Cloudflare Agents SDK (Durable Objects) |
| AI Arbitration | Cloudflare AI Gateway → Claude Sonnet / Haiku |
| Identity | Coinbase Verification / Self Protocol |
| Payments | cUSD via MiniPay |

---

## Project Structure

```
prova/
├── contracts/               # Foundry project
│   ├── src/
│   │   ├── JobRegistry.sol
│   │   ├── EscrowVault.sol
│   │   ├── ReputationLedger.sol
│   │   └── ArbiterPool.sol
│   ├── test/
│   │   ├── JobRegistry.t.sol
│   │   ├── EscrowVault.t.sol
│   │   ├── ArbiterPool.t.sol
│   │   └── Integration.t.sol
│   ├── script/
│   │   └── Deploy.s.sol
│   └── foundry.toml
├── agent/                   # Cloudflare Workers + Agents SDK
│   ├── src/
│   │   ├── agents/
│   │   │   ├── JobAgent.ts
│   │   │   ├── DisputeAgent.ts
│   │   │   └── ReputationAgent.ts
│   │   └── index.ts
│   └── wrangler.toml
├── frontend/                # Next.js MiniPay app
│   ├── app/
│   │   ├── jobs/
│   │   ├── post/
│   │   ├── profile/
│   │   └── arbiter/
│   ├── components/
│   └── hooks/
│       └── useMiniPay.ts
└── README.md
```

---

## Getting Started

### Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js >= 18
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### Contracts

```bash
cd contracts
forge install
forge build
forge test
```

### Deploy to Alfajores (Celo testnet)

```bash
forge script script/Deploy.s.sol \
  --rpc-url https://alfajores-forno.celo-testnet.org \
  --private-key $PRIVATE_KEY \
  --broadcast
```

### Agent

```bash
cd agent
npm install
wrangler dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

For MiniPay testing, tunnel localhost with ngrok:

```bash
ngrok http 3000
```

Then load the HTTPS ngrok URL inside MiniPay.

---

## MiniPay Compatibility

```typescript
useEffect(() => {
  if (window.ethereum && window.ethereum.isMiniPay) {
    setIsMiniPay(true);
    connectWallet(); // wallet auto-injected, no modal needed
  }
}, []);
```

Key constraints:
- Use **viem** or **wagmi** — Ethers.js is incompatible with Celo fee abstraction
- Legacy transactions only — no EIP-1559
- Fee currency: `USDm` contract address on Celo

---

## Environment Variables

```bash
# contracts/.env
PRIVATE_KEY=
CELO_RPC_URL=https://forno.celo.org

# agent/.env
CELO_PRIVATE_KEY=
CLOUDFLARE_AI_GATEWAY_URL=
CLAUDE_API_KEY=

# frontend/.env.local
NEXT_PUBLIC_JOB_REGISTRY_ADDRESS=
NEXT_PUBLIC_REPUTATION_LEDGER_ADDRESS=
NEXT_PUBLIC_CELO_CHAIN_ID=42220
```

---

## Celo Proof of Ship

Built for [Celo Proof of Ship](https://www.celopg.eco/programs/proof-of-ship) — April 2025.

- MiniPay compatible
- Smart contracts deployed on Celo mainnet
- Humanity verification via Coinbase / Self Protocol
- AI agent executing real on-chain financial transactions

---

## License

MIT
