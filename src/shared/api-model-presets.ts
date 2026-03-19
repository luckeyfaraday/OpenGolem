export type SharedProviderType =
  | 'openrouter'
  | 'anthropic'
  | 'custom'
  | 'openai'
  | 'gemini'
  | 'ollama'
  | 'openai-codex'
  | 'google-gemini-cli'
  | 'google-antigravity';

export type SharedCustomProtocolType = 'anthropic' | 'openai' | 'gemini';

export interface SharedProviderPreset {
  name: string;
  baseUrl: string;
  models: Array<{ id: string; name: string }>;
  keyPlaceholder: string;
  keyHint: string;
}

export interface SharedProviderPresets {
  openrouter: SharedProviderPreset;
  anthropic: SharedProviderPreset;
  custom: SharedProviderPreset;
  openai: SharedProviderPreset;
  gemini: SharedProviderPreset;
  ollama: SharedProviderPreset;
  'openai-codex': SharedProviderPreset;
  'google-gemini-cli': SharedProviderPreset;
  'google-antigravity': SharedProviderPreset;
}

export interface ModelInputGuidance {
  placeholder: string;
  hint: string;
}

export const API_PROVIDER_PRESETS: SharedProviderPresets = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'anthropic/claude-opus-4-6', name: 'anthropic/claude-opus-4-6' },
      { id: 'anthropic/claude-sonnet-4-6', name: 'anthropic/claude-sonnet-4-6' },
      { id: 'anthropic/claude-haiku-4-5', name: 'anthropic/claude-haiku-4-5' },
      { id: 'openai/gpt-5.4', name: 'openai/gpt-5.4' },
      { id: 'openai/gpt-5.3-codex', name: 'openai/gpt-5.3-codex' },
      { id: 'google/gemini-3.1-pro-preview', name: 'google/gemini-3.1-pro-preview' },
      { id: 'google/gemini-3-flash-preview', name: 'google/gemini-3-flash-preview' },
      { id: 'google/gemini-2.5-flash', name: 'google/gemini-2.5-flash' },
      { id: 'openrouter/hunter-alpha', name: 'openrouter/hunter-alpha' },
    ],
    keyPlaceholder: 'sk-or-v1-...',
    keyHint: '从 openrouter.ai/keys 获取',
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-opus-4-6', name: 'claude-opus-4-6' },
      { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6' },
      { id: 'claude-haiku-4-5', name: 'claude-haiku-4-5' },
      { id: 'claude-sonnet-4-5', name: 'claude-sonnet-4-5' },
      { id: 'claude-3-7-sonnet-latest', name: 'claude-3-7-sonnet-latest' },
    ],
    keyPlaceholder: 'sk-ant-...',
    keyHint: '从 console.anthropic.com 获取',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-5.4', name: 'gpt-5.4' },
      { id: 'gpt-5.4-pro', name: 'gpt-5.4-pro' },
      { id: 'gpt-5-mini', name: 'gpt-5-mini' },
      { id: 'gpt-5-nano', name: 'gpt-5-nano' },
      { id: 'gpt-5.3-codex', name: 'gpt-5.3-codex' },
      { id: 'o3', name: 'o3' },
      { id: 'gpt-4.1', name: 'gpt-4.1' },
    ],
    keyPlaceholder: 'sk-...',
    keyHint: '从 platform.openai.com 获取',
  },
  'openai-codex': {
    name: 'ChatGPT Codex',
    baseUrl: 'https://chatgpt.com/backend-api',
    models: [
      { id: 'gpt-5.4', name: 'gpt-5.4' },
      { id: 'gpt-5.3-codex', name: 'gpt-5.3-codex' },
      { id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' },
      { id: 'gpt-5.2', name: 'gpt-5.2' },
      { id: 'gpt-5.1-codex-max', name: 'gpt-5.1-codex-max' },
      { id: 'gpt-5.1-codex-mini', name: 'gpt-5.1-codex-mini' },
    ],
    keyPlaceholder: 'OAuth required',
    keyHint: 'Connect with your ChatGPT Plus or Pro account',
  },
  gemini: {
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    models: [
      { id: 'gemini-3.1-pro-preview', name: 'gemini-3.1-pro-preview' },
      { id: 'gemini-3-flash-preview', name: 'gemini-3-flash-preview' },
      { id: 'gemini-3.1-flash-lite-preview', name: 'gemini-3.1-flash-lite-preview' },
      { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro' },
      { id: 'gemini-2.5-flash', name: 'gemini-2.5-flash' },
      { id: 'gemini-2.5-flash-lite', name: 'gemini-2.5-flash-lite' },
    ],
    keyPlaceholder: 'AIza...',
    keyHint: '从 aistudio.google.com 获取',
  },
  'google-gemini-cli': {
    name: 'Gemini CLI',
    baseUrl: 'https://cloudcode-pa.googleapis.com',
    models: [
      { id: 'gemini-3.1-pro-preview', name: 'gemini-3.1-pro-preview' },
      { id: 'gemini-3-pro-preview', name: 'gemini-3-pro-preview' },
      { id: 'gemini-3-flash-preview', name: 'gemini-3-flash-preview' },
      { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro' },
      { id: 'gemini-2.5-flash', name: 'gemini-2.5-flash' },
      { id: 'gemini-2.0-flash', name: 'gemini-2.0-flash' },
    ],
    keyPlaceholder: 'OAuth required',
    keyHint: 'Connect with Google Cloud Code Assist OAuth',
  },
  'google-antigravity': {
    name: 'Antigravity',
    baseUrl: 'https://daily-cloudcode-pa.sandbox.googleapis.com',
    models: [
      { id: 'gemini-3.1-pro-high', name: 'gemini-3.1-pro-high' },
      { id: 'gemini-3.1-pro-low', name: 'gemini-3.1-pro-low' },
      { id: 'gemini-3-flash', name: 'gemini-3-flash' },
      { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6' },
      { id: 'claude-opus-4-6-thinking', name: 'claude-opus-4-6-thinking' },
      { id: 'gpt-oss-120b-medium', name: 'gpt-oss-120b-medium' },
    ],
    keyPlaceholder: 'OAuth required',
    keyHint: 'Connect with Google Antigravity OAuth',
  },
  ollama: {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    models: [
      { id: 'qwen3.5:0.8b', name: 'qwen3.5:0.8b' },
      { id: 'llama3.2:latest', name: 'llama3.2:latest' },
      { id: 'deepseek-r1:latest', name: 'deepseek-r1:latest' },
    ],
    keyPlaceholder: '可留空',
    keyHint: '多数 Ollama 部署可留空；如果你的代理层要求鉴权，也可以填写 Key',
  },
  custom: {
    name: '更多模型',
    baseUrl: '',
    models: [
      { id: 'deepseek-chat', name: 'deepseek-chat' },
      { id: 'deepseek-reasoner', name: 'deepseek-reasoner' },
      { id: 'kimi-k2-thinking', name: 'kimi-k2-thinking' },
      { id: 'glm-5', name: 'glm-5' },
      { id: 'MiniMax-M2.5', name: 'MiniMax-M2.5' },
      { id: 'qwen-max', name: 'qwen-max' },
      { id: 'grok-code-fast-1', name: 'grok-code-fast-1' },
      { id: 'mistral-large-latest', name: 'mistral-large-latest' },
    ],
    keyPlaceholder: 'sk-xxx',
    keyHint: '输入你的 API Key',
  },
};

export const PI_AI_CURATED_PRESETS: Record<string, { piProvider: string; pick: string[] }> = {
  openrouter: {
    piProvider: 'openrouter',
    pick: [
      'anthropic/claude-opus-4-6',
      'anthropic/claude-sonnet-4-6',
      'anthropic/claude-haiku-4-5',
      'openai/gpt-5.4',
      'openai/gpt-5.3-codex',
      'google/gemini-3.1-pro-preview',
      'google/gemini-3-flash-preview',
      'google/gemini-2.5-flash',
      'openrouter/hunter-alpha',
    ],
  },
  anthropic: {
    piProvider: 'anthropic',
    pick: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-3-7-sonnet-latest'],
  },
  openai: {
    piProvider: 'openai',
    pick: ['gpt-5.4', 'gpt-5.4-pro', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.3-codex', 'o3', 'gpt-4.1'],
  },
  'openai-codex': {
    piProvider: 'openai-codex',
    pick: ['gpt-5.4', 'gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.2', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini'],
  },
  gemini: {
    piProvider: 'google',
    pick: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  },
  'google-gemini-cli': {
    piProvider: 'google-gemini-cli',
    pick: ['gemini-3.1-pro-preview', 'gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  },
  'google-antigravity': {
    piProvider: 'google-antigravity',
    pick: ['gemini-3.1-pro-high', 'gemini-3.1-pro-low', 'gemini-3-flash', 'claude-sonnet-4-6', 'claude-opus-4-6-thinking', 'gpt-oss-120b-medium'],
  },
};

export function getModelInputGuidance(
  provider: SharedProviderType,
  customProtocol: SharedCustomProtocolType = 'anthropic'
): ModelInputGuidance {
  if (provider === 'openrouter') {
    return {
      placeholder: 'openai/gpt-5.4, anthropic/claude-sonnet-4-6, google/gemini-3-flash-preview',
      hint: 'Use the exact model ID for the selected protocol or endpoint.',
    };
  }

  if (provider === 'custom' && customProtocol === 'openai') {
    return {
      placeholder: 'deepseek-chat, deepseek-reasoner, qwen-max, gpt-4.1',
      hint: 'Use the exact model ID for the selected protocol or endpoint.',
    };
  }

  if (provider === 'custom' && customProtocol === 'gemini') {
    return {
      placeholder: 'gemini-3.1-pro-preview, gemini-3-flash-preview, gemini-2.5-flash',
      hint: 'Use the exact model ID for the selected protocol or endpoint.',
    };
  }

  if (provider === 'custom') {
    return {
      placeholder: 'glm-5, kimi-k2-thinking, claude-sonnet-4-6',
      hint: 'Use the exact model ID for the selected protocol or endpoint.',
    };
  }

  if (provider === 'openai') {
    return {
      placeholder: 'gpt-5.4, gpt-5.3-codex, o3',
      hint: 'Use the exact model ID for the selected protocol or endpoint.',
    };
  }

  if (provider === 'openai-codex') {
    return {
      placeholder: 'gpt-5.4, gpt-5.3-codex, gpt-5.2-codex',
      hint: 'Use the exact Codex model ID exposed by your ChatGPT subscription.',
    };
  }

  if (provider === 'ollama') {
    return {
      placeholder: 'qwen3.5:0.8b, llama3.2:latest, deepseek-r1:latest',
      hint: 'Use the exact model ID returned by your Ollama server.',
    };
  }

  if (provider === 'gemini') {
    return {
      placeholder: 'gemini-3.1-pro-preview, gemini-3-flash-preview, gemini-2.5-flash',
      hint: 'Use the exact model ID for the selected protocol or endpoint.',
    };
  }

  if (provider === 'google-gemini-cli') {
    return {
      placeholder: 'gemini-3.1-pro-preview, gemini-3-flash-preview, gemini-2.5-pro',
      hint: 'Use the exact Cloud Code Assist model ID exposed by pi-ai.',
    };
  }

  if (provider === 'google-antigravity') {
    return {
      placeholder: 'gemini-3.1-pro-high, claude-sonnet-4-6, gpt-oss-120b-medium',
      hint: 'Use the exact Antigravity model ID exposed by pi-ai.',
    };
  }

  return {
    placeholder: 'claude-sonnet-4-6, claude-opus-4-6',
    hint: 'Use the exact model ID for the selected protocol or endpoint.',
  };
}
