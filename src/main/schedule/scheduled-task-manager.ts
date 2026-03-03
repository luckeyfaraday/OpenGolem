export type ScheduleRepeatUnit = 'minute' | 'hour' | 'day';

export interface ScheduledTask {
  id: string;
  title: string;
  prompt: string;
  cwd: string;
  runAt: number;
  nextRunAt: number | null;
  repeatEvery: number | null;
  repeatUnit: ScheduleRepeatUnit | null;
  enabled: boolean;
  lastRunAt: number | null;
  lastRunSessionId: string | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduledTaskCreateInput {
  title: string;
  prompt: string;
  cwd: string;
  runAt: number;
  nextRunAt?: number | null;
  repeatEvery?: number | null;
  repeatUnit?: ScheduleRepeatUnit | null;
  enabled?: boolean;
}

export interface ScheduledTaskUpdateInput {
  title?: string;
  prompt?: string;
  cwd?: string;
  runAt?: number;
  nextRunAt?: number | null;
  repeatEvery?: number | null;
  repeatUnit?: ScheduleRepeatUnit | null;
  enabled?: boolean;
  lastRunAt?: number | null;
  lastRunSessionId?: string | null;
  lastError?: string | null;
}

export interface ScheduledTaskStore {
  list(): ScheduledTask[];
  get(id: string): ScheduledTask | null;
  create(input: ScheduledTaskCreateInput): ScheduledTask;
  update(id: string, updates: ScheduledTaskUpdateInput): ScheduledTask | null;
  delete(id: string): boolean;
}

export interface ScheduledTaskRunResult {
  sessionId: string;
}

interface ScheduledTaskManagerOptions {
  store: ScheduledTaskStore;
  executeTask: (task: ScheduledTask) => Promise<ScheduledTaskRunResult>;
  now?: () => number;
}

export class ScheduledTaskManager {
  private readonly store: ScheduledTaskStore;
  private readonly executeTask: (task: ScheduledTask) => Promise<ScheduledTaskRunResult>;
  private readonly now: () => number;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private running = false;

  constructor(options: ScheduledTaskManagerOptions) {
    this.store = options.store;
    this.executeTask = options.executeTask;
    this.now = options.now ?? (() => Date.now());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const tasks = this.store.list();
    for (const task of tasks) {
      this.scheduleTask(task);
    }
  }

  stop(): void {
    this.running = false;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  list(): ScheduledTask[] {
    return this.store.list().sort((a, b) => a.createdAt - b.createdAt);
  }

  create(input: ScheduledTaskCreateInput): ScheduledTask {
    const normalizedRepeatEvery = normalizeRepeatEvery(input.repeatEvery);
    const normalizedRepeatUnit = normalizeRepeatUnit(input.repeatUnit);
    const created = this.store.create({
      ...input,
      nextRunAt: input.nextRunAt ?? input.runAt,
      enabled: input.enabled ?? true,
      repeatEvery: normalizedRepeatEvery,
      repeatUnit: normalizedRepeatUnit,
    });
    this.scheduleTask(created);
    return created;
  }

  update(id: string, updates: ScheduledTaskUpdateInput): ScheduledTask | null {
    const nextRepeatEvery = updates.repeatEvery === undefined
      ? undefined
      : normalizeRepeatEvery(updates.repeatEvery);
    const nextRepeatUnit = updates.repeatUnit === undefined
      ? undefined
      : normalizeRepeatUnit(updates.repeatUnit);
    const updated = this.store.update(id, {
      ...updates,
      repeatEvery: nextRepeatEvery,
      repeatUnit: nextRepeatUnit,
    });
    if (!updated) return null;
    this.scheduleTask(updated);
    return updated;
  }

  delete(id: string): boolean {
    this.clearTimer(id);
    return this.store.delete(id);
  }

  toggle(id: string, enabled: boolean): ScheduledTask | null {
    const current = this.store.get(id);
    if (!current) return null;
    const nextRunAt = enabled
      ? (current.nextRunAt ?? current.runAt ?? this.now())
      : null;
    const updated = this.store.update(id, { enabled, nextRunAt });
    if (!updated) return null;
    this.scheduleTask(updated);
    return updated;
  }

  async runNow(id: string): Promise<ScheduledTask | null> {
    const task = this.store.get(id);
    if (!task) return null;
    await this.executeAndRecord(task);
    return this.store.get(id);
  }

  private scheduleTask(task: ScheduledTask): void {
    this.clearTimer(task.id);
    if (!this.running) return;
    if (!task.enabled) return;
    if (!task.nextRunAt) return;
    const delay = Math.max(0, task.nextRunAt - this.now());
    const timer = setTimeout(() => {
      this.handleTrigger(task.id);
    }, delay);
    this.timers.set(task.id, timer);
  }

  private handleTrigger(taskId: string): void {
    this.timers.delete(taskId);
    const task = this.store.get(taskId);
    if (!task || !task.enabled) return;

    if (isRepeatingTask(task)) {
      const nextRunAt = computeNextRunAt(task, this.now());
      if (nextRunAt !== null) {
        const updated = this.store.update(task.id, {
          nextRunAt,
          enabled: true,
        });
        if (updated) {
          this.scheduleTask(updated);
          void this.executeAndRecord(updated);
          return;
        }
      }
    }

    const disabled = this.store.update(task.id, {
      enabled: false,
      nextRunAt: null,
    }) ?? task;
    void this.executeAndRecord(disabled);
  }

  private async executeAndRecord(task: ScheduledTask): Promise<void> {
    try {
      const result = await this.executeTask(task);
      this.store.update(task.id, {
        lastRunAt: this.now(),
        lastRunSessionId: result.sessionId,
        lastError: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.update(task.id, {
        lastRunAt: this.now(),
        lastError: message,
      });
    }
  }

  private clearTimer(taskId: string): void {
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }
  }
}

function normalizeRepeatEvery(value: number | null | undefined): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return Math.floor(value);
}

function normalizeRepeatUnit(value: ScheduleRepeatUnit | null | undefined): ScheduleRepeatUnit | null {
  if (value === 'minute' || value === 'hour' || value === 'day') {
    return value;
  }
  return null;
}

function isRepeatingTask(task: ScheduledTask): boolean {
  return Boolean(task.repeatEvery && task.repeatUnit);
}

function computeNextRunAt(task: ScheduledTask, now: number): number | null {
  const intervalMs = getIntervalMs(task.repeatEvery, task.repeatUnit);
  if (intervalMs === null) return null;
  let next = task.nextRunAt ?? task.runAt;
  while (next <= now) {
    next += intervalMs;
  }
  return next;
}

function getIntervalMs(
  repeatEvery: number | null,
  repeatUnit: ScheduleRepeatUnit | null
): number | null {
  if (!repeatEvery || !repeatUnit) return null;
  if (repeatUnit === 'minute') return repeatEvery * 60 * 1000;
  if (repeatUnit === 'hour') return repeatEvery * 60 * 60 * 1000;
  return repeatEvery * 24 * 60 * 60 * 1000;
}
