import type { MemoryEntry, Message } from '../../renderer/types/index';
import {
  buildSlashCommandHelpText,
  buildSlashCommandMemoryHelpText,
  parseMemoryCommandArgs,
  buildSlashCommandReviewPrompt,
  parseSlashCommand,
} from '../../shared/slash-commands';
import type { RemoteQuickAction, RemoteSessionMapping } from './types';

export type RemoteCommandName =
  | 'help'
  | 'new'
  | 'rename'
  | 'review'
  | 'usage'
  | 'where'
  | 'history'
  | 'list'
  | 'memory'
  | 'switch'
  | 'stop';

export interface ParsedRemoteCommand {
  name: RemoteCommandName;
  args: string;
}

export const DEFAULT_REMOTE_QUICK_ACTIONS: RemoteQuickAction[] = [
  { label: 'Help', command: '/help' },
  { label: 'Where', command: '/where' },
  { label: 'Usage', command: '/usage' },
  { label: 'History', command: '/history' },
  { label: 'List', command: '/list' },
  { label: 'Rename', command: '/rename ' },
  { label: 'New Chat', command: '/new' },
];

export function stripRemoteMentions(text: string): string {
  return text.replace(/@\S+\s*/g, '').trim();
}

export function parseRemoteCommand(text: string): ParsedRemoteCommand | null {
  const normalized = stripRemoteMentions(text);
  const parsed = parseSlashCommand(normalized);
  if (!parsed) {
    return null;
  }

  if (!['help', 'memory', 'new', 'rename', 'review', 'usage', 'where', 'history', 'list', 'switch', 'stop'].includes(parsed.name)) {
    return null;
  }

  return {
    name: parsed.name as RemoteCommandName,
    args: parsed.args,
  };
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
}

export function buildRemoteCommandHelpText(): string {
  return `${buildSlashCommandHelpText()}\n${buildSlashCommandMemoryHelpText()}\n/history - show recent turns from this remote chat\n/list - list saved chats for this conversation\n/switch <number|title> - switch to another saved chat\n/rename <title> - rename the active saved chat\n/stop - stop the active run for this chat`;
}

export function buildRemoteQuickActionHint(actions: RemoteQuickAction[] = DEFAULT_REMOTE_QUICK_ACTIONS): string {
  return `Quick actions: ${actions.map((action) => action.command).join(' · ')}`;
}

export function buildRemoteSessionBanner(
  mapping: RemoteSessionMapping,
  defaultWorkingDirectory?: string
): string {
  const title = mapping.title || mapping.pendingTitle || 'Untitled chat';
  const mode = mapping.actualSessionId ? 'continuing existing chat' : 'starting a fresh chat';
  const cwd = mapping.workingDirectory || defaultWorkingDirectory || 'not set';

  return [
    `Chat: #${mapping.chatIndex} ${title}`,
    `Mode: ${mode}`,
    `CWD: ${cwd}`,
  ].join('\n');
}

function getRemoteChatTitle(mapping: RemoteSessionMapping): string {
  return mapping.title || mapping.pendingTitle || 'Untitled chat';
}

export function formatRemoteSessionList(mappings: RemoteSessionMapping[]): string {
  if (mappings.length === 0) {
    return 'No saved chats yet for this conversation.';
  }

  const ordered = [...mappings].sort((a, b) => a.chatIndex - b.chatIndex);
  return [
    'Saved chats:',
    ...ordered.map((mapping) => {
      const state = mapping.active ? 'active' : mapping.actualSessionId ? 'saved' : 'new';
      return `${mapping.chatIndex}. ${getRemoteChatTitle(mapping)} (${state})`;
    }),
  ].join('\n');
}

export function findRemoteSessionBySwitchTarget(
  mappings: RemoteSessionMapping[],
  target: string
): RemoteSessionMapping | undefined {
  const trimmed = target.trim();
  if (!trimmed) {
    return undefined;
  }

  const byIndex = Number.parseInt(trimmed, 10);
  if (Number.isFinite(byIndex)) {
    return mappings.find((mapping) => mapping.chatIndex === byIndex);
  }

  const query = trimmed.toLowerCase();
  return mappings.find((mapping) => getRemoteChatTitle(mapping).toLowerCase() === query)
    || mappings.find((mapping) => getRemoteChatTitle(mapping).toLowerCase().includes(query));
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

export function formatRemoteUsage(messages: Message[]): string {
  let input = 0;
  let output = 0;
  let estimatedCostUsd = 0;
  let hasEstimatedCost = false;

  for (const message of messages) {
    if (!message.tokenUsage) continue;
    input += message.tokenUsage.input || 0;
    output += message.tokenUsage.output || 0;
    if (typeof message.estimatedCostUsd === 'number' && Number.isFinite(message.estimatedCostUsd)) {
      estimatedCostUsd += message.estimatedCostUsd;
      hasEstimatedCost = true;
    }
  }

  if (input === 0 && output === 0) {
    return 'No token usage recorded for this chat yet.';
  }

  return [
    'Session usage:',
    `Messages: ${messages.length}`,
    `Input tokens: ${formatTokenCount(input)}`,
    `Output tokens: ${formatTokenCount(output)}`,
    `Total tokens: ${formatTokenCount(input + output)}`,
    ...(hasEstimatedCost ? [`Estimated cost: ${formatEstimatedCost(estimatedCostUsd)}`] : []),
  ].join('\n');
}

function formatEstimatedCost(costUsd: number): string {
  if (costUsd < 0.0001) return '<$0.0001';
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  return `$${costUsd.toFixed(2)}`;
}

export function formatRemoteMemory(entries: MemoryEntry[], heading: string): string {
  if (entries.length === 0) {
    return `${heading}\nNo saved memories found.`;
  }

  return [
    heading,
    ...entries.map((entry, index) => {
      const label = entry.metadata.sessionTitle || entry.sessionId;
      const text = entry.content.replace(/\s+/g, ' ').trim().slice(0, 180);
      const tags = entry.metadata.tags.length > 0 ? ` [${entry.metadata.tags.join(', ')}]` : '';
      return `${index + 1}. ${label}: ${text}${tags}`;
    }),
  ].join('\n');
}

export function toRemoteReviewPrompt(args: string): string {
  return buildSlashCommandReviewPrompt(args);
}

export { parseMemoryCommandArgs };
