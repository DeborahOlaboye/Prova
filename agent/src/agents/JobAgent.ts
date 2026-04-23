import { Env, JobEvaluationRequest } from '../lib/types';
import { withErrorHandling, requireMethod } from '../lib/errors';
import { evaluateWithClaude } from '../lib/claude';
import { fetchIPFSContent } from '../lib/ipfs';
import {
  sendTransaction,
  encodeMarkCompleted,
  encodeMarkDisputed,
  encodeMarkRefunded,
  encodeReleaseFunds,
  encodeRefundFunds,
  encodeEscalateToArbiters,
} from '../lib/chain';

const CONFIDENCE_AUTO = 0.85;
const CONFIDENCE_LOW = 0.60;

export class JobAgent {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/evaluate') {
      const methodErr = requireMethod(request, 'POST');
      if (methodErr) return methodErr;
      return withErrorHandling(() => this.handleEvaluate(request));
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleEvaluate(request: Request): Promise<Response> {
    const body = await request.json<JobEvaluationRequest>();
    const { jobId, criteriaIPFSHash, deliverableIPFSHash } = body;

    if (!jobId || !criteriaIPFSHash || !deliverableIPFSHash) {
      return new Response('Missing required fields', { status: 400 });
    }

    // Fetch content from IPFS
    const [criteria, deliverable] = await Promise.all([
      fetchIPFSContent(criteriaIPFSHash),
      fetchIPFSContent(deliverableIPFSHash),
    ]);

    // Evaluate with Claude
    const result = await evaluateWithClaude(
      criteria,
      deliverable,
      this.env.CLAUDE_API_KEY,
      this.env.CLOUDFLARE_AI_GATEWAY_URL
    );

    const txBase = {
      rpcUrl: this.env.CELO_RPC_URL,
      privateKey: this.env.CELO_PRIVATE_KEY,
    };

    if (result.confidence >= CONFIDENCE_AUTO) {
      if (result.pass) {
        // Release funds then mark completed
        await sendTransaction({ ...txBase, to: this.env.ESCROW_VAULT_ADDRESS, data: encodeReleaseFunds(jobId) });
        await sendTransaction({ ...txBase, to: this.env.JOB_REGISTRY_ADDRESS, data: encodeMarkCompleted(jobId) });
      } else {
        // Refund then mark refunded
        await sendTransaction({ ...txBase, to: this.env.ESCROW_VAULT_ADDRESS, data: encodeRefundFunds(jobId) });
        await sendTransaction({ ...txBase, to: this.env.JOB_REGISTRY_ADDRESS, data: encodeMarkRefunded(jobId) });
      }
    } else if (result.confidence >= CONFIDENCE_LOW) {
      // Low confidence — mark disputed, notify parties
      await sendTransaction({ ...txBase, to: this.env.JOB_REGISTRY_ADDRESS, data: encodeMarkDisputed(jobId) });
    } else {
      // Very low confidence — escalate to arbiters
      await sendTransaction({ ...txBase, to: this.env.JOB_REGISTRY_ADDRESS, data: encodeMarkDisputed(jobId) });
      await sendTransaction({ ...txBase, to: this.env.ESCROW_VAULT_ADDRESS, data: encodeEscalateToArbiters(jobId) });
    }

    return Response.json({ jobId, ...result });
  }
}
