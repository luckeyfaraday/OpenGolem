import { describe, expect, it } from 'vitest';
import {
  buildRetryFailedTitle,
  buildRetryRecoveredTitle,
  buildRetryTraceTitle,
  DEFAULT_PI_RETRY_SETTINGS,
  formatRetryDelay,
  isTransientRetryableError,
} from '../src/main/claude/agent-retry';

describe('agent retry helpers', () => {
  it('uses stronger default retry settings than the previous minimal fallback', () => {
    expect(DEFAULT_PI_RETRY_SETTINGS).toEqual({
      enabled: true,
      maxRetries: 5,
      baseDelayMs: 1500,
      maxDelayMs: 30000,
    });
  });

  it('classifies transient upstream failures as retryable', () => {
    expect(isTransientRetryableError('HTTP 529 overloaded_error')).toBe(true);
    expect(isTransientRetryableError('429 too many requests')).toBe(true);
    expect(isTransientRetryableError('fetch failed: other side closed')).toBe(true);
    expect(isTransientRetryableError('401 unauthorized')).toBe(false);
    expect(isTransientRetryableError('400 invalid request')).toBe(false);
  });

  it('formats retry trace titles clearly', () => {
    expect(formatRetryDelay(1500)).toBe('1.5s');
    expect(buildRetryTraceTitle(2, 5, 2000, 'HTTP 529 overloaded_error'))
      .toBe('Retrying request (2/5) in 2s: HTTP 529 overloaded_error');
    expect(buildRetryRecoveredTitle(2)).toContain('recovered');
    expect(buildRetryFailedTitle('429 too many requests')).toContain('429 too many requests');
  });
});
