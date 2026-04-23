import { Env, DisputeContext } from '../lib/types';
import { withErrorHandling, requireMethod } from '../lib/errors';
import { evaluateWithClaude } from '../lib/claude';
import { fetchIPFSContent } from '../lib/ipfs';
import {
  sendTransaction,
  encodeReleaseFunds,
  encodeRefundFunds,
  encodeMarkCompleted,
  encodeMarkRefunded,
  encodeEscalateToArbiters,
} from '../lib/chain';

export class DisputeAgent {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/dispute/submit-argument') {
      const methodErr = requireMethod(request, 'POST');
      if (methodErr) return methodErr;
      return withErrorHandling(() => this.handleSubmitArgument(request));
    }

    if (url.pathname === '/dispute/resolve') {
      const methodErr = requireMethod(request, 'POST');
      if (methodErr) return methodErr;
      return withErrorHandling(() => this.handleResolve(request));
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleSubmitArgument(request: Request): Promise<Response> {
    const { jobId, role, argument } = await request.json<{
      jobId: string;
      role: 'client' | 'freelancer';
      argument: string;
    }>();

    if (!jobId || !role || !argument) {
      return new Response('Missing required fields', { status: 400 });
    }

    const key = `dispute:${jobId}:${role}`;
    await this.state.storage.put(key, argument);

    return Response.json({ jobId, role, stored: true });
  }

  private async handleResolve(request: Request): Promise<Response> {
    const { jobId, criteriaIPFSHash, deliverableIPFSHash } = await request.json<DisputeContext>();

    if (!jobId || !criteriaIPFSHash || !deliverableIPFSHash) {
      return new Response('Missing required fields', { status: 400 });
    }

    const [criteria, deliverable] = await Promise.all([
      fetchIPFSContent(criteriaIPFSHash),
      fetchIPFSContent(deliverableIPFSHash),
    ]);

    const clientArg = (await this.state.storage.get<string>(`dispute:${jobId}:client`)) ?? '';
    const freelancerArg = (await this.state.storage.get<string>(`dispute:${jobId}:freelancer`)) ?? '';

    const fullContext = [
      criteria,
      deliverable,
      clientArg ? `CLIENT ARGUMENT: ${clientArg}` : '',
      freelancerArg ? `FREELANCER ARGUMENT: ${freelancerArg}` : '',
    ].filter(Boolean).join('\n\n');

    const result = await evaluateWithClaude(
      criteria,
      fullContext,
      this.env.CLAUDE_API_KEY,
      this.env.CLOUDFLARE_AI_GATEWAY_URL,
      true // isDispute — always use Sonnet
    );

    const txBase = {
      rpcUrl: this.env.CELO_RPC_URL,
      privateKey: this.env.CELO_PRIVATE_KEY,
    };

    if (result.confidence >= 0.85) {
      if (result.pass) {
        // releaseFunds accepts SUBMITTED or COMPLETED — safe regardless of call order.
        await sendTransaction({ ...txBase, to: this.env.ESCROW_VAULT_ADDRESS, data: encodeReleaseFunds(jobId) });
        await sendTransaction({ ...txBase, to: this.env.JOB_REGISTRY_ADDRESS, data: encodeMarkCompleted(jobId) });
      } else {
        // refundFunds accepts SUBMITTED, COMPLETED, or DISPUTED — safe regardless of call order.
        await sendTransaction({ ...txBase, to: this.env.ESCROW_VAULT_ADDRESS, data: encodeRefundFunds(jobId) });
        await sendTransaction({ ...txBase, to: this.env.JOB_REGISTRY_ADDRESS, data: encodeMarkRefunded(jobId) });
      }
    } else {
      // Deadlock — escalate to human arbiters
      await sendTransaction({ ...txBase, to: this.env.ESCROW_VAULT_ADDRESS, data: encodeEscalateToArbiters(jobId) });
    }

    // Clean up stored arguments
    await this.state.storage.delete(`dispute:${jobId}:client`);
    await this.state.storage.delete(`dispute:${jobId}:freelancer`);

    return Response.json({ jobId, ...result });
  }
}
