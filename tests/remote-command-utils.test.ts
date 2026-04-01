import { describe, expect, it } from 'vitest';
import type { Message } from '../src/renderer/types/index';
import {
  buildRemoteCommandHelpText,
  buildRemoteQuickActionHint,
  DEFAULT_REMOTE_QUICK_ACTIONS,
  buildRemoteSessionBanner,
  findRemoteSessionBySwitchTarget,
  formatRemoteHistory,
  formatRemoteMemory,
  formatRemoteSessionList,
  formatRemoteUsage,
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

    expect(parseRemoteCommand('/usage')).toEqual({
      name: 'usage',
      args: '',
    });

    expect(parseRemoteCommand('/review release pipeline')).toEqual({
      name: 'review',
      args: 'release pipeline',
    });

    expect(parseRemoteCommand('/rename Mac release fix')).toEqual({
      name: 'rename',
      args: 'Mac release fix',
    });

    expect(parseRemoteCommand('/list')).toEqual({
      name: 'list',
      args: '',
    });

    expect(parseRemoteCommand('/switch 2')).toEqual({
      name: 'switch',
      args: '2',
    });

    expect(parseRemoteCommand('/memory search python')).toEqual({
      name: 'memory',
      args: 'search python',
    });

    expect(parseRemoteCommand('/unknown')).toBeNull();
  });

  it('builds a session banner from mapping metadata', () => {
    expect(
      buildRemoteSessionBanner(
        {
          baseSessionKey: 'telegram:dm:u1',
          channelType: 'telegram',
          channelId: '123',
          sessionId: 'telegram:dm:123',
          chatIndex: 1,
          active: true,
          title: 'Build fixes',
          actualSessionId: 'local-1',
          workingDirectory: '/repo',
          createdAt: 1,
          lastActiveAt: 1,
        },
        '/fallback'
      )
    ).toBe('Chat: #1 Build fixes\nMode: continuing existing chat\nCWD: /repo');
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

  it('formats remote help and token usage summaries', () => {
    expect(buildRemoteCommandHelpText()).toContain('/history');
    expect(buildRemoteCommandHelpText()).toContain('/switch <number|title>');
    expect(buildRemoteCommandHelpText()).toContain('/rename <title>');
    expect(buildRemoteCommandHelpText()).toContain('/memory add <text>');
    expect(buildRemoteQuickActionHint(DEFAULT_REMOTE_QUICK_ACTIONS)).toContain('/help');
    expect(
      formatRemoteUsage([
        {
          id: '2',
          sessionId: 's1',
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          timestamp: 2,
          tokenUsage: { input: 1234, output: 567 },
          estimatedCostUsd: 0.0045,
        },
      ])
    ).toContain('Total tokens: 1,801');
    expect(
      formatRemoteUsage([
        {
          id: '2',
          sessionId: 's1',
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          timestamp: 2,
          tokenUsage: { input: 1234, output: 567 },
          estimatedCostUsd: 0.0045,
        },
      ])
    ).toContain('Estimated cost: $0.0045');
    expect(
      formatRemoteMemory(
        [
          {
            id: 'm1',
            sessionId: 's1',
            content: 'Project uses Python 3.11',
            metadata: {
              source: 'slash-command',
              timestamp: 1,
              tags: ['python'],
              sessionTitle: 'Release prep',
            },
            createdAt: 1,
          },
        ],
        'Recent memories:'
      )
    ).toContain('1. Release prep: Project uses Python 3.11');
  });

  it('formats and resolves saved remote chats by index or title', () => {
    const mappings = [
      {
        baseSessionKey: 'telegram:dm:u1',
        channelType: 'telegram',
        channelId: '123',
        sessionId: 'telegram:dm:u1',
        chatIndex: 1,
        active: false,
        title: 'Build fixes',
        actualSessionId: 'local-1',
        createdAt: 1,
        lastActiveAt: 1,
      },
      {
        baseSessionKey: 'telegram:dm:u1',
        channelType: 'telegram',
        channelId: '123',
        sessionId: 'telegram:dm:u1:chat:2',
        chatIndex: 2,
        active: true,
        title: 'Release triage',
        createdAt: 2,
        lastActiveAt: 2,
      },
    ] as any;

    expect(formatRemoteSessionList(mappings)).toContain('1. Build fixes (saved)');
    expect(formatRemoteSessionList(mappings)).toContain('2. Release triage (active)');
    expect(findRemoteSessionBySwitchTarget(mappings, '2')?.sessionId).toBe('telegram:dm:u1:chat:2');
    expect(findRemoteSessionBySwitchTarget(mappings, 'build')?.sessionId).toBe('telegram:dm:u1');
  });
});
