export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const RETRYABLE_CLIENT_ERRORS = new Set([408, 429]);
const MAX_RETRIES = 3;

export function shouldRetry(failureCount: number, error: Error): boolean {
  if (failureCount >= MAX_RETRIES) {
    return false;
  }
  if (error instanceof ApiError) {
    const isClientError = error.status >= 400 && error.status < 500;
    return !isClientError || RETRYABLE_CLIENT_ERRORS.has(error.status);
  }
  // No response at all: a network failure, usually temporary.
  return true;
}
