import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/tmp',
    getVersion: () => '0.0.0',
  },
}));

import { mergeShellEnvForMcp, shouldHydrateOpenAIFromLocalCodex } from '../src/main/mcp/mcp-manager';

describe('mcp-manager env merge and hydration guards', () => {
  it('keeps app-configured auth env over shell env', () => {
    const merged = mergeShellEnvForMcp(
      {
        OPENAI_BASE_URL: 'https://chatgpt.com/backend-api/codex',
        OPENAI_MODEL: 'gpt-5.3-codex',
        ANTHROPIC_API_KEY: 'app-anthropic-key',
        LANG: '',
      },
      {
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
        ANTHROPIC_API_KEY: 'shell-anthropic-key',
        LANG: 'en_US.UTF-8',
      }
    );

    expect(merged.OPENAI_BASE_URL).toBe('https://chatgpt.com/backend-api/codex');
    expect(merged.ANTHROPIC_API_KEY).toBe('app-anthropic-key');
    expect(merged.LANG).toBe('en_US.UTF-8');
  });

  it('does not import PATH from shell in helper (PATH handled separately)', () => {
    const merged = mergeShellEnvForMcp(
      {
        PATH: '/app/path',
      },
      {
        PATH: '/shell/path',
      }
    );

    expect(merged.PATH).toBe('/app/path');
  });

  it('hydrates local codex auth only for explicit OpenAI context', () => {
    expect(
      shouldHydrateOpenAIFromLocalCodex({
        OPENAI_MODEL: 'gpt-5.3-codex',
      })
    ).toBe(true);

    expect(
      shouldHydrateOpenAIFromLocalCodex({
        OPENAI_BASE_URL: 'https://chatgpt.com/backend-api/codex',
      })
    ).toBe(true);

    expect(
      shouldHydrateOpenAIFromLocalCodex({
        OPENAI_API_MODE: 'responses',
      })
    ).toBe(true);

    expect(
      shouldHydrateOpenAIFromLocalCodex({
        OPENAI_CODEX_OAUTH: '1',
      })
    ).toBe(true);

    expect(
      shouldHydrateOpenAIFromLocalCodex({
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
      })
    ).toBe(false);

    expect(shouldHydrateOpenAIFromLocalCodex({})).toBe(false);
  });
});
