import { describe, expect, it } from 'vitest';
import {
  extractRetryAfterMs,
  isRetryableApiTestFailure,
  shouldRetryApiError,
  toRetryableApiTestError,
} from '../src/main/utils/api-retry';

describe('api retry helpers', () => {
  it('extracts retry-after from headers in seconds', () => {
    const retryAfterMs = extractRetryAfterMs({
      response: {
        headers: {
          'retry-after': '7',
        },
      },
    });

    expect(retryAfterMs).toBe(7000);
  });

  it('retries only transient API failures', () => {
    expect(shouldRetryApiError(new Error('429 too many requests'))).toBe(true);
    expect(shouldRetryApiError(new Error('529 overloaded_error'))).toBe(true);
    expect(shouldRetryApiError(new Error('fetch failed'))).toBe(true);
    expect(shouldRetryApiError(new Error('401 unauthorized'))).toBe(false);
  });

  it('maps retryable ApiTestResult failures into retryable errors', () => {
    expect(isRetryableApiTestFailure({ ok: false, errorType: 'rate_limited' })).toBe(true);
    expect(isRetryableApiTestFailure({ ok: false, errorType: 'server_error' })).toBe(true);
    expect(isRetryableApiTestFailure({ ok: false, errorType: 'unauthorized' })).toBe(false);

    const rateLimitError = toRetryableApiTestError({
      errorType: 'rate_limited',
      details: '429 too many requests',
    }) as Error & { status?: number };

    expect(rateLimitError.status).toBe(429);
    expect(rateLimitError.message).toContain('429');
  });
});
