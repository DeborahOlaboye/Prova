import { Env } from '../lib/types';
import { withErrorHandling, requireMethod } from '../lib/errors';
import { sendTransaction, encodeRecordCompletion } from '../lib/chain';

export class ReputationAgent {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/reputation/record') {
      const methodErr = requireMethod(request, 'POST');
      if (methodErr) return methodErr;
      return withErrorHandling(() => this.handleRecord(request));
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleRecord(request: Request): Promise<Response> {
    const { freelancer, jobId, clientRating, amountEarned } = await request.json<{
      freelancer: string;
      jobId: string;
      clientRating: number;
      amountEarned: string;
    }>();

    if (!freelancer || !jobId || clientRating === undefined || !amountEarned) {
      return new Response('Missing required fields', { status: 400 });
    }

    if (clientRating < 0 || clientRating > 100) {
      return new Response('clientRating must be 0–100', { status: 400 });
    }

    const data = encodeRecordCompletion(
      freelancer,
      jobId,
      clientRating,
      BigInt(amountEarned)
    );

    const txHash = await sendTransaction({
      rpcUrl: this.env.CELO_RPC_URL,
      privateKey: this.env.CELO_PRIVATE_KEY,
      to: this.env.REPUTATION_LEDGER_ADDRESS,
      data,
    });

    return Response.json({ freelancer, jobId, txHash });
  }
}
