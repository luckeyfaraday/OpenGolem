import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { shell } from 'electron';
import type {
  NotebookLMStatus,
  NotebookLMPresentationPreparationInput,
  NotebookLMPresentationPreparationResult,
} from '../../renderer/types';
import { log, logError } from '../utils/logger';

const NOTEBOOKLM_URL = 'https://notebooklm.google.com/';
const TEXT_SOURCE_EXTENSIONS = new Set(['.txt', '.md', '.markdown']);

function getNotebookLMCommand(): string {
  return process.platform === 'win32' ? 'notebooklm.cmd' : 'notebooklm';
}

function normalizeJsonOutput(stdout: string | undefined, stderr: string | undefined): unknown {
  const combined = `${stdout ?? ''}\n${stderr ?? ''}`.trim();
  if (!combined) {
    return null;
  }
  return JSON.parse(combined);
}

function extractNotebookId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id === 'string' && record.id) {
    return record.id;
  }
  if (record.notebook && typeof record.notebook === 'object') {
    return extractNotebookId(record.notebook);
  }
  if (record.data && typeof record.data === 'object') {
    return extractNotebookId(record.data);
  }
  return undefined;
}

function buildNotebookTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    return 'OpenGolem Presentation';
  }
  return trimmed.slice(0, 120);
}

function buildCreateOutputMessage(error: unknown): string {
  const stderr = typeof (error as { stderr?: unknown }).stderr === 'string'
    ? (error as { stderr: string }).stderr.trim()
    : '';
  const stdout = typeof (error as { stdout?: unknown }).stdout === 'string'
    ? (error as { stdout: string }).stdout.trim()
    : '';
  return stderr || stdout || (error instanceof Error ? error.message : 'NotebookLM command failed.');
}

function buildPresentationBriefMarkdown(prompt: string): string {
  return [
    '# Presentation Brief',
    '',
    prompt.trim(),
    '',
    'This brief was prepared by OpenGolem and uploaded automatically.',
  ].join('\n');
}

function buildGenerationDescription(title: string, prompt: string): string {
  const firstLine = prompt
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0) || title.trim();
  const normalized = firstLine.replace(/\s+/g, ' ').trim();
  return normalized.length > 220
    ? `${normalized.slice(0, 219).trimEnd()}…`
    : (normalized || 'Create a presentation based on the uploaded sources.');
}

export class NotebookLMService {
  private readonly command = getNotebookLMCommand();

  private async runCommand(args: string[], timeout = 30000): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      execFile(
        this.command,
        args,
        {
          timeout,
          env: process.env,
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            const enriched = error as Error & { stdout?: string; stderr?: string };
            enriched.stdout = typeof stdout === 'string' ? stdout : '';
            enriched.stderr = typeof stderr === 'string' ? stderr : '';
            reject(enriched);
            return;
          }

          resolve({
            stdout: typeof stdout === 'string' ? stdout : '',
            stderr: typeof stderr === 'string' ? stderr : '',
          });
        }
      );
    });
  }

  async checkStatus(): Promise<NotebookLMStatus> {
    try {
      await this.runCommand(['--version'], 10000);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT') {
        return {
          available: false,
          authenticated: false,
          command: this.command,
          message: 'NotebookLM CLI was not found on PATH.',
        };
      }

      return {
        available: false,
        authenticated: false,
        command: this.command,
        message: error instanceof Error ? error.message : 'NotebookLM CLI check failed.',
      };
    }

    try {
      const result = await this.runCommand(['auth', 'check', '--test'], 30000);
      const output = `${result.stdout}${result.stderr}`.trim();
      return {
        available: true,
        authenticated: true,
        command: this.command,
        message: output || 'NotebookLM CLI is authenticated.',
      };
    } catch (error) {
      return {
        available: true,
        authenticated: false,
        command: this.command,
        message: buildCreateOutputMessage(error),
      };
    }
  }

  async startLogin(): Promise<{ started: boolean; message?: string }> {
    try {
      const child = spawn(this.command, ['login'], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      });
      child.unref();
      log('[NotebookLM] Started notebooklm login flow');
      return {
        started: true,
        message: 'NotebookLM sign-in started.',
      };
    } catch (error) {
      logError('[NotebookLM] Failed to start login flow:', error);
      return {
        started: false,
        message: error instanceof Error ? error.message : 'Failed to start NotebookLM sign-in.',
      };
    }
  }

  async preparePresentationDeck(
    input: NotebookLMPresentationPreparationInput
  ): Promise<NotebookLMPresentationPreparationResult> {
    const notebookTitle = buildNotebookTitle(input.title);
    let tempDir: string | null = null;
    const status = await this.checkStatus();

    if (!status.available) {
      return {
        status: 'unavailable',
        notebookTitle,
        importedSources: 0,
        skippedSources: input.sourcePaths.length,
        generated: false,
        message: status.message || 'NotebookLM CLI is unavailable.',
      };
    }

    if (!status.authenticated) {
      return {
        status: 'requires_login',
        notebookTitle,
        importedSources: 0,
        skippedSources: input.sourcePaths.length,
        generated: false,
        message: status.message || 'NotebookLM authentication is required.',
      };
    }

    try {
      const created = await this.runCommand(['create', notebookTitle, '--json'], 60000);
      const createdPayload = normalizeJsonOutput(created.stdout, created.stderr);
      const notebookId = extractNotebookId(createdPayload);

      if (!notebookId) {
        throw new Error('NotebookLM create command did not return a notebook id.');
      }

      await this.runCommand(['use', notebookId], 30000);

      tempDir = await mkdtemp(join(tmpdir(), 'opengolem-notebooklm-'));
      const briefPath = join(tempDir, 'presentation-brief.md');
      await writeFile(briefPath, buildPresentationBriefMarkdown(input.prompt), 'utf8');

      const generatedSources: Array<{ path: string; title?: string }> = [
        { path: briefPath, title: 'Presentation brief' },
      ];

      if (input.contextMarkdown?.trim()) {
        const contextPath = join(tempDir, 'conversation-context.md');
        await writeFile(contextPath, input.contextMarkdown.trim(), 'utf8');
        generatedSources.push({ path: contextPath, title: 'Conversation context' });
      }

      let importedSources = 0;
      let skippedSources = 0;

      for (const sourcePath of input.sourcePaths) {
        const normalized = sourcePath.trim();
        if (!normalized || !existsSync(normalized)) {
          skippedSources += 1;
          continue;
        }

        const args = ['source', 'add', normalized, '--notebook', notebookId, '--json'];
        const extension = extname(normalized).toLowerCase();
        if (!TEXT_SOURCE_EXTENSIONS.has(extension)) {
          args.splice(3, 0, '--type', 'file');
        }

        try {
          await this.runCommand(args, 120000);
          importedSources += 1;
        } catch (error) {
          logError('[NotebookLM] Failed to add source:', normalized, error);
          skippedSources += 1;
        }
      }

      for (const source of generatedSources) {
        try {
          await this.runCommand(
            ['source', 'add', source.path, '--notebook', notebookId, '--title', source.title || 'Generated source', '--json'],
            120000
          );
          importedSources += 1;
        } catch (error) {
          logError('[NotebookLM] Failed to add generated source:', source.path, error);
          skippedSources += 1;
        }
      }

      await this.runCommand(
        ['generate', 'slide-deck', buildGenerationDescription(input.title, input.prompt), '--notebook', notebookId, '--json', '--no-wait'],
        60000
      );

      return {
        status: 'ready',
        notebookId,
        notebookTitle,
        importedSources,
        skippedSources,
        generated: true,
        message: `NotebookLM notebook "${notebookTitle}" is ready and slide deck generation has started.`,
      };
    } catch (error) {
      logError('[NotebookLM] Failed to prepare presentation deck:', error);
      return {
        status: 'error',
        notebookTitle,
        importedSources: 0,
        skippedSources: input.sourcePaths.length,
        generated: false,
        message: buildCreateOutputMessage(error),
      };
    } finally {
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true }).catch((cleanupError) => {
          logError('[NotebookLM] Failed to clean up temporary sources:', cleanupError);
        });
      }
    }
  }

  async openWebApp(): Promise<boolean> {
    await shell.openExternal(NOTEBOOKLM_URL);
    return true;
  }
}

export const notebookLMService = new NotebookLMService();
