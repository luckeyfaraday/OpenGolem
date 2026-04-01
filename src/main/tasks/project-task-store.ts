import { v4 as uuidv4 } from 'uuid';
import type { DatabaseInstance, ProjectTaskRow } from '../db/database';
import type {
  ProjectTask,
  ProjectTaskCreateInput,
  ProjectTaskUpdateInput,
} from '../../renderer/types';

export interface ProjectTaskStore {
  list(): ProjectTask[];
  get(id: string): ProjectTask | null;
  create(input: ProjectTaskCreateInput): ProjectTask;
  update(id: string, updates: ProjectTaskUpdateInput): ProjectTask | null;
  delete(id: string): boolean;
}

export function createProjectTaskStore(db: DatabaseInstance): ProjectTaskStore {
  return {
    list: () => db.projectTasks.getAll().map(mapRowToTask),
    get: (id: string) => {
      const row = db.projectTasks.get(id);
      return row ? mapRowToTask(row) : null;
    },
    create: (input: ProjectTaskCreateInput) => {
      const now = Date.now();
      const row: ProjectTaskRow = {
        id: uuidv4(),
        title: input.title.trim(),
        description: input.description?.trim() || '',
        status: input.status || 'backlog',
        linked_session_id: input.linkedSessionId ?? null,
        created_at: now,
        updated_at: now,
      };
      db.projectTasks.create(row);
      return mapRowToTask(row);
    },
    update: (id: string, updates: ProjectTaskUpdateInput) => {
      const mapped: Partial<ProjectTaskRow> = {};
      if (updates.title !== undefined) mapped.title = updates.title.trim();
      if (updates.description !== undefined) mapped.description = updates.description.trim();
      if (updates.status !== undefined) mapped.status = updates.status;
      if (updates.linkedSessionId !== undefined) mapped.linked_session_id = updates.linkedSessionId;
      db.projectTasks.update(id, mapped);
      const row = db.projectTasks.get(id);
      return row ? mapRowToTask(row) : null;
    },
    delete: (id: string) => {
      const existing = db.projectTasks.get(id);
      if (!existing) return false;
      db.projectTasks.delete(id);
      return true;
    },
  };
}

function mapRowToTask(row: ProjectTaskRow): ProjectTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as ProjectTask['status'],
    linkedSessionId: row.linked_session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
