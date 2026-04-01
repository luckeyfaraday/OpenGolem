import { describe, expect, it } from 'vitest';

import {
  buildSlashCommandHelpText,
  buildSlashCommandMemoryHelpText,
  buildSlashCommandMemoryText,
  buildSlashCommandReviewPrompt,
  buildSlashCommandUsageText,
  buildSlashCommandWhereText,
  buildUnknownSlashCommandText,
  isKnownSlashCommand,
  parseMemoryCommandArgs,
  parseSlashCommand,
} from '../src/renderer/utils/slash-commands';

describe('renderer slash commands', () => {
  it('parses slash commands with optional arguments', () => {
    expect(parseSlashCommand('/review auth flow')).toEqual({
      name: 'review',
      args: 'auth flow',
      raw: '/review auth flow',
    });
    expect(parseSlashCommand('  /usage  ')).toEqual({
      name: 'usage',
      args: '',
      raw: '/usage',
    });
    expect(parseSlashCommand('review auth flow')).toBeNull();
  });

  it('recognizes supported command names', () => {
    expect(isKnownSlashCommand('review')).toBe(true);
    expect(isKnownSlashCommand('where')).toBe(true);
    expect(isKnownSlashCommand('memory')).toBe(true);
    expect(isKnownSlashCommand('deploy')).toBe(false);
  });

  it('formats help, session info, and usage summaries', () => {
    expect(buildSlashCommandHelpText()).toContain('/review [focus]');
    expect(buildSlashCommandHelpText()).toContain('/memory <add|search|list> ...');
    expect(buildSlashCommandMemoryHelpText()).toContain('/memory add <text>');
    expect(buildUnknownSlashCommandText('deploy')).toContain('/deploy');
    expect(
      buildSlashCommandWhereText({
        session: { title: 'Fix build', status: 'running', id: 's1', mountedPaths: [], allowedTools: [], memoryEnabled: false, createdAt: 1, updatedAt: 1, cwd: '/repo', model: 'gpt-5' },
      })
    ).toContain('Chat: Fix build');
    expect(
      buildSlashCommandUsageText([
        {
          id: 'm1',
          sessionId: 's1',
          role: 'assistant',
          content: [{ type: 'text', text: 'hi' }],
          timestamp: 1,
          tokenUsage: { input: 1200, output: 340 },
          estimatedCostUsd: 0.0123,
        },
      ])
    ).toContain('Total tokens: 1,540');
    expect(
      buildSlashCommandUsageText([
        {
          id: 'm1',
          sessionId: 's1',
          role: 'assistant',
          content: [{ type: 'text', text: 'hi' }],
          timestamp: 1,
          tokenUsage: { input: 1200, output: 340 },
          estimatedCostUsd: 0.0123,
        },
      ])
    ).toContain('Estimated cost: $0.01');
    expect(
      buildSlashCommandMemoryText(
        [
          {
            id: 'mem-1',
            sessionId: 's1',
            content: 'Project uses Python 3.11 for local tooling.',
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

  it('builds a review prompt that preserves optional focus text', () => {
    expect(buildSlashCommandReviewPrompt('auth flow')).toContain('Focus on this area as well: auth flow');
    expect(buildSlashCommandReviewPrompt('')).toContain('Check the current git diff');
  });

  it('parses memory subcommands', () => {
    expect(parseMemoryCommandArgs('add Project uses Python 3.11')).toEqual({
      kind: 'add',
      content: 'Project uses Python 3.11',
    });
    expect(parseMemoryCommandArgs('search python')).toEqual({
      kind: 'search',
      query: 'python',
      limit: 10,
    });
    expect(parseMemoryCommandArgs('list 5')).toEqual({
      kind: 'list',
      limit: 5,
    });
    expect(parseMemoryCommandArgs('')).toEqual({ kind: 'help' });
  });
});
