# Prova — AI-Arbitrated Freelance Work Escrow on Celo

## Overview

Prova is a decentralized gig work platform on Celo where clients post tasks with cUSD bounties, freelancers submit deliverables, and an AI agent verifies completion and releases escrow automatically — with no central authority or human middleman for standard cases.

The name comes from the Italian and Spanish word for "proof" — the core mechanic of the platform. Every work submission is a proof, evaluated by AI.

Targeted at African freelancers who are systematically excluded from global platforms (Upwork, Fiverr) due to payment rail failures and account restrictions. Prova pays out in cUSD directly to MiniPay wallets — instant, global, non-custodial.

---

## Problem

- African freelancers cannot reliably receive payments from Upwork, Fiverr, or Toptal due to missing PayPal/Stripe coverage in most African countries
- Existing Web3 freelance platforms (Braintrust, Dework) require crypto-native clients — not accessible to everyday employers
- Simple escrow dApps require manual confirmation from the client — creating payment delays and trust issues
- Dispute resolution is expensive and slow on current platforms
- Freelancers have no portable, on-chain reputation that follows them across platforms

---

## Solution

Prova replaces the client-confirms-payment step with an AI arbitration layer:

1. Client posts a task with a cUSD bounty and plaintext acceptance criteria
2. Smart contract locks the bounty in escrow
3. Freelancer submits deliverables (text, links, files, GitHub repo)
4. AI agent (Claude via Cloudflare AI Gateway) evaluates the submission against the acceptance criteria
5. On pass: escrow releases automatically to the freelancer's MiniPay wallet
6. On dispute or ambiguous result: both parties submit arguments; AI re-evaluates with full context
7. On deadlock: a staked human arbiter pool votes; majority releases or refunds
8. Every completed job builds an on-chain reputation score that is publicly queryable by other protocols

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     MiniPay Frontend                     │
│  (Next.js + viem + isMiniPay hook)                      │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │  Celo Smart Contracts│
              │  - JobRegistry       │
              │  - EscrowVault       │
              │  - ReputationLedger  │
              │  - ArbiterPool       │
              └──────────┬──────────┘
                         │
         ┌───────────────▼────────────────────┐
         │     Cloudflare Agents SDK           │
         │  - JobAgent (DO per job)            │
         │  - DisputeAgent (DO per dispute)    │
         │  - ReputationAgent (DO per user)    │
         └───────────────┬────────────────────┘
                         │
         ┌───────────────▼────────────────────┐
         │     Cloudflare AI Gateway           │
         │  - Primary: Claude claude-sonnet-4-6│
         │  - Fallback: Claude Haiku (cost)    │
         │  - Logging: all evaluations stored  │
         │  - Budget controls per evaluation   │
         └────────────────────────────────────┘
```

---

## Smart Contracts

### JobRegistry.sol
Stores all posted and active jobs.

```
struct Job {
  bytes32 jobId;
  address client;
  address freelancer;       // 0x0 until accepted
  string title;
  string criteriaIPFSHash;  // acceptance criteria stored on IPFS
  uint256 bounty;           // cUSD in wei
  uint40 deadline;
  JobStatus status;         // OPEN, IN_PROGRESS, SUBMITTED, COMPLETED, DISPUTED, REFUNDED
}

Functions:
- postJob(title, criteriaHash, deadline) payable   // client deposits bounty
- acceptJob(jobId)                                  // freelancer claims job
- submitWork(jobId, deliverableIPFSHash)            // freelancer submits
- cancelJob(jobId)                                  // client cancels OPEN job
- getOpenJobs(offset, limit) view
- getJobsByFreelancer(address) view
```

### EscrowVault.sol
Holds cUSD bounties. Only releases via authorized agent or ArbiterPool decision.

```
Functions:
- lockFunds(jobId, amount) onlyJobRegistry
- releaseFunds(jobId, recipient) onlyAuthorizedAgent
- refundFunds(jobId) onlyAuthorizedAgent
- raiseFunds(jobId) onlyArbiterPool        // arbiter decision override
- getLockedAmount(jobId) view
```

### ReputationLedger.sol
Immutable on-chain reputation scores. Portable across protocols.

```
struct Score {
  uint32 jobsCompleted;
  uint32 jobsDisputed;
  uint32 jobsWon;           // disputes won
  uint32 avgRating;         // 0–100, set by client post-completion
  uint256 totalEarned;      // cumulative cUSD earned
  uint40 memberSince;
}

Functions:
- recordCompletion(freelancer, jobId, clientRating) onlyAgent
- recordDispute(freelancer, jobId, outcome) onlyAgent
- getScore(address) view
- getLeaderboard(offset, limit) view
```

### ArbiterPool.sol
Staked human arbiters who vote on deadlocked disputes.

```
Functions:
- stakeToArbite() payable              // stake 10 cUSD to join pool
- unstake()                            // 7-day cooldown
- submitVote(disputeId, decision)      // RELEASE or REFUND
- claimArbiterFee(disputeId)           // earn 2 cUSD per dispute resolved
- getActiveArbiters() view
```

---

## Cloudflare Agent Architecture

### JobAgent (Durable Object — one per job)
- Spawns when a freelancer submits work
- Fetches acceptance criteria from IPFS
- Fetches deliverable from IPFS or URL
- Calls Claude via AI Gateway with structured evaluation prompt
- Parses Claude's JSON response (pass/fail/confidence/reasoning)
- If confidence > 0.85: calls EscrowVault.releaseFunds() or EscrowVault.refundFunds()
- If confidence < 0.85: marks job as REVIEW_NEEDED, notifies both parties
- Stores full evaluation log in Durable Object SQLite

### DisputeAgent (Durable Object — one per dispute)
- Spawns when either party raises a dispute
- Collects both parties' written arguments (stored on IPFS)
- Fetches original criteria, deliverable, and JobAgent evaluation
- Re-evaluates with full dispute context via Claude
- If Claude resolves dispute (confidence > 0.90): executes decision
- If still ambiguous: forwards to ArbiterPool.sol with all context attached
- Implements Cloudflare human-in-the-loop approval pattern for arbiter escalation

### ReputationAgent (Durable Object — one per user)
- Wakes on job completion or dispute resolution
- Calculates updated reputation score
- Calls ReputationLedger.sol to record on-chain
- Generates natural language reputation summary for profile display
- Hibernates when idle (Cloudflare DO hibernation = near-zero cost)

---

## AI Evaluation System

### Standard Evaluation Prompt (JobAgent)
```typescript
const evaluation = await ai.run({
  model: 'claude-sonnet-4-6',
  messages: [
    {
      role: 'system',
      content: `You are an impartial work evaluator for a decentralized freelance platform.
      Evaluate whether the submitted work meets the acceptance criteria.
      Be fair, precise, and consistent. Return only valid JSON.`
    },
    {
      role: 'user',
      content: `
        ACCEPTANCE CRITERIA:
        ${criteria}
        
        SUBMITTED WORK:
        ${deliverable}
        
        Evaluate and return JSON:
        {
          "pass": boolean,
          "confidence": number (0.0–1.0),
          "reasoning": string (max 200 words),
          "unmet_criteria": string[] (list any criteria not met),
          "suggestions": string (optional feedback for freelancer)
        }
      `
    }
  ]
});
```

### Dispute Evaluation Prompt (DisputeAgent)
Extends the standard prompt with:
- Original evaluation result and reasoning
- Client's dispute argument
- Freelancer's counter-argument
- Any additional evidence submitted by either party
- Request for final binding decision with full justification

### Cost Control via AI Gateway
- Simple/short jobs (< 500 word criteria): route to Claude Haiku (fast, cheap)
- Complex/long jobs (> 500 words): route to Claude Sonnet
- Disputes always use Claude Sonnet regardless of length
- Per-evaluation budget cap: $0.05 max (enforced via AI Gateway budget rules)

---

## Frontend (MiniPay-Compatible)

### Tech Stack
- Next.js 14 (App Router)
- viem + wagmi
- Celo Composer scaffold
- Tailwind CSS
- IPFS via web3.storage or Pinata (for storing criteria + deliverables)

### MiniPay Integration
```typescript
useEffect(() => {
  if (window.ethereum && window.ethereum.isMiniPay) {
    setIsMiniPay(true);
    // Auto-connect — no wallet modal needed in MiniPay
    connectWallet();
  }
}, []);

// All transactions use legacy type + USDm fee currency
const sendTx = async (txData) => ({
  ...txData,
  feeCurrency: USDM_ADDRESS, // MiniPay required
  // No maxFeePerGas — legacy tx only
});
```

### Screens

**For Freelancers:**
1. **Browse Jobs** — filterable job board (category, bounty range, deadline)
2. **Job Detail** — full criteria, client reputation, bounty amount
3. **Submit Work** — deliverable upload / link submission form
4. **My Jobs** — active, submitted, completed, disputed jobs
5. **My Reputation** — on-chain score, earnings history, AI-generated profile summary

**For Clients:**
1. **Post Job** — title, description, acceptance criteria (plain language), bounty, deadline
2. **My Jobs** — track freelancer progress, view AI evaluation results
3. **Dispute** — raise dispute with written argument
4. **Rate Freelancer** — 1–5 star rating after completion (stored on-chain)

**Shared:**
6. **Leaderboard** — top freelancers by reputation score
7. **Arbiter Dashboard** — stake cUSD, view active disputes, submit votes, claim fees

---

## Data Flow — Job Lifecycle

```
1. Client posts job → JobRegistry.postJob() → bounty locked in EscrowVault
2. Freelancer browses board → accepts job → JobRegistry.acceptJob()
3. Freelancer completes work → uploads to IPFS → JobRegistry.submitWork()
4. JobAgent (Cloudflare DO) wakes → fetches criteria + deliverable from IPFS
5. JobAgent calls Claude via AI Gateway → receives evaluation JSON
6. [PASS, confidence > 0.85]:
   → JobAgent calls EscrowVault.releaseFunds(freelancer)
   → ReputationAgent updates ReputationLedger
   → Freelancer receives cUSD in MiniPay
7. [FAIL, confidence > 0.85]:
   → JobAgent calls EscrowVault.refundFunds(client)
   → Freelancer notified with AI feedback + suggestions
8. [confidence < 0.85 — ambiguous]:
   → Both parties notified for manual review
   → 48hr window to resolve directly or escalate to dispute
9. [Dispute raised]:
   → DisputeAgent wakes → collects both arguments
   → Re-evaluates with full context
   → If resolved: executes decision
   → If deadlocked: forwards to ArbiterPool for human vote
10. [Arbiter vote] → majority decision → EscrowVault executes → arbiters earn fee
```

---

## Reputation Score Formula

```
score = (
  (completionRate * 40) +      // % of accepted jobs completed
  (disputeWinRate * 20) +      // % of disputes decided in favor
  (avgClientRating * 25) +     // client ratings (0–100)
  (experienceScore * 15)       // log(totalEarned + 1) normalized to 0–100
)
```

Score range: 0–100. Displayed as a badge on freelancer profile.

---

## Proof of Ship — Celo Campaign Checklist

| Requirement | Implementation |
|---|---|
| MiniPay hook | `window.ethereum.isMiniPay` detection, auto-connect, feeCurrency = USDm |
| Deploy on Celo mainnet | JobRegistry, EscrowVault, ReputationLedger, ArbiterPool contracts |
| Prove humanity | Coinbase verification or Self Protocol required before posting or accepting jobs |
| Submit project | KarmaGAP submission with GitHub, demo video, mainnet contract addresses |

---

## Agent Visa (Celo) Qualification

To qualify for Work Visa tier (1,000 txns + $5k volume):
- Each job = minimum 3 on-chain transactions (post, accept, release/refund)
- 334 completed jobs = 1,000+ transactions
- Average bounty of $15 × 334 jobs = $5,010+ volume
- Realistic within 4–6 weeks with 50 active users

---

## Development Phases

### Phase 1 — Smart Contracts (Week 1)
- [ ] Deploy JobRegistry, EscrowVault, ReputationLedger on Alfajores (Celo testnet)
- [ ] Deploy ArbiterPool on Alfajores
- [ ] Write Hardhat tests for all core flows (post, accept, submit, release, refund)
- [ ] Set up IPFS pinning via web3.storage for criteria and deliverables
- [ ] Verify contracts on Celo Explorer

### Phase 2 — Cloudflare Agent (Week 2)
- [ ] Scaffold Cloudflare Worker with Durable Objects (Agents SDK)
- [ ] Implement JobAgent — IPFS fetch + Claude evaluation + escrow release
- [ ] Implement DisputeAgent — argument collection + re-evaluation + arbiter escalation
- [ ] Implement ReputationAgent — score calculation + on-chain write
- [ ] Configure Cloudflare AI Gateway with Claude Sonnet + Haiku routing rules
- [ ] Add budget caps ($0.05/evaluation) via AI Gateway

### Phase 3 — MiniPay Frontend (Week 3)
- [ ] Scaffold Next.js app with Celo Composer
- [ ] Implement isMiniPay hook + auto-connect
- [ ] Build job board (browse + filter)
- [ ] Build job posting flow (client)
- [ ] Build work submission flow (freelancer)
- [ ] Build reputation profile page
- [ ] Add Coinbase / Self identity verification gate

### Phase 4 — Polish + Submit (Week 4 — before Apr 26)
- [ ] Deploy all contracts to Celo mainnet
- [ ] End-to-end test with real cUSD on mainnet
- [ ] Record demo video (show full job lifecycle: post → submit → AI evaluation → payout)
- [ ] Submit to KarmaGAP (Proof of Ship)
- [ ] Write Celo Forum post on AI arbitration mechanism
- [ ] Prepare Lisbon demo (May 1) — focus on Cloudflare Agents SDK architecture

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| Blockchain | Celo L2 (mainnet + Alfajores testnet) |
| Smart Contracts | Solidity 0.8.x, Hardhat, OpenZeppelin |
| Frontend | Next.js 14, viem, wagmi, Tailwind CSS |
| File Storage | IPFS via web3.storage (criteria + deliverables) |
| Agent Infrastructure | Cloudflare Agents SDK (Durable Objects) |
| AI Arbitration | Cloudflare AI Gateway → Claude claude-sonnet-4-6 / Haiku |
| State / Logs | Cloudflare KV + Durable Object SQLite |
| Identity | Coinbase Verification or Self Protocol |
| Stablecoin | cUSD (Celo Dollar) |
| Payments | MiniPay (feeCurrency = USDm) |

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| AI evaluation gaming | Acceptance criteria hashed and locked on-chain at posting time; cannot be changed after freelancer accepts |
| Prompt injection via deliverables | Deliverables are passed as data, not instructions; system prompt explicitly guards against instruction-following in user content |
| Arbiter collusion | Arbiters are randomly selected from pool; votes are secret until reveal phase; stake is slashed for provably bad votes |
| IPFS content unavailability | Pin to at least 2 IPFS nodes; cache content hash + snapshot in Durable Object KV at submission time |
| cUSD volatility | cUSD is a stablecoin pegged to USD — minimal volatility risk |
| Low arbiter participation | 2 cUSD fee per dispute; arbiters earn passively; low commitment (vote takes < 5 min) |

---

## Grant Alignment

- **Celo Proof of Ship** — direct submission; ticks all four requirements
- **Celo Agent Visa** — AI agent executing real financial transactions; Work Visa tier achievable
- **Celo Africa DAO** — African freelancer financial inclusion is a core mandate
- **CeloPG Retroactive Grants** — if traction is demonstrated post-launch
- **Cloudflare Lisbon Hackathon (May 1)** — Cloudflare Agents SDK + AI Gateway is the entire backend; Cloudflare's human-in-the-loop pattern is used for dispute escalation

---

## Differentiation from Existing Projects

| Platform | Limitation | Prova's Advantage |
|---|---|---|
| Braintrust | Web3-native clients only; token model | Any client, stablecoin payments, no token |
| Dework | Manual payment confirmation | AI auto-releases escrow |
| Upwork / Fiverr | Blocks African freelancers | cUSD via MiniPay, globally accessible |
| Simple escrow dApps | No AI, no reputation | AI arbitration + portable on-chain reputation |

---

## Repository Structure

```
prova/
├── contracts/
│   ├── JobRegistry.sol
│   ├── EscrowVault.sol
│   ├── ReputationLedger.sol
│   ├── ArbiterPool.sol
│   └── test/
├── agent/
│   ├── src/
│   │   ├── agents/
│   │   │   ├── JobAgent.ts
│   │   │   ├── DisputeAgent.ts
│   │   │   └── ReputationAgent.ts
│   │   ├── lib/
│   │   │   ├── ipfs.ts
│   │   │   ├── celo.ts
│   │   │   ├── evaluate.ts
│   │   │   └── ai.ts
│   │   └── index.ts
│   └── wrangler.toml
├── frontend/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── jobs/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   ├── post/
│   │   ├── profile/[address]/
│   │   ├── disputes/
│   │   └── arbiter/
│   ├── components/
│   ├── hooks/
│   │   └── useMiniPay.ts
│   └── lib/
│       ├── contracts.ts
│       └── ipfs.ts
└── build.md
```
