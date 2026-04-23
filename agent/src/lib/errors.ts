export async function withErrorHandling(
  handler: () => Promise<Response>
): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[agent error]', message);
    return Response.json({ error: message }, { status: 500 });
  }
}

export function requireMethod(request: Request, method: string): Response | null {
  if (request.method !== method) {
    return new Response(`Method ${request.method} not allowed`, { status: 405 });
  }
  return null;
}
