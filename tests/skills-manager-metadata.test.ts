import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getVersion: () => '0.0.0-test',
    getPath: (_name: string) => process.cwd(),
  },
}));

vi.mock('../src/main/utils/logger', () => ({
  log: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import { SkillsManager } from '../src/main/skills/skills-manager';
import type { DatabaseInstance } from '../src/main/db/database';

function createDbMock(): DatabaseInstance {
  const statement = { run: vi.fn() };
  return {
    raw: {} as any,
    sessions: {} as any,
    messages: {} as any,
    traceSteps: {} as any,
    scheduledTasks: {} as any,
    prepare: vi.fn(() => statement as any),
    exec: vi.fn(),
    pragma: vi.fn(),
    close: vi.fn(),
  };
}

describe('SkillsManager built-in skill metadata', () => {
  it('parses docx skill frontmatter', () => {
    const manager = new SkillsManager(createDbMock());
    const skillPath = path.join(process.cwd(), '.claude', 'skills', 'docx');

    const metadata = manager.getSkillMetadata(skillPath);

    expect(metadata).toEqual({
      name: 'docx',
      description:
        'Corporate Word document generation and editing for .docx files. Use when Claude needs to create professional Word documents from structured input, preserve document templates, or produce styled report outputs.',
    });
  });
});
