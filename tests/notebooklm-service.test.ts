import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { execFileMock, spawnMock, openExternalMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn(),
  openExternalMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  spawn: spawnMock,
}));

vi.mock('electron', () => ({
  shell: {
    openExternal: openExternalMock,
  },
}));

import { NotebookLMService } from '../src/main/integrations/notebooklm-service';

function mockExecFileSuccess(stdout = '', stderr = '') {
  execFileMock.mockImplementationOnce((...args: any[]) => {
    const callback = args[args.length - 1];
    callback(null, stdout, stderr);
  });
}

function mockExecFileFailure(error: Error & { code?: string; stdout?: string; stderr?: string }) {
  execFileMock.mockImplementationOnce((...args: any[]) => {
    const callback = args[args.length - 1];
    callback(error, error.stdout || '', error.stderr || '');
  });
}

describe('NotebookLMService', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    spawnMock.mockReset();
    openExternalMock.mockReset();
    openExternalMock.mockResolvedValue(undefined);
  });

  it('reports unavailable when notebooklm CLI is missing', async () => {
    const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
    mockExecFileFailure(error);

    const service = new NotebookLMService();
    await expect(service.checkStatus()).resolves.toMatchObject({
      available: false,
      authenticated: false,
    });
  });

  it('reports authenticated when version and auth check succeed', async () => {
    mockExecFileSuccess('1.0.0\n');
    mockExecFileSuccess('authenticated\n');

    const service = new NotebookLMService();
    await expect(service.checkStatus()).resolves.toMatchObject({
      available: true,
      authenticated: true,
    });
  });

  it('starts login in detached mode', async () => {
    const unref = vi.fn();
    spawnMock.mockReturnValue({ unref });

    const service = new NotebookLMService();
    await expect(service.startLogin()).resolves.toMatchObject({ started: true });
    expect(spawnMock).toHaveBeenCalled();
    expect(unref).toHaveBeenCalled();
  });

  it('opens the web app', async () => {
    const service = new NotebookLMService();
    await expect(service.openWebApp()).resolves.toBe(true);
    expect(openExternalMock).toHaveBeenCalledWith('https://notebooklm.google.com/');
  });

  it('prepares a notebook, uploads sources, and starts slide deck generation', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'notebooklm-test-'));
    const sourcePath = join(tempDir, 'brief.pdf');
    writeFileSync(sourcePath, 'fake');

    mockExecFileSuccess('1.0.0\n');
    mockExecFileSuccess('authenticated\n');
    mockExecFileSuccess(JSON.stringify({ id: 'nb-123', title: 'Board Deck' }));
    mockExecFileSuccess('');
    mockExecFileSuccess(JSON.stringify({ id: 'src-1' }));
    mockExecFileSuccess(JSON.stringify({ id: 'src-brief' }));
    mockExecFileSuccess(JSON.stringify({ task_id: 'task-1' }));

    const service = new NotebookLMService();
    const result = await service.preparePresentationDeck({
      title: 'Board Deck',
      prompt: 'Build a board presentation.',
      sourcePaths: [sourcePath],
    });

    expect(result).toMatchObject({
      status: 'ready',
      notebookId: 'nb-123',
      notebookTitle: 'Board Deck',
      importedSources: 2,
      generated: true,
    });
    expect(execFileMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['generate', 'slide-deck', 'Build a board presentation.']),
      expect.any(Object),
      expect.any(Function)
    );
  });
});
