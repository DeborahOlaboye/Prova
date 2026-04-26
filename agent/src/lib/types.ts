/**
 * Type definitions for the Prova agent system.
 */

/**
 * Request body for job evaluation.
 */
export interface JobEvaluationRequest {
  jobId: string;
  criteriaIPFSHash: string;
  deliverableIPFSHash: string;
}

/**
 * Result of AI evaluation.
 */
export interface EvaluationResult {
  pass: boolean;
  confidence: number;
  reasoning: string;
}

/**
 * Context for dispute resolution.
 */
export interface DisputeContext {
  jobId: string;
  criteriaIPFSHash: string;
  deliverableIPFSHash: string;
  clientArgument?: string;
  freelancerArgument?: string;
}

/**
 * Environment variables for Cloudflare Workers.
 */
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

/**
 * Transaction request for blockchain operations.
 */
export interface TxRequest {
  rpcUrl: string;
  privateKey: string;
  to: string;
  data: string;
}
