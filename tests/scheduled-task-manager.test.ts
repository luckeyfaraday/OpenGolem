import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ScheduledTaskManager,
  type ScheduledTask,
  type ScheduledTaskStore,
} from '../src/main/schedule/scheduled-task-manager';

function createTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  const now = Date.now();
  return {
    id: 'task-1',
    title: 'Daily reminder',
    prompt: 'run reminder',
    cwd: '/tmp/project',
    runAt: now,
    nextRunAt: now,
    enabled: true,
    repeatEvery: null,
    repeatUnit: null,
    lastRunAt: null,
    lastRunSessionId: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createStore(initialTasks: ScheduledTask[]): ScheduledTaskStore {
  const tasks = new Map<string, ScheduledTask>(initialTasks.map((task) => [task.id, task]));

  return {
    list: () => Array.from(tasks.values()),
    get: (id) => tasks.get(id) ?? null,
    create: (input) => {
      const createdAt = Date.now();
      const task: ScheduledTask = {
        ...input,
        id: `task-${tasks.size + 1}`,
        lastRunAt: null,
        lastRunSessionId: null,
        lastError: null,
        createdAt,
        updatedAt: createdAt,
      };
      tasks.set(task.id, task);
      return task;
    },
    update: (id, updates) => {
      const existing = tasks.get(id);
      if (!existing) return null;
      const next: ScheduledTask = {
        ...existing,
        ...updates,
        updatedAt: Date.now(),
      };
      tasks.set(id, next);
      return next;
    },
    delete: (id) => tasks.delete(id),
  };
}

describe('ScheduledTaskManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-02T09:00:00.000Z'));
  });

  it('runs one-time task once and disables it', async () => {
    const now = Date.now();
    const store = createStore([
      createTask({
        id: 'once',
        runAt: now + 1000,
        nextRunAt: now + 1000,
      }),
    ]);
    const executeTask = vi.fn().mockResolvedValue({ sessionId: 'session-1' });

    const manager = new ScheduledTaskManager({ store, executeTask, now: () => Date.now() });
    manager.start();

    await vi.advanceTimersByTimeAsync(1000);

    const after = store.get('once');
    expect(executeTask).toHaveBeenCalledTimes(1);
    expect(after?.enabled).toBe(false);
    expect(after?.lastRunSessionId).toBe('session-1');
  });

  it('advances nextRunAt for repeating task', async () => {
    const now = Date.now();
    const store = createStore([
      createTask({
        id: 'repeat',
        runAt: now + 1000,
        nextRunAt: now + 1000,
        repeatEvery: 5,
        repeatUnit: 'minute',
      }),
    ]);
    const executeTask = vi.fn().mockResolvedValue({ sessionId: 'session-2' });

    const manager = new ScheduledTaskManager({ store, executeTask, now: () => Date.now() });
    manager.start();

    await vi.advanceTimersByTimeAsync(1000);

    const after = store.get('repeat');
    expect(executeTask).toHaveBeenCalledTimes(1);
    expect(after?.enabled).toBe(true);
    expect(after?.nextRunAt).toBe(now + 1000 + 5 * 60 * 1000);
  });

  it('allows concurrent runs for same repeating task', async () => {
    const now = Date.now();
    const store = createStore([
      createTask({
        id: 'concurrent',
        runAt: now + 1000,
        nextRunAt: now + 1000,
        repeatEvery: 1,
        repeatUnit: 'minute',
      }),
    ]);

    let resolveFirst: (() => void) | null = null;
    const executeTask = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ sessionId: string }>((resolve) => {
            resolveFirst = () => resolve({ sessionId: 'session-first' });
          })
      )
      .mockResolvedValueOnce({ sessionId: 'session-second' });

    const manager = new ScheduledTaskManager({ store, executeTask, now: () => Date.now() });
    manager.start();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(60 * 1000);

    expect(executeTask).toHaveBeenCalledTimes(2);

    resolveFirst?.();
    await Promise.resolve();
  });

  it('runs overdue task immediately on startup and advances nextRunAt', async () => {
    const now = Date.now();
    const store = createStore([
      createTask({
        id: 'overdue',
        runAt: now - 15 * 60 * 1000,
        nextRunAt: now - 15 * 60 * 1000,
        repeatEvery: 5,
        repeatUnit: 'minute',
      }),
    ]);
    const executeTask = vi.fn().mockResolvedValue({ sessionId: 'session-overdue' });

    const manager = new ScheduledTaskManager({ store, executeTask, now: () => Date.now() });
    manager.start();

    await vi.runOnlyPendingTimersAsync();

    const after = store.get('overdue');
    expect(executeTask).toHaveBeenCalledTimes(1);
    expect(after?.nextRunAt).toBe(now + 5 * 60 * 1000);
  });
});
