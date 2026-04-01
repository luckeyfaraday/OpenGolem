import type { PermissionRule } from '../../renderer/types';

function normalizeToolName(value: string): string {
  return value.trim().toLowerCase();
}

function extractPatternCandidate(input: Record<string, unknown>): string | undefined {
  const directStringKeys = [
    'command',
    'cmd',
    'path',
    'file_path',
    'filePath',
    'target_file',
    'query',
    'url',
  ];

  for (const key of directStringKeys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function buildRememberedPermissionRule(
  toolName: string,
  input: Record<string, unknown>
): PermissionRule {
  const normalizedTool = normalizeToolName(toolName);
  const pattern = extractPatternCandidate(input);

  const highRiskTools = ['bash', 'write', 'edit', 'execute_command', 'write_file', 'edit_file'];
  const shouldScopePattern = highRiskTools.some((fragment) => normalizedTool.includes(fragment));

  return {
    tool: normalizedTool,
    pattern: shouldScopePattern ? pattern : undefined,
    action: 'allow',
  };
}

export function matchesPermissionRule(
  rule: PermissionRule,
  toolName: string,
  input: Record<string, unknown>
): boolean {
  if (normalizeToolName(rule.tool) !== normalizeToolName(toolName)) {
    return false;
  }

  if (!rule.pattern) {
    return true;
  }

  const haystack = JSON.stringify(input).toLowerCase();
  return haystack.includes(rule.pattern.toLowerCase());
}
