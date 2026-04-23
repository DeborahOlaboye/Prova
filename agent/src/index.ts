import { Env } from './lib/types';
import { JobAgent } from './agents/JobAgent';
import { DisputeAgent } from './agents/DisputeAgent';
import { ReputationAgent } from './agents/ReputationAgent';

export { JobAgent, DisputeAgent, ReputationAgent };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Route /job/* → JobAgent
    if (url.pathname.startsWith('/job/')) {
      const id = env.JOB_AGENT.idFromName('singleton');
      const stub = env.JOB_AGENT.get(id);
      return stub.fetch(new Request(request.url.replace('/job', ''), request));
    }

    // Route /dispute/* → DisputeAgent
    if (url.pathname.startsWith('/dispute/')) {
      const id = env.DISPUTE_AGENT.idFromName('singleton');
      const stub = env.DISPUTE_AGENT.get(id);
      return stub.fetch(request);
    }

    // Route /reputation/* → ReputationAgent
    if (url.pathname.startsWith('/reputation/')) {
      const id = env.REPUTATION_AGENT.idFromName('singleton');
      const stub = env.REPUTATION_AGENT.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', ts: Date.now() });
    }

    return new Response('Not found', { status: 404 });
  },
};
