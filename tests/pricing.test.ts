import { describe, expect, it } from 'vitest';
import { estimateMessageCostUsd } from '../src/main/config/pricing';

describe('estimateMessageCostUsd', () => {
  it('estimates direct OpenAI model costs from token usage', () => {
    expect(
      estimateMessageCostUsd({
        provider: 'openai',
        configuredModel: 'gpt-5.4-mini',
        tokenUsage: { input: 1000, output: 500 },
      })
    ).toBe(0.003);
  });

  it('uses Gemini high-range pricing above 200k input tokens', () => {
    expect(
      estimateMessageCostUsd({
        provider: 'gemini',
        configuredModel: 'gemini-2.5-pro',
        tokenUsage: { input: 250_000, output: 1000 },
      })
    ).toBe(0.64);
  });

  it('returns undefined for unsupported providers and unknown models', () => {
    expect(
      estimateMessageCostUsd({
        provider: 'openrouter',
        configuredModel: 'openrouter/anthropic/claude-sonnet-4',
        tokenUsage: { input: 1000, output: 500 },
      })
    ).toBeUndefined();

    expect(
      estimateMessageCostUsd({
        provider: 'openai',
        configuredModel: 'custom-lab-model',
        tokenUsage: { input: 1000, output: 500 },
      })
    ).toBeUndefined();
  });

  it('prefers manual pricing overrides for custom and unknown models', () => {
    expect(
      estimateMessageCostUsd({
        provider: 'openrouter',
        configuredModel: 'openrouter/anthropic/claude-sonnet-4',
        tokenUsage: { input: 1000, output: 500 },
        pricingOverrides: {
          'openrouter::openrouter/anthropic/claude-sonnet-4': {
            inputPerMillionUsd: 1.5,
            outputPerMillionUsd: 6,
          },
        },
      })
    ).toBe(0.0045);
  });
});
