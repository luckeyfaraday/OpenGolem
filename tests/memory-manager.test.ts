import { describe, expect, it } from 'vitest';

import { MemoryManager } from '../src/main/memory/memory-manager';

interface StoredMemoryRow {
  id: string;
  session_id: string;
  content: string;
  metadata: string;
  created_at: number;
}

function createFakeDb() {
  const memories: StoredMemoryRow[] = [];
  const ftsRows: Array<{ entry_id: string; session_id: string; content: string }> = [];
  const sessionTitles = new Map<string, string>([
    ['s1', 'Release prep'],
    ['s2', 'Runtime cleanup'],
  ]);

  return {
    prepare(sql: string) {
      if (sql.includes('INSERT INTO memory_entries')) {
        return {
          run(id: string, sessionId: string, content: string, metadata: string, createdAt: number) {
            memories.push({
              id,
              session_id: sessionId,
              content,
              metadata,
              created_at: createdAt,
            });
          },
        };
      }

      if (sql.includes('INSERT INTO memory_fts')) {
        return {
          run(entryId: string, sessionId: string, content: string) {
            ftsRows.push({ entry_id: entryId, session_id: sessionId, content });
          },
        };
      }

      if (sql.includes('SELECT me.*, s.title AS session_title') && sql.includes('fts.session_id = ?')) {
        return {
          all(sessionId: string, query: string) {
            return memories
              .filter((row) => row.session_id === sessionId && row.content.toLowerCase().includes(query.toLowerCase()))
              .sort((a, b) => b.created_at - a.created_at)
              .map((row) => ({
                ...row,
                session_title: sessionTitles.get(row.session_id) || null,
              }));
          },
        };
      }

      if (sql.includes('SELECT me.*, s.title AS session_title') && sql.includes('fts MATCH ?')) {
        return {
          all(query: string, limit: number) {
            return memories
              .filter((row) => row.content.toLowerCase().includes(query.toLowerCase()))
              .sort((a, b) => b.created_at - a.created_at)
              .slice(0, limit)
              .map((row) => ({
                ...row,
                session_title: sessionTitles.get(row.session_id) || null,
              }));
          },
        };
      }

      if (sql.includes('FROM memory_entries me') && sql.includes('LIMIT ?')) {
        return {
          all(limit: number) {
            return [...memories]
              .sort((a, b) => b.created_at - a.created_at)
              .slice(0, limit)
              .map((row) => ({
                ...row,
                session_title: sessionTitles.get(row.session_id) || null,
              }));
          },
        };
      }

      if (sql.includes('DELETE FROM memory_fts')) {
        return {
          run(value: string) {
            for (let index = ftsRows.length - 1; index >= 0; index -= 1) {
              if (ftsRows[index].session_id === value || ftsRows[index].entry_id === value) {
                ftsRows.splice(index, 1);
              }
            }
          },
        };
      }

      if (sql.includes('DELETE FROM memory_entries')) {
        return {
          run(value: string) {
            for (let index = memories.length - 1; index >= 0; index -= 1) {
              if (memories[index].session_id === value || memories[index].id === value) {
                memories.splice(index, 1);
              }
            }
          },
        };
      }

      if (sql.includes('SELECT title FROM sessions')) {
        return {
          get(sessionId: string) {
            const title = sessionTitles.get(sessionId);
            return title ? { title } : undefined;
          },
        };
      }

      throw new Error(`Unhandled SQL in test: ${sql}`);
    },
  };
}

describe('MemoryManager explicit memory', () => {
  it('saves and searches memory across sessions', () => {
    const manager = new MemoryManager(createFakeDb() as never);
    manager.saveMemoryEntry('s1', 'Project uses Python 3.11 for tooling.', {
      source: 'slash-command',
      tags: ['python'],
    });
    manager.saveMemoryEntry('s2', 'macOS builds run on macos-15-intel for x64.', {
      source: 'slash-command',
      tags: ['mac'],
    });

    const results = manager.searchAllMemory('Python', 10);
    expect(results).toHaveLength(1);
    expect(results[0].metadata.sessionTitle).toBe('Release prep');

    const listed = manager.listMemory(10);
    expect(listed).toHaveLength(2);
    expect(listed[0].metadata.sessionTitle).toBeDefined();
  });

  it('deletes both stored entries and FTS rows for a session', () => {
    const manager = new MemoryManager(createFakeDb() as never);
    manager.saveMemoryEntry('s1', 'Remember the Python version.', {
      source: 'slash-command',
      tags: [],
    });

    expect(manager.searchMemory('s1', 'Python')).toHaveLength(1);
    manager.deleteSessionMemory('s1');
    expect(manager.searchMemory('s1', 'Python')).toHaveLength(0);
    expect(manager.listMemory(10)).toHaveLength(0);
  });

  it('deletes a single memory entry by id', () => {
    const manager = new MemoryManager(createFakeDb() as never);
    const saved = manager.saveMemoryEntry('s1', 'Delete this specific memory.', {
      source: 'slash-command',
      tags: [],
    });
    manager.saveMemoryEntry('s2', 'Keep this memory.', {
      source: 'slash-command',
      tags: [],
    });

    manager.deleteMemoryEntry(saved.id);

    const listed = manager.listMemory(10);
    expect(listed).toHaveLength(1);
    expect(listed[0].content).toBe('Keep this memory.');
  });
});
