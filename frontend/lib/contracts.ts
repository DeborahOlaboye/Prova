// cUSD is used as feeCurrency for MiniPay transactions (legacy tx type required)
export const MINIPAY_FEE_CURRENCY = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as `0x${string}`;

// Contract addresses — set via environment variables
export const CONTRACT_ADDRESSES = {
  jobRegistry: (process.env.NEXT_PUBLIC_JOB_REGISTRY_ADDRESS ?? "") as `0x${string}`,
  escrowVault: (process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS ?? "") as `0x${string}`,
  reputationLedger: (process.env.NEXT_PUBLIC_REPUTATION_LEDGER_ADDRESS ?? "") as `0x${string}`,
  arbiterPool: (process.env.NEXT_PUBLIC_ARBITER_POOL_ADDRESS ?? "") as `0x${string}`,
  // cUSD on Celo mainnet
  cUSD: (process.env.NEXT_PUBLIC_CUSD_ADDRESS ?? "0x765DE816845861e75A25fCA122bb6898B8B1282a") as `0x${string}`,
};

// ─── JobRegistry ────────────────────────────────────────────────────────────

export const JOB_REGISTRY_ABI = [
  {
    type: "function",
    name: "postJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "title", type: "string" },
      { name: "criteriaIPFSHash", type: "string" },
      { name: "bounty", type: "uint256" },
      { name: "deadline", type: "uint40" },
    ],
    outputs: [{ name: "jobId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "acceptJob",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "submitWork",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "deliverableIPFSHash", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelJob",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getJob",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "jobId", type: "bytes32" },
          { name: "client", type: "address" },
          { name: "freelancer", type: "address" },
          { name: "title", type: "string" },
          { name: "criteriaIPFSHash", type: "string" },
          { name: "deliverableIPFSHash", type: "string" },
          { name: "bounty", type: "uint256" },
          { name: "deadline", type: "uint40" },
          { name: "postedAt", type: "uint40" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getClientJobs",
    stateMutability: "view",
    inputs: [{ name: "client", type: "address" }],
    outputs: [{ name: "", type: "bytes32[]" }],
  },
  {
    type: "function",
    name: "getFreelancerJobs",
    stateMutability: "view",
    inputs: [{ name: "freelancer", type: "address" }],
    outputs: [{ name: "", type: "bytes32[]" }],
  },
  {
    type: "function",
    name: "getOpenJobCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "openJobIds",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "event",
    name: "JobPosted",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "client", type: "address", indexed: true },
      { name: "bounty", type: "uint256", indexed: false },
      { name: "deadline", type: "uint40", indexed: false },
    ],
  },
  {
    type: "event",
    name: "JobAccepted",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "freelancer", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "WorkSubmitted",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "deliverableIPFSHash", type: "string", indexed: false },
    ],
  },
] as const;

// ─── EscrowVault ─────────────────────────────────────────────────────────────

export const ESCROW_VAULT_ABI = [
  {
    type: "function",
    name: "getLockedAmount",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── ReputationLedger ────────────────────────────────────────────────────────

export const REPUTATION_LEDGER_ABI = [
  {
    type: "function",
    name: "getScore",
    stateMutability: "view",
    inputs: [{ name: "freelancer", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "jobsCompleted", type: "uint32" },
          { name: "jobsDisputed", type: "uint32" },
          { name: "disputesWon", type: "uint32" },
          { name: "avgRating", type: "uint32" },
          { name: "totalEarned", type: "uint256" },
          { name: "memberSince", type: "uint40" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getCompositeScore",
    stateMutability: "view",
    inputs: [{ name: "freelancer", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── ArbiterPool ─────────────────────────────────────────────────────────────

export const ARBITER_POOL_ABI = [
  {
    type: "function",
    name: "stake",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "requestUnstake",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "unstake",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "submitVote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "disputeId", type: "bytes32" },
      { name: "vote", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimFee",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "arbiters",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "stakedAt", type: "uint256" },
      { name: "unstakeRequestedAt", type: "uint256" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "pendingFees",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "activeArbiterCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "STAKE_AMOUNT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── ERC20 (cUSD approve) ────────────────────────────────────────────────────

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── Job status helpers ──────────────────────────────────────────────────────

export enum JobStatus {
  OPEN = 0,
  IN_PROGRESS = 1,
  SUBMITTED = 2,
  COMPLETED = 3,
  DISPUTED = 4,
  REFUNDED = 5,
  CANCELLED = 6,
}

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  [JobStatus.OPEN]: "Open",
  [JobStatus.IN_PROGRESS]: "In Progress",
  [JobStatus.SUBMITTED]: "Under Review",
  [JobStatus.COMPLETED]: "Completed",
  [JobStatus.DISPUTED]: "Disputed",
  [JobStatus.REFUNDED]: "Refunded",
  [JobStatus.CANCELLED]: "Cancelled",
};

export const JOB_STATUS_COLOR: Record<JobStatus, string> = {
  [JobStatus.OPEN]: "bg-celo-green/20 text-celo-green",
  [JobStatus.IN_PROGRESS]: "bg-blue-500/20 text-blue-400",
  [JobStatus.SUBMITTED]: "bg-yellow-500/20 text-yellow-400",
  [JobStatus.COMPLETED]: "bg-emerald-500/20 text-emerald-400",
  [JobStatus.DISPUTED]: "bg-red-500/20 text-red-400",
  [JobStatus.REFUNDED]: "bg-gray-500/20 text-gray-400",
  [JobStatus.CANCELLED]: "bg-gray-500/20 text-gray-400",
};

export type JobStruct = {
  jobId: `0x${string}`;
  client: `0x${string}`;
  freelancer: `0x${string}`;
  title: string;
  criteriaIPFSHash: string;
  deliverableIPFSHash: string;
  bounty: bigint;
  deadline: number;
  postedAt: number;
  status: number;
};
