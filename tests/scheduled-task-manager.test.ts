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

  it('runNow consumes one-time schedule and prevents duplicate auto trigger', async () => {
    const now = Date.now();
    const store = createStore([
      createTask({
        id: 'run-now-once',
        runAt: now + 1000,
        nextRunAt: now + 1000,
      }),
    ]);
    const executeTask = vi.fn().mockResolvedValue({ sessionId: 'session-now-once' });

    const manager = new ScheduledTaskManager({ store, executeTask, now: () => Date.now() });
    manager.start();

    await manager.runNow('run-now-once');

    const afterRunNow = store.get('run-now-once');
    expect(executeTask).toHaveBeenCalledTimes(1);
    expect(afterRunNow?.enabled).toBe(false);
    expect(afterRunNow?.nextRunAt).toBeNull();

    await vi.advanceTimersByTimeAsync(1000);
    expect(executeTask).toHaveBeenCalledTimes(1);
  });

  it('runNow on overdue repeating task reschedules and avoids immediate duplicate run', async () => {
    const now = Date.now();
    const store = createStore([
      createTask({
        id: 'run-now-repeat-overdue',
        runAt: now - 60 * 1000,
        nextRunAt: now - 60 * 1000,
        repeatEvery: 1,
        repeatUnit: 'minute',
      }),
    ]);
    const executeTask = vi
      .fn()
      .mockResolvedValueOnce({ sessionId: 'session-repeat-now-1' })
      .mockResolvedValueOnce({ sessionId: 'session-repeat-now-2' });

    const manager = new ScheduledTaskManager({ store, executeTask, now: () => Date.now() });
    manager.start();

    await manager.runNow('run-now-repeat-overdue');

    const afterRunNow = store.get('run-now-repeat-overdue');
    expect(executeTask).toHaveBeenCalledTimes(1);
    expect(afterRunNow?.enabled).toBe(true);
    expect(afterRunNow?.nextRunAt).toBe(now + 60 * 1000);

    await vi.advanceTimersByTimeAsync(0);
    expect(executeTask).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(executeTask).toHaveBeenCalledTimes(2);
  });

  it('treats epoch nextRunAt=0 as a valid scheduled time', async () => {
    const store = createStore([
      createTask({
        id: 'epoch-task',
        runAt: 0,
        nextRunAt: 0,
        enabled: true,
      }),
    ]);
    const executeTask = vi.fn().mockResolvedValue({ sessionId: 'session-epoch' });

    const manager = new ScheduledTaskManager({ store, executeTask, now: () => Date.now() });
    manager.start();

    await vi.runOnlyPendingTimersAsync();

    expect(executeTask).toHaveBeenCalledTimes(1);
  });

  it('ignores stale trigger when task has been moved to a future nextRunAt', async () => {
    const now = Date.now();
    const store = createStore([
      createTask({
        id: 'stale-trigger',
        runAt: now - 60 * 1000,
        nextRunAt: now - 60 * 1000,
        repeatEvery: 1,
        repeatUnit: 'minute',
      }),
    ]);
    const executeTask = vi.fn().mockResolvedValue({ sessionId: 'session-stale' });

    const manager = new ScheduledTaskManager({ store, executeTask, now: () => Date.now() });
    manager.start();

    await manager.runNow('stale-trigger');
    expect(executeTask).toHaveBeenCalledTimes(1);

    (manager as any).handleTrigger('stale-trigger');
    expect(executeTask).toHaveBeenCalledTimes(1);
  });

  it('runNow throws on execution error and clears lastRunSessionId', async () => {
    const now = Date.now();
    const store = createStore([
      createTask({
        id: 'run-now-failure',
        runAt: now + 1000,
        nextRunAt: now + 1000,
        lastRunSessionId: 'previous-session',
      }),
    ]);
    const executeTask = vi.fn().mockRejectedValue(new Error('runner failed'));

    const manager = new ScheduledTaskManager({ store, executeTask, now: () => Date.now() });
    manager.start();

    await expect(manager.runNow('run-now-failure')).rejects.toThrow('runner failed');

    const after = store.get('run-now-failure');
    expect(after?.lastRunSessionId).toBeNull();
    expect(after?.lastError).toBe('runner failed');
  });

  it('normalizes repeatEvery below 1 to one-time schedule', () => {
    const now = Date.now();
    const store = createStore([]);
    const executeTask = vi.fn().mockResolvedValue({ sessionId: 'session-normalize' });
    const manager = new ScheduledTaskManager({ store, executeTask, now: () => Date.now() });

    const created = manager.create({
      title: 'normalize',
      prompt: 'run',
      cwd: '/tmp/project',
      runAt: now + 60 * 1000,
      repeatEvery: 0.4,
      repeatUnit: 'hour',
      enabled: true,
    });

    expect(created.repeatEvery).toBeNull();
    expect(created.repeatUnit).toBeNull();
  });

  it('does not execute long-delay task before nextRunAt when delay exceeds max timer range', async () => {
    const now = Date.now();
    const longDelay = 2_147_483_647 + 60_000;
    const store = createStore([
      createTask({
        id: 'long-delay',
        runAt: now + longDelay,
        nextRunAt: now + longDelay,
        enabled: true,
      }),
    ]);
    const executeTask = vi.fn().mockResolvedValue({ sessionId: 'session-long-delay' });
    const manager = new ScheduledTaskManager({ store, executeTask, now: () => Date.now() });
    manager.start();

    await vi.advanceTimersByTimeAsync(2_147_483_647);
    expect(executeTask).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(executeTask).toHaveBeenCalledTimes(1);
  });
});
