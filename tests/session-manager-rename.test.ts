import { describe, expect, it, vi } from 'vitest';
import type { DatabaseInstance } from '../src/main/db/database';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/tmp',
    getVersion: () => '0.0.0',
  },
}));

vi.mock('electron-store', () => {
  class MockStore<T extends Record<string, unknown>> {
    public store: Record<string, unknown>;
    public path = '/tmp/mock-session-manager-rename-config-store.json';

    constructor(options: { defaults?: Record<string, unknown> }) {
      this.store = { ...(options?.defaults || {}) };
    }

    get<K extends keyof T>(key: K): T[K] {
      return this.store[key as string] as T[K];
    }

    set(key: string | Record<string, unknown>, value?: unknown): void {
      if (typeof key === 'string') {
        this.store[key] = value;
        return;
      }
      this.store = {
        ...this.store,
        ...key,
      };
    }
  }

  return { default: MockStore };
});

vi.mock('../src/main/claude/agent-runner', () => ({
  ClaudeAgentRunner: class {
    run = vi.fn();
    cancel = vi.fn();
    handleQuestionResponse = vi.fn();
  },
}));

vi.mock('../src/main/mcp/mcp-config-store', () => ({
  mcpConfigStore: {
    getEnabledServers: () => [],
  },
}));

import { SessionManager } from '../src/main/session/session-manager';

describe('SessionManager renameSession', () => {
  it('persists the new title and emits a session.update event', () => {
    const sendToRenderer = vi.fn();
    const db = {
      sessions: {
        create: vi.fn(),
        get: vi.fn(() => ({ id: 's1', title: 'Old title' })),
        getAll: vi.fn(() => []),
        update: vi.fn(),
        delete: vi.fn(),
      },
      messages: {
        create: vi.fn(),
        getBySessionId: vi.fn(() => []),
        delete: vi.fn(),
        deleteBySessionId: vi.fn(),
      },
      traceSteps: {
        create: vi.fn(),
        update: vi.fn(),
        getBySessionId: vi.fn(() => []),
        deleteBySessionId: vi.fn(),
      },
    };

    const manager = new SessionManager(db as unknown as DatabaseInstance, sendToRenderer);
    manager.renameSession('s1', '  New title  ');

    expect(db.sessions.update).toHaveBeenCalledWith('s1', { title: 'New title' });
    expect(sendToRenderer).toHaveBeenCalledWith({
      type: 'session.update',
      payload: { sessionId: 's1', updates: { title: 'New title' } },
    });
  });
});
