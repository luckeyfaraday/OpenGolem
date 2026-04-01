import { describe, expect, it } from 'vitest';

import { buildToolCompletionSummary } from '../src/main/claude/agent-runner-completion';

describe('buildToolCompletionSummary', () => {
  it('summarizes concrete read and write actions with paths', () => {
    const result = buildToolCompletionSummary([
      {
        toolName: 'read',
        toolInput: { path: 'docx/SKILL.md' },
      },
      {
        toolName: 'write',
        toolOutput: JSON.stringify({
          content: [{ type: 'text', text: 'Successfully wrote 2986 bytes to report.js' }],
        }),
      },
    ]);

    expect(result).toBe('Done. Read docx/SKILL.md and wrote report.js.');
  });

  it('falls back to a generic completion message when no actionable tools exist', () => {
    expect(buildToolCompletionSummary([])).toBe('Done.');
  });

  it('handles web tools without file paths', () => {
    const result = buildToolCompletionSummary([
      { toolName: 'webSearch', toolInput: { query: 'platt market on close' } },
      { toolName: 'webFetch', toolInput: { url: 'https://example.com/report' } },
    ]);

    expect(result).toBe('Done. Searched the web for "platt market on close" and fetched https://example.com/report.');
  });
});
