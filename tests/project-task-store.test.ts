import { describe, expect, it, vi } from 'vitest';
import { createProjectTaskStore } from '../src/main/tasks/project-task-store';
import type { DatabaseInstance, ProjectTaskRow } from '../src/main/db/database';

describe('createProjectTaskStore', () => {
  it('creates, updates, lists, and deletes project tasks', () => {
    const rows = new Map<string, ProjectTaskRow>();

    const db = {
      projectTasks: {
        create: vi.fn((row: ProjectTaskRow) => {
          rows.set(row.id, row);
        }),
        update: vi.fn((id: string, updates: Partial<ProjectTaskRow>) => {
          const current = rows.get(id);
          if (!current) return;
          rows.set(id, {
            ...current,
            ...updates,
            updated_at: Date.now(),
          });
        }),
        get: vi.fn((id: string) => rows.get(id)),
        getAll: vi.fn(() => Array.from(rows.values())),
        delete: vi.fn((id: string) => {
          rows.delete(id);
        }),
      },
    } as unknown as DatabaseInstance;

    const store = createProjectTaskStore(db);

    const created = store.create({
      title: ' Release checklist ',
      description: ' Tighten beta release workflow ',
      status: 'backlog',
    });

    expect(created.title).toBe('Release checklist');
    expect(created.description).toBe('Tighten beta release workflow');
    expect(store.list()).toHaveLength(1);

    const updated = store.update(created.id, {
      status: 'in_progress',
      linkedSessionId: 'session-123',
    });

    expect(updated?.status).toBe('in_progress');
    expect(updated?.linkedSessionId).toBe('session-123');

    expect(store.delete(created.id)).toBe(true);
    expect(store.list()).toHaveLength(0);
  });
});
