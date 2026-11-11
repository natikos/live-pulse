import { describe, expect, it } from 'vitest';
import { ApiError, shouldRetry } from './errors';

describe('shouldRetry', () => {
  it('does not retry a client error', () => {
    expect(shouldRetry(0, new ApiError(400, undefined))).toBe(false);
    expect(shouldRetry(0, new ApiError(404, undefined))).toBe(false);
  });

  it('retries a timeout and rate limiting', () => {
    expect(shouldRetry(0, new ApiError(408, undefined))).toBe(true);
    expect(shouldRetry(0, new ApiError(429, undefined))).toBe(true);
  });

  it('retries a server error until the limit', () => {
    expect(shouldRetry(0, new ApiError(500, undefined))).toBe(true);
    expect(shouldRetry(2, new ApiError(500, undefined))).toBe(true);
    expect(shouldRetry(3, new ApiError(500, undefined))).toBe(false);
  });

  it('retries a network failure', () => {
    expect(shouldRetry(0, new TypeError('Failed to fetch'))).toBe(true);
  });
});
