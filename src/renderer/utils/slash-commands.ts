import {
  buildSlashCommandHelpText,
  buildSlashCommandMemoryHelpText,
  buildSlashCommandReviewPrompt,
  buildUnknownSlashCommandText,
  getSlashCommandSuggestions,
  isKnownSlashCommand,
  parseMemoryCommandArgs,
  parseSlashCommand,
  type ParsedSlashCommand,
  type ParsedMemoryCommand,
  type SlashCommandDefinition,
  type SlashCommandName,
} from '../../shared/slash-commands';
import type { MemoryEntry, Message, Session } from '../types';

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
}

export function buildSlashCommandWhereText(options: {
  session?: Session | null;
  workingDir?: string | null;
  model?: string | null;
}): string {
  const { session, workingDir, model } = options;
  const title = session?.title || 'New chat';
  const status = session?.status || 'idle';
  const modelName = session?.model || model || '—';
  const cwd = session?.cwd || workingDir || 'Not set';

  return [`Chat: ${title}`, `Status: ${status}`, `Model: ${modelName}`, `CWD: ${cwd}`].join('\n');
}

export function buildSlashCommandUsageText(messages: Message[]): string {
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

export function buildSlashCommandMemoryText(entries: MemoryEntry[], heading: string): string {
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

export {
  buildSlashCommandHelpText,
  buildSlashCommandMemoryHelpText,
  buildSlashCommandReviewPrompt,
  buildUnknownSlashCommandText,
  getSlashCommandSuggestions,
  isKnownSlashCommand,
  parseMemoryCommandArgs,
  parseSlashCommand,
};

export type { ParsedMemoryCommand, ParsedSlashCommand, SlashCommandDefinition, SlashCommandName };
