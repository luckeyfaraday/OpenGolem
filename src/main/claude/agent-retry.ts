export const DEFAULT_PI_RETRY_SETTINGS = {
  enabled: true,
  maxRetries: 5,
  baseDelayMs: 1500,
  maxDelayMs: 30000,
} as const;

const TRANSIENT_RETRYABLE_ERROR_RE =
  /overloaded|529|rate.?limit|too many requests|429|500|502|503|504|service.?unavailable|server error|internal error|connection.?error|connection.?refused|other side closed|fetch failed|upstream.?connect|reset before headers|terminated|retry delay/i;

export function isTransientRetryableError(errorText: string | undefined): boolean {
  if (!errorText) {
    return false;
  }
  return TRANSIENT_RETRYABLE_ERROR_RE.test(errorText);
}

export function formatRetryDelay(delayMs: number): string {
  if (delayMs < 1000) {
    return `${delayMs}ms`;
  }
  const seconds = delayMs / 1000;
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
}

export function buildRetryTraceTitle(
  attempt: number,
  maxAttempts: number,
  delayMs: number,
  errorMessage: string,
): string {
  return `Retrying request (${attempt}/${maxAttempts}) in ${formatRetryDelay(delayMs)}: ${errorMessage}`;
}

export function buildRetryRecoveredTitle(attempt: number): string {
  return attempt > 1 ? `Request recovered after ${attempt} retries` : 'Request recovered after retry';
}

export function buildRetryFailedTitle(finalError?: string): string {
  return finalError ? `Automatic retry failed: ${finalError}` : 'Automatic retry failed';
}
