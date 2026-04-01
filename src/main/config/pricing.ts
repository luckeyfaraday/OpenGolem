import type { AppConfig, Message, PricingOverride } from '../../renderer/types';

interface PricingEntry {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  inputPerMillionHighUsd?: number;
  outputPerMillionHighUsd?: number;
}

interface PricingMatch {
  provider: AppConfig['provider'];
  matcher: RegExp;
  entry: PricingEntry;
}

const PRICING_MATCHES: PricingMatch[] = [
  {
    provider: 'openai',
    matcher: /\bgpt-5\.4-mini\b/,
    entry: { inputPerMillionUsd: 0.75, outputPerMillionUsd: 4.5 },
  },
  {
    provider: 'openai',
    matcher: /\bgpt-5\.4-nano\b/,
    entry: { inputPerMillionUsd: 0.2, outputPerMillionUsd: 1.25 },
  },
  {
    provider: 'openai',
    matcher: /\bgpt-5\.4\b/,
    entry: { inputPerMillionUsd: 2.5, outputPerMillionUsd: 15 },
  },
  {
    provider: 'openai',
    matcher: /\bgpt-4\.1-mini\b/,
    entry: { inputPerMillionUsd: 0.4, outputPerMillionUsd: 1.6 },
  },
  {
    provider: 'openai',
    matcher: /\bgpt-4\.1-nano\b/,
    entry: { inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4 },
  },
  {
    provider: 'openai',
    matcher: /\bgpt-4\.1\b/,
    entry: { inputPerMillionUsd: 2, outputPerMillionUsd: 8 },
  },
  {
    provider: 'anthropic',
    matcher: /\bclaude-(?:sonnet-4|3-7-sonnet|3-5-sonnet)\b/,
    entry: { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
  },
  {
    provider: 'anthropic',
    matcher: /\bclaude-(?:opus-4\.1|opus-4)\b/,
    entry: { inputPerMillionUsd: 15, outputPerMillionUsd: 75 },
  },
  {
    provider: 'anthropic',
    matcher: /\bclaude-(?:3-5-haiku|3-haiku)\b/,
    entry: { inputPerMillionUsd: 0.8, outputPerMillionUsd: 4 },
  },
  {
    provider: 'gemini',
    matcher: /\bgemini-2\.5-pro\b/,
    entry: {
      inputPerMillionUsd: 1.25,
      outputPerMillionUsd: 10,
      inputPerMillionHighUsd: 2.5,
      outputPerMillionHighUsd: 15,
    },
  },
  {
    provider: 'gemini',
    matcher: /\bgemini-2\.5-flash-lite\b/,
    entry: {
      inputPerMillionUsd: 0.1,
      outputPerMillionUsd: 0.4,
      inputPerMillionHighUsd: 0.2,
      outputPerMillionHighUsd: 0.8,
    },
  },
  {
    provider: 'gemini',
    matcher: /\bgemini-2\.5-flash\b/,
    entry: {
      inputPerMillionUsd: 0.3,
      outputPerMillionUsd: 2.5,
      inputPerMillionHighUsd: 0.6,
      outputPerMillionHighUsd: 5,
    },
  },
];

function normalizeModelCandidate(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function buildPricingOverrideKey(provider: AppConfig['provider'], model: string): string {
  return `${provider.trim().toLowerCase()}::${model.trim().toLowerCase()}`;
}

function resolvePricingEntry(
  provider: AppConfig['provider'],
  modelCandidates: Array<string | null | undefined>,
  pricingOverrides?: Record<string, PricingOverride>
): PricingEntry | null {
  for (const candidate of modelCandidates) {
    const normalized = normalizeModelCandidate(candidate);
    if (!normalized) continue;
    const override = pricingOverrides?.[buildPricingOverrideKey(provider, normalized)];
    if (override) {
      return {
        inputPerMillionUsd: override.inputPerMillionUsd,
        outputPerMillionUsd: override.outputPerMillionUsd,
      };
    }
  }

  if (!['openai', 'anthropic', 'gemini'].includes(provider)) {
    return null;
  }

  for (const candidate of modelCandidates) {
    const normalized = normalizeModelCandidate(candidate);
    if (!normalized) continue;
    const match = PRICING_MATCHES.find(
      (entry) => entry.provider === provider && entry.matcher.test(normalized)
    );
    if (match) {
      return match.entry;
    }
  }

  return null;
}

export function estimateMessageCostUsd(options: {
  provider: AppConfig['provider'];
  configuredModel?: string | null;
  resolvedModelId?: string | null;
  tokenUsage?: Message['tokenUsage'];
  pricingOverrides?: Record<string, PricingOverride>;
}): number | undefined {
  const { provider, configuredModel, resolvedModelId, tokenUsage, pricingOverrides } = options;
  if (!tokenUsage) {
    return undefined;
  }

  const inputTokens = Math.max(0, tokenUsage.input || 0);
  const outputTokens = Math.max(0, tokenUsage.output || 0);
  if (inputTokens === 0 && outputTokens === 0) {
    return undefined;
  }

  const pricing = resolvePricingEntry(provider, [configuredModel, resolvedModelId], pricingOverrides);
  if (!pricing) {
    return undefined;
  }

  const inputRate =
    pricing.inputPerMillionHighUsd !== undefined && inputTokens > 200_000
      ? pricing.inputPerMillionHighUsd
      : pricing.inputPerMillionUsd;
  const outputRate =
    pricing.outputPerMillionHighUsd !== undefined && inputTokens > 200_000
      ? pricing.outputPerMillionHighUsd
      : pricing.outputPerMillionUsd;

  const cost = (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
  return Number(cost.toFixed(6));
}
