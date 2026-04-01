import type { ApiTestResult } from '../../renderer/types';

type HeaderBag =
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>
  | undefined
  | null;

type RetryableError = Error & {
  status?: number;
  headers?: HeaderBag;
  response?: {
    headers?: HeaderBag;
    status?: number;
  };
  retryAfterMs?: number;
};

const RATE_LIMIT_RE = /429|rate[_\s-]?limit|too\s+many\s+requests/i;
const OVERLOADED_RE = /529|overloaded|service\s+unavailable|server\s+error|internal\s+error|5\d\d/i;
const NETWORK_RE = /enotfound|econnrefused|etimedout|eai_again|enetunreach|timed?\s*out|timeout|abort|network\s*error|fetch failed|other side closed|upstream connect|reset before headers/i;
const AUTH_RE = /401|403|unauthorized|forbidden|invalid[_\s-]?api[_\s-]?key|authentication[_\s-]?failed/i;

function readHeaderValue(headers: HeaderBag, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }
  if (typeof (headers as { get?: unknown }).get === 'function') {
    const value = (headers as { get(name: string): string | null }).get(name);
    return value ?? undefined;
  }
  const direct = (headers as Record<string, string | string[] | undefined>)[name]
    ?? (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()];
  if (Array.isArray(direct)) {
    return direct[0];
  }
  return direct;
}

export function extractRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const typed = error as RetryableError;
  if (typeof typed.retryAfterMs === 'number' && Number.isFinite(typed.retryAfterMs) && typed.retryAfterMs >= 0) {
    return typed.retryAfterMs;
  }

  const headerValue =
    readHeaderValue(typed.headers, 'retry-after')
    ?? readHeaderValue(typed.response?.headers, 'retry-after');

  if (!headerValue) {
    return undefined;
  }

  const numericSeconds = Number(headerValue);
  if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
    return Math.round(numericSeconds * 1000);
  }

  const retryAt = Date.parse(headerValue);
  if (Number.isNaN(retryAt)) {
    return undefined;
  }

  return Math.max(0, retryAt - Date.now());
}

export function shouldRetryApiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (AUTH_RE.test(message)) {
    return false;
  }
  return RATE_LIMIT_RE.test(message) || OVERLOADED_RE.test(message) || NETWORK_RE.test(message);
}

export function isRetryableApiTestFailure(result: Pick<ApiTestResult, 'ok' | 'errorType'>): boolean {
  if (result.ok) {
    return false;
  }
  return result.errorType === 'rate_limited' || result.errorType === 'server_error' || result.errorType === 'network_error';
}

export function toRetryableApiTestError(result: Pick<ApiTestResult, 'errorType' | 'details'>): Error {
  const error = new Error(result.details || result.errorType || 'api_test_failed') as RetryableError;
  if (result.errorType === 'rate_limited') {
    error.status = 429;
  } else if (result.errorType === 'server_error') {
    error.status = 529;
  }
  return error;
}
