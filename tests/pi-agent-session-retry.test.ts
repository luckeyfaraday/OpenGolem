import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const agentSessionPath = path.resolve(
  process.cwd(),
  'packages/pi-coding-agent/dist/core/agent-session.js'
);
const agentSessionContent = readFileSync(agentSessionPath, 'utf8');

describe('vendored pi agent-session retry behavior', () => {
  it('uses the shared retry policy module for classification and delay handling', () => {
    expect(agentSessionContent).toContain('./retry-policy.js');
    expect(agentSessionContent).toContain('classifyRetryableError(message.errorMessage)');
    expect(agentSessionContent).toContain('getRetryLimit(classifyRetryableError(message.errorMessage || ""), settings.maxRetries)');
    expect(agentSessionContent).toContain('getRetryDelayMs({');
  });

  it('uses the refined retry limit, delay, and final error messaging in auto-retry events', () => {
    expect(agentSessionContent).toContain('const maxAttempts = this._getRetryLimit(message, settings);');
    expect(agentSessionContent).toContain('const delayMs = this._getRetryDelayMs(message, settings);');
    expect(agentSessionContent).toContain('maxAttempts,');
    expect(agentSessionContent).toContain('finalError: buildRetryFailureMessage({');
  });
});
