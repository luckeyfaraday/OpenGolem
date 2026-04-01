import { logWarn } from './logger';

/**
 * Retry helper for async operations with exponential backoff.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: Error) => boolean;
    resolveDelayMs?: (attempt: number, error: Error, defaultDelayMs: number) => number | undefined;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    maxDelayMs = Number.POSITIVE_INFINITY,
    shouldRetry = () => true,
    resolveDelayMs,
    onRetry,
  } = options;

  let lastError: Error | undefined;
  let currentDelay = delayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      if (onRetry) {
        onRetry(attempt, lastError);
      }

      const requestedDelay = resolveDelayMs?.(attempt, lastError, currentDelay);
      const nextDelay = Math.min(
        maxDelayMs,
        typeof requestedDelay === 'number' && Number.isFinite(requestedDelay) && requestedDelay >= 0
          ? requestedDelay
          : currentDelay
      );

      logWarn(`[Retry] Attempt ${attempt}/${maxRetries} failed, retrying in ${nextDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, nextDelay));
      currentDelay *= backoffMultiplier;
    }
  }

  throw lastError;
}
