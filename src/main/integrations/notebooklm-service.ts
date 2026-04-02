import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { shell } from 'electron';
import type { NotebookLMStatus } from '../../renderer/types';
import { log, logError } from '../utils/logger';

const execFileAsync = promisify(execFile);
const NOTEBOOKLM_URL = 'https://notebooklm.google.com/';

function getNotebookLMCommand(): string {
  return process.platform === 'win32' ? 'notebooklm.cmd' : 'notebooklm';
}

export class NotebookLMService {
  private readonly command = getNotebookLMCommand();

  async checkStatus(): Promise<NotebookLMStatus> {
    try {
      await execFileAsync(this.command, ['--version'], {
        timeout: 10000,
        env: process.env,
      });
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
      const result = await execFileAsync(this.command, ['auth', 'check', '--test'], {
        timeout: 30000,
        env: process.env,
      });

      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
      return {
        available: true,
        authenticated: true,
        command: this.command,
        message: output || 'NotebookLM CLI is authenticated.',
      };
    } catch (error) {
      const stderr = typeof (error as { stderr?: unknown }).stderr === 'string'
        ? (error as { stderr: string }).stderr.trim()
        : '';
      const stdout = typeof (error as { stdout?: unknown }).stdout === 'string'
        ? (error as { stdout: string }).stdout.trim()
        : '';
      const fallback = error instanceof Error ? error.message : 'NotebookLM authentication check failed.';
      const message = stderr || stdout || fallback;

      return {
        available: true,
        authenticated: false,
        command: this.command,
        message,
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

  async openWebApp(): Promise<boolean> {
    await shell.openExternal(NOTEBOOKLM_URL);
    return true;
  }
}

export const notebookLMService = new NotebookLMService();
