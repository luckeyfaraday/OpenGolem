import { describe, expect, it } from 'vitest';

import {
  buildRetryFailureMessage,
  classifyRetryableError,
  extractRetryAfterMs,
  getRetryDelayMs,
  getRetryLimit,
} from '../packages/pi-coding-agent/src/core/retry-policy.ts';

describe('vendored pi retry policy', () => {
  it('classifies auth, rate-limit, overloaded, server, and network failures', () => {
    expect(classifyRetryableError('HTTP 401 unauthorized')).toBe('none');
    expect(classifyRetryableError('429 rate limit exceeded')).toBe('rate_limit');
    expect(classifyRetryableError('529 overloaded_error')).toBe('overloaded');
    expect(classifyRetryableError('503 service unavailable')).toBe('server');
    expect(classifyRetryableError('fetch failed: upstream connect error')).toBe('network');
  });

  it('extracts retry-after durations and dates', () => {
    expect(extractRetryAfterMs('please retry after 7s')).toBe(7000);
    expect(extractRetryAfterMs('retry in 1.5 minutes')).toBe(90000);
    expect(
      extractRetryAfterMs(
        'retry after Tue, 31 Mar 2026 10:00:05 GMT',
        Date.parse('Tue, 31 Mar 2026 10:00:00 GMT')
      )
    ).toBe(5000);
  });

  it('caps overloaded retries and honors retry-after for rate limits', () => {
    expect(getRetryLimit('overloaded', 8)).toBe(3);
    expect(getRetryLimit('rate_limit', 8)).toBe(8);

    expect(
      getRetryDelayMs({
        kind: 'rate_limit',
        attempt: 2,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        errorMessage: '429 rate limit, retry after 7s',
        random: () => 0.5,
      })
    ).toBe(7000);
  });

  it('formats clearer exhausted retry failures', () => {
    expect(
      buildRetryFailureMessage({
        kind: 'overloaded',
        attempts: 3,
        errorMessage: '529 overloaded_error',
      })
    ).toContain('Service remained overloaded after 3 retries.');
  });
});
