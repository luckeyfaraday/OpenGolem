import { describe, expect, it } from 'vitest';
import type { Message } from '../src/renderer/types/index';
import {
  buildRemoteSessionBanner,
  formatRemoteHistory,
  parseRemoteCommand,
} from '../src/main/remote/remote-command-utils';

describe('remote command utils', () => {
  it('parses supported slash commands after stripping mentions', () => {
    expect(parseRemoteCommand('@OpenGolem /where')).toEqual({
      name: 'where',
      args: '',
    });

    expect(parseRemoteCommand('/new release triage')).toEqual({
      name: 'new',
      args: 'release triage',
    });

    expect(parseRemoteCommand('/unknown')).toBeNull();
  });

  it('builds a session banner from mapping metadata', () => {
    expect(
      buildRemoteSessionBanner(
        {
          channelType: 'telegram',
          channelId: '123',
          sessionId: 'telegram:dm:123',
          title: 'Build fixes',
          actualSessionId: 'local-1',
          workingDirectory: '/repo',
          createdAt: 1,
          lastActiveAt: 1,
        },
        '/fallback'
      )
    ).toBe('Chat: Build fixes\nMode: continuing existing chat\nCWD: /repo');
  });

  it('formats recent user and assistant history tersely', () => {
    const messages: Message[] = [
      {
        id: '1',
        sessionId: 's1',
        role: 'system',
        content: [{ type: 'text', text: 'ignore me' }],
        timestamp: 1,
      },
      {
        id: '2',
        sessionId: 's1',
        role: 'user',
        content: [{ type: 'text', text: 'Check the latest Windows release logs' }],
        timestamp: 2,
      },
      {
        id: '3',
        sessionId: 's1',
        role: 'assistant',
        content: [{ type: 'text', text: 'I found the ngrok install failure in CI.' }],
        timestamp: 3,
      },
    ];

    expect(formatRemoteHistory(messages)).toContain('User: Check the latest Windows release logs');
    expect(formatRemoteHistory(messages)).toContain('Assistant: I found the ngrok install failure in CI.');
    expect(formatRemoteHistory([])).toBe('No history yet for this chat.');
  });
});
