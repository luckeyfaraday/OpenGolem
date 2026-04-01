export type SlashCommandName = 'help' | 'memory' | 'new' | 'review' | 'usage' | 'where';

export interface SlashCommandDefinition {
  name: SlashCommandName;
  syntax: string;
  summary: string;
}

export interface ParsedSlashCommand {
  name: string;
  args: string;
  raw: string;
}

export type ParsedMemoryCommand =
  | { kind: 'add'; content: string }
  | { kind: 'search'; query: string; limit: number }
  | { kind: 'list'; limit: number }
  | { kind: 'help' }
  | { kind: 'invalid'; message: string };

export const SLASH_COMMANDS: SlashCommandDefinition[] = [
  { name: 'help', syntax: '/help', summary: 'show the available slash commands' },
  { name: 'where', syntax: '/where', summary: 'show the current chat, model, and working directory' },
  { name: 'usage', syntax: '/usage', summary: 'show token totals for the current chat' },
  { name: 'memory', syntax: '/memory <add|search|list> ...', summary: 'store, search, or list explicit memory entries' },
  { name: 'review', syntax: '/review [focus]', summary: 'ask the agent to review current workspace changes' },
  { name: 'new', syntax: '/new [prompt]', summary: 'open a fresh chat, optionally with an initial prompt' },
];

const SLASH_COMMAND_NAME_SET = new Set<string>(SLASH_COMMANDS.map((command) => command.name));

export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const match = trimmed.match(/^\/([a-z][a-z0-9_-]*)(?:\s+(.*))?$/i);
  if (!match) return null;

  return {
    name: match[1].toLowerCase(),
    args: (match[2] || '').trim(),
    raw: trimmed,
  };
}

export function isKnownSlashCommand(name: string): name is SlashCommandName {
  return SLASH_COMMAND_NAME_SET.has(name);
}

export function getSlashCommandSuggestions(input: string): SlashCommandDefinition[] {
  const trimmedStart = input.trimStart();
  if (!trimmedStart.startsWith('/')) {
    return [];
  }

  const withoutSlash = trimmedStart.slice(1);
  if (/\s/.test(withoutSlash)) {
    return [];
  }

  const query = withoutSlash.toLowerCase();
  if (!query) {
    return SLASH_COMMANDS;
  }

  return SLASH_COMMANDS.filter((command) => command.name.startsWith(query));
}

export function buildSlashCommandHelpText(): string {
  return ['Available slash commands:', ...SLASH_COMMANDS.map((command) => `${command.syntax} - ${command.summary}`)].join('\n');
}

export function buildUnknownSlashCommandText(name: string): string {
  return `Unknown slash command "/${name}". Try /help.`;
}

export function buildSlashCommandMemoryHelpText(): string {
  return [
    'Memory commands:',
    '/memory add <text> - save a memory for the current chat',
    '/memory search <query> - search saved memories across chats',
    '/memory list [limit] - list recent saved memories across chats',
  ].join('\n');
}

export function parseMemoryCommandArgs(args: string): ParsedMemoryCommand {
  const trimmed = args.trim();
  if (!trimmed) {
    return { kind: 'help' };
  }

  const [subcommandRaw, ...rest] = trimmed.split(/\s+/);
  const subcommand = subcommandRaw.toLowerCase();
  const remainder = rest.join(' ').trim();

  if (subcommand === 'add') {
    if (!remainder) {
      return { kind: 'invalid', message: 'Usage: /memory add <text>' };
    }
    return { kind: 'add', content: remainder };
  }

  if (subcommand === 'search') {
    if (!remainder) {
      return { kind: 'invalid', message: 'Usage: /memory search <query>' };
    }
    return { kind: 'search', query: remainder, limit: 10 };
  }

  if (subcommand === 'list') {
    if (!remainder) {
      return { kind: 'list', limit: 10 };
    }

    const limit = Number.parseInt(remainder, 10);
    if (!Number.isFinite(limit) || limit <= 0) {
      return { kind: 'invalid', message: 'Usage: /memory list [limit]' };
    }

    return { kind: 'list', limit: Math.min(limit, 50) };
  }

  return { kind: 'invalid', message: buildSlashCommandMemoryHelpText() };
}

export function buildSlashCommandReviewPrompt(args: string): string {
  const focus = args.trim();
  const focusLine = focus ? `Focus on this area as well: ${focus}\n\n` : '';

  return [
    'Review the current workspace changes.',
    focusLine +
      'Check the current git diff and report findings only, ordered by severity with file references and concrete regression risks.',
    'Call out missing tests if they matter.',
    'Do not make changes unless I ask.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
