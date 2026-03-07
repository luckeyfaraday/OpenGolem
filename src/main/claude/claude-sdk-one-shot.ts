import { getModel, completeSimple, type UserMessage as PiUserMessage } from '@mariozechner/pi-ai';
import type { ApiTestInput, ApiTestResult } from '../../renderer/types';
import { PROVIDER_PRESETS, type AppConfig, type CustomProtocolType } from '../config/config-store';
import { normalizeAnthropicBaseUrl } from '../config/auth-utils';
import { logWarn } from '../utils/logger';
import { normalizeGeneratedTitle } from '../session/session-title-utils';
import { getSharedAuthStorage } from './shared-auth';

const NETWORK_ERROR_RE = /enotfound|econnrefused|etimedout|eai_again|enetunreach|timed?\s*out|timeout|abort|network\s*error/i;
const AUTH_ERROR_RE = /authentication[_\s-]?failed|unauthorized|invalid[_\s-]?api[_\s-]?key|forbidden|401|403/i;
const RATE_LIMIT_RE = /rate[_\s-]?limit|too\s+many\s+requests|429/i;
const SERVER_ERROR_RE = /server[_\s-]?error|internal\s+server\s+error|5\d\d/i;
const PROBE_ACK = 'sdk_probe_ok';

function inferOneShotApi(protocol: string): string {
  switch (protocol) {
    case 'anthropic': return 'anthropic-messages';
    case 'openai': return 'openai-completions';
    case 'gemini': return 'google-generative-ai';
    default: return 'openai-completions';
  }
}

function resolveCustomProtocol(provider: AppConfig['provider'], customProtocol?: CustomProtocolType): CustomProtocolType {
  if (provider === 'custom') {
    if (customProtocol === 'openai' || customProtocol === 'gemini') {
      return customProtocol;
    }
    return 'anthropic';
  }
  if (provider === 'openai') return 'openai';
  if (provider === 'gemini') return 'gemini';
  return 'anthropic';
}

function resolveProbeBaseUrl(input: ApiTestInput): string | undefined {
  const configured = input.baseUrl?.trim();
  if (configured) return configured;
  if (input.provider !== 'custom') {
    return PROVIDER_PRESETS[input.provider]?.baseUrl;
  }
  return undefined;
}

function buildProbeConfig(input: ApiTestInput, config: AppConfig): AppConfig {
  const resolvedBaseUrl = resolveProbeBaseUrl(input);
  const normalizedInputApiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : undefined;
  const effectiveApiKey = normalizedInputApiKey || config.apiKey?.trim() || '';
  const resolvedCustomProtocol = resolveCustomProtocol(input.provider, input.customProtocol);
  const effectiveRawBaseUrl = input.provider === 'custom' ? resolvedBaseUrl || '' : resolvedBaseUrl || config.baseUrl;
  const effectiveBaseUrl = resolvedCustomProtocol === 'openai' || resolvedCustomProtocol === 'gemini'
    ? effectiveRawBaseUrl
    : normalizeAnthropicBaseUrl(effectiveRawBaseUrl);
  return {
    ...config,
    provider: input.provider,
    customProtocol: resolvedCustomProtocol,
    apiKey: effectiveApiKey,
    baseUrl: input.provider === 'custom' ? effectiveBaseUrl || '' : effectiveBaseUrl || config.baseUrl,
    model: input.model?.trim() || config.model,
  };
}

function mapPiAiError(errorText: string, durationMs: number): ApiTestResult {
  const details = errorText.trim();
  const lowered = details.toLowerCase();

  if (AUTH_ERROR_RE.test(lowered)) {
    return { ok: false, latencyMs: durationMs, errorType: 'unauthorized', details };
  }
  if (RATE_LIMIT_RE.test(lowered)) {
    return { ok: false, latencyMs: durationMs, errorType: 'rate_limited', details };
  }
  if (SERVER_ERROR_RE.test(lowered)) {
    return { ok: false, latencyMs: durationMs, errorType: 'server_error', details };
  }
  if (NETWORK_ERROR_RE.test(lowered)) {
    return { ok: false, latencyMs: durationMs, errorType: 'network_error', details };
  }
  return { ok: false, latencyMs: durationMs, errorType: 'unknown', details };
}

/**
 * Resolve provider + model from config, returning the pi-ai model ID string.
 */
function resolvePiModelString(config: AppConfig): string {
  const model = config.model?.trim();
  if (!model) return 'anthropic/claude-sonnet-4';
  // If model already has provider prefix, use as-is
  if (model.includes('/')) return model;
  // Map provider to prefix
  const provider = config.provider || 'anthropic';
  const protocol = config.customProtocol || provider;
  return `${protocol}/${model}`;
}

/**
 * Run a simple one-shot prompt via pi-ai model directly (no agent session needed).
 */
async function runPiAiOneShot(
  prompt: string,
  systemPrompt: string,
  config: AppConfig,
): Promise<{ text: string; durationMs: number }> {
  const modelString = resolvePiModelString(config);
  const keyProvider = config.customProtocol || config.provider || 'anthropic';
  const parts = modelString.split('/');
  const provider = parts.length >= 2 ? parts[0] : keyProvider;
  const modelId = parts.length >= 2 ? parts.slice(1).join('/') : parts[0];

  // Resolution order: key provider with full string (aggregator), parsed provider, fallbacks
  let piModel: ReturnType<typeof getModel> = undefined as any;
  if (keyProvider !== provider && parts.length >= 2) {
    piModel = getModel(keyProvider as any, modelString);
  }
  if (!piModel) {
    piModel = getModel(provider as any, modelId);
  }
  if (!piModel) {
    for (const fp of ['openai', 'anthropic', 'google'].filter(p => p !== provider && p !== keyProvider)) {
      piModel = getModel(fp as any, modelId);
      if (piModel) break;
    }
  }

  if (!piModel) {
    // Synthetic fallback for unknown/custom models
    const effectiveProtocol = resolveCustomProtocol(config.provider, config.customProtocol);
    const api = config.baseUrl?.trim() ? 'openai-completions' : inferOneShotApi(effectiveProtocol);
    piModel = {
      id: modelId,
      name: modelId,
      api,
      provider,
      baseUrl: config.baseUrl?.trim() || '',
      reasoning: false,
      input: ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16384,
    } as any;
    logWarn('[OneShot] Model not in pi-ai registry, using synthetic model:', modelString, '→', api);
  }

  // piModel is guaranteed non-undefined after synthetic fallback
  const resolvedModel = piModel!;

  // Override baseUrl for custom endpoints
  if (config.baseUrl?.trim()) {
    const api = resolvedModel.api === 'openai-responses' ? 'openai-completions' : resolvedModel.api;
    Object.assign(resolvedModel, { baseUrl: config.baseUrl.trim(), api });
  }

  // Set API key via AuthStorage (same pattern as agent-runner)
  const apiKey = config.apiKey?.trim();
  if (apiKey) {
    const authStorage = getSharedAuthStorage();
    // Set for the config provider
    authStorage.setRuntimeApiKey(provider, apiKey);
    // Also set for the model's native provider if different
    if (resolvedModel.provider !== provider) {
      authStorage.setRuntimeApiKey(resolvedModel.provider, apiKey);
    }
  }

  const start = Date.now();

  // Use pi-ai's completeSimple for a one-shot call
  const userMsg: PiUserMessage = { role: 'user', content: prompt, timestamp: Date.now() };
  const response = await completeSimple(resolvedModel, {
    systemPrompt,
    messages: [userMsg],
  });

  // Extract text from response
  const textBlocks = response.content.filter(b => b.type === 'text');
  const text = textBlocks.map(b => (b as { text: string }).text).join('').trim();
  return { text, durationMs: Date.now() - start };
}

function normalizeProbeAck(raw: string): string {
  return raw.replace(/^["'`]+|["'`]+$/g, '').trim().toLowerCase();
}

export async function probeWithClaudeSdk(input: ApiTestInput, config: AppConfig): Promise<ApiTestResult> {
  const probeConfig = buildProbeConfig(input, config);

  if (input.provider === 'custom' && !probeConfig.baseUrl?.trim()) {
    return { ok: false, errorType: 'missing_base_url' };
  }

  if (!probeConfig.model?.trim()) {
    return { ok: false, errorType: 'unknown', details: 'missing_model' };
  }

  if (!probeConfig.apiKey?.trim()) {
    return { ok: false, errorType: 'missing_key', details: 'API key is required.' };
  }

  try {
    const result = await runPiAiOneShot(
      `Please reply with exactly: ${PROBE_ACK}`,
      `You are a connectivity probe. Do not use tools. Reply with exactly: ${PROBE_ACK}`,
      probeConfig,
    );

    if (!result.text) {
      return {
        ok: false,
        latencyMs: result.durationMs,
        errorType: 'unknown',
        details: 'empty_probe_response',
      };
    }
    if (normalizeProbeAck(result.text) !== PROBE_ACK) {
      return {
        ok: false,
        latencyMs: result.durationMs,
        errorType: 'unknown',
        details: `probe_response_mismatch:${result.text.slice(0, 120)}`,
      };
    }
    return { ok: true, latencyMs: result.durationMs };
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return mapPiAiError(details, 0);
  }
}

export async function generateTitleWithClaudeSdk(
  titlePrompt: string,
  config: AppConfig,
  _cwdOverride?: string,
): Promise<string | null> {
  try {
    const result = await runPiAiOneShot(
      titlePrompt,
      'Generate a concise title. Reply with only the title text and no extra markup.',
      config,
    );
    return normalizeGeneratedTitle(result.text);
  } catch (error) {
    logWarn('[SessionTitle] pi-ai title generation failed:', error);
    return null;
  }
}
