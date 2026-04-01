export type RetryableErrorKind = "none" | "rate_limit" | "overloaded" | "server" | "network";

export const MAX_OVERLOADED_RETRIES = 3;
export const RETRY_JITTER_RATIO = 0.25;

function clampDelay(delayMs: number, maxDelayMs: number): number {
	return Math.max(0, Math.min(delayMs, maxDelayMs));
}

export function classifyRetryableError(errorMessage: string): RetryableErrorKind {
	if (!errorMessage) return "none";
	if (/401|403|unauthorized|forbidden|authentication.?failed|invalid.?api.?key/i.test(errorMessage)) return "none";
	if (/429|rate.?limit|too many requests/i.test(errorMessage)) return "rate_limit";
	if (/overloaded|529/i.test(errorMessage)) return "overloaded";
	if (/500|502|503|504|service.?unavailable|server error|internal error/i.test(errorMessage)) return "server";
	if (/connection.?error|connection.?refused|other side closed|fetch failed|upstream.?connect|reset before headers|terminated|retry delay/i.test(errorMessage)) return "network";
	return "none";
}

export function extractRetryAfterMs(errorMessage: string, now: number = Date.now()): number | undefined {
	if (!errorMessage) return undefined;

	const durationMatch = errorMessage.match(
		/retry(?:[_\s-]?after|[_\s-]?in|[_\s-]?delay)?(?:\s+of)?[:=\s]+(\d+(?:\.\d+)?)(?:\s*)(milliseconds|msec|ms|seconds|secs|sec|s|minutes|mins|min|m)?/i,
	);
	if (durationMatch) {
		const value = Number(durationMatch[1]);
		if (!Number.isFinite(value) || value < 0) return undefined;
		const unit = (durationMatch[2] || "s").toLowerCase();
		if (unit === "ms" || unit === "msec" || unit === "milliseconds") return Math.round(value);
		if (unit === "m" || unit === "min" || unit === "mins" || unit === "minutes") return Math.round(value * 60_000);
		return Math.round(value * 1000);
	}

	const dateMatch = errorMessage.match(
		/retry(?:[_\s-]?after|[_\s-]?at)?[:=\s]+([A-Z][a-z]{2},\s+\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT)/,
	);
	if (!dateMatch) return undefined;

	const retryAt = Date.parse(dateMatch[1]);
	if (Number.isNaN(retryAt)) return undefined;
	return Math.max(0, retryAt - now);
}

export function getRetryLimit(kind: RetryableErrorKind, maxRetries: number): number {
	if (kind === "overloaded") {
		return Math.min(maxRetries, MAX_OVERLOADED_RETRIES);
	}
	return maxRetries;
}

export function getRetryDelayMs(options: {
	kind: RetryableErrorKind;
	attempt: number;
	baseDelayMs: number;
	maxDelayMs: number;
	errorMessage: string;
	random?: () => number;
	now?: number;
}): number {
	const { kind, attempt, baseDelayMs, maxDelayMs, errorMessage, random = Math.random, now = Date.now() } = options;
	const exponentialDelayMs = clampDelay(baseDelayMs * 2 ** Math.max(0, attempt - 1), maxDelayMs);
	const retryAfterMs = extractRetryAfterMs(errorMessage, now);
	const preferredDelayMs =
		kind === "rate_limit" && retryAfterMs !== undefined
			? clampDelay(retryAfterMs, maxDelayMs)
			: exponentialDelayMs;

	const jitterWindowMs = Math.round(preferredDelayMs * RETRY_JITTER_RATIO);
	if (jitterWindowMs <= 0) return preferredDelayMs;

	const jitterOffsetMs = Math.round((random() * 2 - 1) * jitterWindowMs);
	return Math.max(0, preferredDelayMs + jitterOffsetMs);
}

export function buildRetryFailureMessage(options: {
	kind: RetryableErrorKind;
	attempts: number;
	errorMessage: string;
}): string {
	const { kind, attempts, errorMessage } = options;
	if (!errorMessage) return `Request failed after ${attempts} retries.`;
	if (kind === "rate_limit") {
		return `Rate limit persisted after ${attempts} retries. Last error: ${errorMessage}`;
	}
	if (kind === "overloaded") {
		return `Service remained overloaded after ${attempts} retries. Last error: ${errorMessage}`;
	}
	if (kind === "network") {
		return `Network instability persisted after ${attempts} retries. Last error: ${errorMessage}`;
	}
	if (kind === "server") {
		return `Server errors persisted after ${attempts} retries. Last error: ${errorMessage}`;
	}
	return errorMessage;
}
