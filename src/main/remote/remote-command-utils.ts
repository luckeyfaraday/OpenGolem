import type { Message } from '../../renderer/types/index';
import type { RemoteSessionMapping } from './types';

export type RemoteCommandName = 'new' | 'where' | 'history' | 'stop';

export interface ParsedRemoteCommand {
  name: RemoteCommandName;
  args: string;
}

export function stripRemoteMentions(text: string): string {
  return text.replace(/@\S+\s*/g, '').trim();
}

export function parseRemoteCommand(text: string): ParsedRemoteCommand | null {
  const normalized = stripRemoteMentions(text);
  const match = normalized.match(/^\/(new|where|history|stop)(?:\s+(.*))?$/i);
  if (!match) {
    return null;
  }

  return {
    name: match[1].toLowerCase() as RemoteCommandName,
    args: (match[2] || '').trim(),
  };
}

export function buildRemoteSessionBanner(
  mapping: RemoteSessionMapping,
  defaultWorkingDirectory?: string
): string {
  const title = mapping.title || mapping.pendingTitle || 'Untitled chat';
  const mode = mapping.actualSessionId ? 'continuing existing chat' : 'starting a fresh chat';
  const cwd = mapping.workingDirectory || defaultWorkingDirectory || 'not set';

  return [
    `Chat: ${title}`,
    `Mode: ${mode}`,
    `CWD: ${cwd}`,
  ].join('\n');
}

export function formatRemoteHistory(messages: Message[], limit: number = 6): string {
  if (!messages.length) {
    return 'No history yet for this chat.';
  }

  const recent = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-limit);

  if (!recent.length) {
    return 'No history yet for this chat.';
  }

  return recent
    .map((message) => {
      const label = message.role === 'user' ? 'User' : 'Assistant';
      const text = message.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
      const compact = text.replace(/\s+/g, ' ').slice(0, 280) || '[non-text content]';
      return `${label}: ${compact}`;
    })
    .join('\n\n');
}
