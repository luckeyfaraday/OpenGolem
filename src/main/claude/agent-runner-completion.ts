type ToolCompletionRecord = {
  toolName: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  isError?: boolean;
};

export type DeliverableFile = {
  path: string;
};

type ParsedOutput = {
  path?: string;
  filePath?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

type ParsedInput = {
  path?: string;
  filePath?: string;
  file_path?: string;
  relativePath?: string;
  url?: string;
  query?: string;
};

function extractFilePathFromText(text: string): string | null {
  const match = text.match(/File (?:written|edited):\s*(.+)$/i)
    || text.match(/File created successfully at:?\s*(.+)$/i)
    || text.match(/Successfully wrote \d+ bytes to ([^\r\n]+)/i)
    || text.match(/The file (.+?) has been updated(?: successfully)?(?:\.|$)/i)
    || text.match(/Saved screenshot to ([^\r\n]+)/i)
    || text.match(/Document saved to:\s*([^\r\n]+)/i);
  if (!match || !match[1]) {
    return null;
  }
  return match[1].trim().replace(/[.,;:!?]+$/, '');
}

function extractFilePathFromToolOutput(toolOutput?: string): string | null {
  if (!toolOutput) return null;

  const trimmed = toolOutput.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as ParsedOutput;
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.filePath === 'string' && parsed.filePath.trim()) {
        return parsed.filePath.trim();
      }
      if (typeof parsed.path === 'string' && parsed.path.trim()) {
        return parsed.path.trim();
      }
      if (Array.isArray(parsed.content)) {
        const textContent = parsed.content
          .map((item) => (item && typeof item.text === 'string' ? item.text : ''))
          .filter(Boolean)
          .join('\n');
        const nestedPath = extractFilePathFromText(textContent);
        if (nestedPath) {
          return nestedPath;
        }
      }
    }
  } catch {
    // Ignore parse failures.
  }

  return extractFilePathFromText(trimmed);
}

function extractFilePathFromToolInput(toolInput?: Record<string, unknown>): string | null {
  if (!toolInput || typeof toolInput !== 'object') {
    return null;
  }

  const input = toolInput as ParsedInput;
  const candidates = [input.path, input.filePath, input.file_path, input.relativePath];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function formatList(items: string[]): string {
  if (items.length === 0) {
    return '';
  }
  if (items.length === 1) {
    return items[0]!;
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function summarizeToolCompletion(record: ToolCompletionRecord): string | null {
  if (record.isError) {
    return null;
  }

  const toolName = record.toolName.toLowerCase();
  const path = extractFilePathFromToolOutput(record.toolOutput) || extractFilePathFromToolInput(record.toolInput);
  const input = (record.toolInput ?? {}) as ParsedInput;

  if (toolName === 'read' && path) {
    return `read ${path}`;
  }
  if (toolName === 'write' && path) {
    return `wrote ${path}`;
  }
  if (toolName === 'edit' && path) {
    return `edited ${path}`;
  }
  if (toolName === 'websearch') {
    return typeof input.query === 'string' && input.query.trim()
      ? `searched the web for "${input.query.trim()}"`
      : 'searched the web';
  }
  if (toolName === 'webfetch') {
    return typeof input.url === 'string' && input.url.trim()
      ? `fetched ${input.url.trim()}`
      : 'fetched a URL';
  }
  if (path) {
    return `used ${record.toolName} on ${path}`;
  }
  return `used ${record.toolName}`;
}

function isLikelyCodeFile(pathValue: string): boolean {
  const normalized = pathValue.trim().toLowerCase();
  const lastDot = normalized.lastIndexOf('.');
  const ext = lastDot >= 0 ? normalized.slice(lastDot + 1) : '';
  return new Set([
    'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'go', 'rs', 'c', 'cc', 'cpp', 'h', 'hpp',
    'rb', 'php', 'swift', 'kt', 'kts', 'scala', 'sh', 'bash', 'zsh', 'ps1', 'sql',
    'json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'lock',
  ]).has(ext);
}

export function collectDeliverableFiles(records: ToolCompletionRecord[]): DeliverableFile[] {
  const candidates: Array<{ path: string; index: number }> = [];

  records.forEach((record, index) => {
    if (record.isError) {
      return;
    }

    const toolName = record.toolName.toLowerCase();
    if (toolName === 'read' || toolName === 'edit' || toolName === 'websearch' || toolName === 'webfetch') {
      return;
    }

    const outputPath = extractFilePathFromToolOutput(record.toolOutput);
    const inputPath = toolName === 'write' ? extractFilePathFromToolInput(record.toolInput) : null;
    const path = outputPath || inputPath;
    if (!path) {
      return;
    }

    candidates.push({ path, index });
  });

  const dedupedFromEnd: Array<{ path: string; index: number }> = [];
  const seen = new Set<string>();
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const candidate = candidates[i]!;
    if (seen.has(candidate.path)) {
      continue;
    }
    seen.add(candidate.path);
    dedupedFromEnd.unshift(candidate);
  }

  const nonCode = dedupedFromEnd.filter((candidate) => !isLikelyCodeFile(candidate.path));
  const preferred = nonCode.length > 0 ? nonCode : dedupedFromEnd;

  return preferred.slice(-3).map((candidate) => ({ path: candidate.path }));
}

export function buildToolCompletionSummary(records: ToolCompletionRecord[]): string {
  const actions = Array.from(
    new Set(
      records
        .map((record) => summarizeToolCompletion(record))
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, 3);

  if (actions.length === 0) {
    return 'Done.';
  }

  return `Done. ${capitalize(formatList(actions))}.`;
}
