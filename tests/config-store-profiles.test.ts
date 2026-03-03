import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  seed: {} as Record<string, unknown>,
}));

vi.mock('electron-store', () => {
  class MockStore<T extends Record<string, unknown>> {
    public store: Record<string, unknown>;
    public path = '/tmp/mock-config-store.json';

    constructor(options: { defaults?: Record<string, unknown> }) {
      this.store = {
        ...(options?.defaults || {}),
        ...mocks.seed,
      };
    }

    get<K extends keyof T>(key: K): T[K] {
      return this.store[key as string] as T[K];
    }

    set(key: string | Record<string, unknown>, value?: unknown): void {
      if (typeof key === 'string') {
        this.store[key] = value;
        return;
      }
      this.store = {
        ...this.store,
        ...key,
      };
    }

    clear(): void {
      this.store = {};
    }
  }

  return {
    default: MockStore,
  };
});

import { ConfigStore } from '../src/main/config/config-store';

describe('ConfigStore provider profiles', () => {
  beforeEach(() => {
    mocks.seed = {};
  });

  it('migrates legacy single-profile fields into active profile', () => {
    mocks.seed = {
      provider: 'openai',
      customProtocol: 'openai',
      apiKey: 'sk-legacy-openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.2-mini',
      openaiMode: 'responses',
      enableDevLogs: true,
      sandboxEnabled: false,
      enableThinking: false,
      isConfigured: true,
    };

    const store = new ConfigStore();
    const config = store.getAll();

    expect(config.activeProfileKey).toBe('openai');
    expect(config.apiKey).toBe('sk-legacy-openai');
    expect(config.profiles.openai?.apiKey).toBe('sk-legacy-openai');
    expect(config.profiles.openrouter?.apiKey).toBe('');
    expect(config.profiles['custom:anthropic']?.apiKey).toBe('');
  });

  it('switches provider without overwriting other provider profiles', () => {
    mocks.seed = {
      provider: 'openai',
      customProtocol: 'anthropic',
      activeProfileKey: 'openai',
      profiles: {
        openai: {
          apiKey: 'sk-openai',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-5.2',
          openaiMode: 'responses',
        },
        openrouter: {
          apiKey: 'sk-openrouter',
          baseUrl: 'https://openrouter.ai/api',
          model: 'anthropic/claude-sonnet-4.5',
          openaiMode: 'responses',
        },
        anthropic: {
          apiKey: 'sk-ant',
          baseUrl: 'https://api.anthropic.com',
          model: 'claude-sonnet-4-5',
          openaiMode: 'responses',
        },
        'custom:anthropic': {
          apiKey: 'sk-custom-ant',
          baseUrl: 'https://custom.example/anthropic',
          model: 'glm-4.7',
          openaiMode: 'responses',
        },
        'custom:openai': {
          apiKey: 'sk-custom-openai',
          baseUrl: 'https://custom.example/openai/v1',
          model: 'gpt-5.2',
          openaiMode: 'responses',
        },
      },
      enableDevLogs: true,
      sandboxEnabled: false,
      enableThinking: false,
      isConfigured: true,
    };

    const store = new ConfigStore();
    store.update({ provider: 'openrouter' });
    const switched = store.getAll();

    expect(switched.provider).toBe('openrouter');
    expect(switched.apiKey).toBe('sk-openrouter');
    expect(switched.profiles.openai?.apiKey).toBe('sk-openai');

    store.update({ provider: 'openai' });
    const back = store.getAll();
    expect(back.provider).toBe('openai');
    expect(back.apiKey).toBe('sk-openai');
  });

  it('updates active profile credentials only for current profile', () => {
    const store = new ConfigStore();

    store.update({ provider: 'openrouter' });
    store.update({
      apiKey: 'sk-or-new',
      model: 'anthropic/claude-sonnet-4',
      baseUrl: 'https://openrouter.ai/api',
    });

    store.update({ provider: 'openai' });
    const openaiView = store.getAll();
    expect(openaiView.provider).toBe('openai');
    expect(openaiView.apiKey).toBe('');

    store.update({ provider: 'openrouter' });
    const openrouterView = store.getAll();
    expect(openrouterView.provider).toBe('openrouter');
    expect(openrouterView.apiKey).toBe('sk-or-new');
    expect(openrouterView.model).toBe('anthropic/claude-sonnet-4');
  });

  it('treats global configured state as any set usable while active set can still be unusable', () => {
    const store = new ConfigStore();

    store.update({ provider: 'openrouter', apiKey: 'sk-or-global' });
    store.createSet({ name: 'Blank Active', mode: 'blank' });

    expect(store.hasUsableCredentialsForActiveSet()).toBe(false);
    expect(store.hasAnyUsableCredentials()).toBe(true);
    expect(store.isConfigured()).toBe(true);
  });
});
