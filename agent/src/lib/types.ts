export interface JobEvaluationRequest {
  jobId: string;
  criteriaIPFSHash: string;
  deliverableIPFSHash: string;
}

export interface EvaluationResult {
  pass: boolean;
  confidence: number;
  reasoning: string;
}

export interface DisputeContext {
  jobId: string;
  criteriaIPFSHash: string;
  deliverableIPFSHash: string;
  clientArgument?: string;
  freelancerArgument?: string;
}

export interface Env {
  CELO_PRIVATE_KEY: string;
  CLOUDFLARE_AI_GATEWAY_URL: string;
  CLAUDE_API_KEY: string;
  JOB_REGISTRY_ADDRESS: string;
  ESCROW_VAULT_ADDRESS: string;
  REPUTATION_LEDGER_ADDRESS: string;
  CELO_RPC_URL: string;
  JOB_AGENT: DurableObjectNamespace;
  DISPUTE_AGENT: DurableObjectNamespace;
  REPUTATION_AGENT: DurableObjectNamespace;
}
