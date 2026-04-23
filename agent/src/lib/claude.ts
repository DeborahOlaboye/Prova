import { EvaluationResult } from './types';

export async function evaluateWithClaude(
  criteria: string,
  deliverable: string,
  apiKey: string,
  gatewayUrl: string,
  isDispute = false
): Promise<EvaluationResult> {
  const model = isDispute || criteria.length > 500 ? 'claude-sonnet-3-5-20241022' : 'claude-3-5-haiku-20241022';

  const prompt = `You are an AI arbitrator for a freelance work platform. Evaluate whether the submitted deliverable meets the acceptance criteria.

ACCEPTANCE CRITERIA:
${criteria}

SUBMITTED DELIVERABLE:
${deliverable}

Respond in JSON format:
{
  "pass": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '{}';
  const result = JSON.parse(content);

  return {
    pass: result.pass ?? false,
    confidence: result.confidence ?? 0,
    reasoning: result.reasoning ?? 'No reasoning provided',
  };
}
