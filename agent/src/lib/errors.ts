/**
 * Custom error classes for agent operations.
 */

/**
 * Thrown when an API request has invalid parameters.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Thrown when an RPC call fails.
 */
export class RPCError extends Error {
  constructor(
    message: string,
    public code?: number,
    public cause?: Error
  ) {
    super(message);
    this.name = 'RPCError';
  }
}

/**
 * Thrown when a transaction fails.
 */
export class TransactionError extends Error {
  constructor(
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'TransactionError';
  }
}

/**
 * Thrown when authentication fails.
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown when a resource is not found.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Require POST method for an endpoint.
 * Returns error response if method is not POST.
 */
export function requireMethod(request: Request, method: string): Response | null {
  if (request.method !== method) {
    return new Response(`Method not allowed. Expected ${method}`, { status: 405 });
  }
  return null;
}

/**
 * Wrap a handler function with error handling.
 * Catches errors and returns appropriate HTTP responses.
 */
export async function withErrorHandling(
  handler: () => Promise<Response>
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = error instanceof ValidationError ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
