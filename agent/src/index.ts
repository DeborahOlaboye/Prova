import { JobAgent } from './agents/JobAgent';
import { DisputeAgent } from './agents/DisputeAgent';
import { ReputationAgent } from './agents/ReputationAgent';
import { Env } from './lib/types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Route to appropriate agent based on path
    if (url.pathname.startsWith('/evaluate')) {
      return env.JOB_AGENT.fromLabel('job-agent').fetch(request);
    }

    if (url.pathname.startsWith('/dispute')) {
      return env.DISPUTE_AGENT.fromLabel('dispute-agent').fetch(request);
    }

    if (url.pathname.startsWith('/reputation')) {
      return env.REPUTATION_AGENT.fromLabel('reputation-agent').fetch(request);
    }

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', ts: Date.now() });
    }

    return new Response('Not found', { status: 404 });
  },
};
