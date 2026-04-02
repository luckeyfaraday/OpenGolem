import { describe, expect, it } from 'vitest';

import {
  buildToolCompletionSummary,
  collectDeliverableFiles,
} from '../src/main/claude/agent-runner-completion';

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

  it('prefers final non-code deliverables over helper scripts', () => {
    const result = collectDeliverableFiles([
      {
        toolName: 'write',
        toolOutput: JSON.stringify({
          content: [{ type: 'text', text: 'Successfully wrote 2400 bytes to /tmp/create_security_doc.py' }],
        }),
      },
      {
        toolName: 'bash',
        toolOutput: JSON.stringify({
          content: [{ type: 'text', text: 'Document saved to: /tmp/Security_Channels_and_Devices.docx' }],
        }),
      },
    ]);

    expect(result).toEqual([{ path: '/tmp/Security_Channels_and_Devices.docx' }]);
  });
});
