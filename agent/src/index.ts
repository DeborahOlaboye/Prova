import { Env } from './lib/types';
import { JobAgent } from './agents/JobAgent';
import { DisputeAgent } from './agents/DisputeAgent';
import { ReputationAgent } from './agents/ReputationAgent';

export { JobAgent, DisputeAgent, ReputationAgent };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    let response: Response;

    // Route /job/* → JobAgent
    if (url.pathname.startsWith('/job/')) {
      const id = env.JOB_AGENT.idFromName('singleton');
      const stub = env.JOB_AGENT.get(id);
      response = await stub.fetch(new Request(request.url.replace('/job', ''), request));
    }
    // Route /dispute/* → DisputeAgent
    else if (url.pathname.startsWith('/dispute/')) {
      const id = env.DISPUTE_AGENT.idFromName('singleton');
      const stub = env.DISPUTE_AGENT.get(id);
      response = await stub.fetch(request);
    }
    // Route /reputation/* → ReputationAgent
    else if (url.pathname.startsWith('/reputation/')) {
      const id = env.REPUTATION_AGENT.idFromName('singleton');
      const stub = env.REPUTATION_AGENT.get(id);
      response = await stub.fetch(request);
    }
    if (url.pathname === '/health') {
      response = Response.json({ status: 'ok', ts: Date.now() });
    }
    // Webhook: called by frontend after freelancer submits work
    else if (url.pathname === '/webhook/work-submitted' && request.method === 'POST') {
      const id = env.JOB_AGENT.idFromName('singleton');
      const stub = env.JOB_AGENT.get(id);
      response = await stub.fetch(new Request(
        request.url.replace('/webhook/work-submitted', '/evaluate'),
        request
      ));
    }
    else {
      response = new Response('Not found', { status: 404 });
    }

    // Attach CORS headers to all responses
    const newHeaders = new Headers(response.headers);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
    return new Response(response.body, { status: response.status, headers: newHeaders });
  },
};
