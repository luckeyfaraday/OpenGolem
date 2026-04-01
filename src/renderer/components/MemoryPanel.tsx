import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Plus, Search, Trash2 } from 'lucide-react';
import { useAppStore } from '../store';
import { useIPC } from '../hooks/useIPC';
import type { MemoryEntry } from '../types';

function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function MemoryPanel() {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const setShowMemoryPanel = useAppStore((s) => s.setShowMemoryPanel);
  const setGlobalNotice = useAppStore((s) => s.setGlobalNotice);
  const { addMemory, deleteMemory, searchMemory, listMemory } = useIPC();
  const [memoryInput, setMemoryInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resultHeading, setResultHeading] = useState('Recent memories');

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  const loadRecent = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextEntries = await listMemory(25);
      setEntries(nextEntries);
      setResultHeading('Recent memories');
    } finally {
      setIsLoading(false);
    }
  }, [listMemory]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const handleAddMemory = useCallback(async () => {
    const trimmed = memoryInput.trim();
    if (!activeSessionId) {
      setGlobalNotice({
        id: `memory-add-no-session-${Date.now()}`,
        type: 'warning',
        message: 'Open a chat before adding memory.',
      });
      return;
    }
    if (!trimmed) {
      return;
    }

    const tags = tagInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    setIsLoading(true);
    try {
      await addMemory(activeSessionId, trimmed, tags);
      setMemoryInput('');
      setTagInput('');
      await loadRecent();
      setGlobalNotice({
        id: `memory-add-success-${Date.now()}`,
        type: 'success',
        message: 'Memory saved.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [activeSessionId, addMemory, loadRecent, memoryInput, setGlobalNotice, tagInput]);

  const handleSearch = useCallback(async () => {
    const trimmed = searchInput.trim();
    if (!trimmed) {
      await loadRecent();
      return;
    }

    setIsLoading(true);
    try {
      const nextEntries = await searchMemory(trimmed, 25);
      setEntries(nextEntries);
      setResultHeading(`Memory search: ${trimmed}`);
    } finally {
      setIsLoading(false);
    }
  }, [loadRecent, searchInput, searchMemory]);

  const handleDelete = useCallback(async (entryId: string) => {
    setIsLoading(true);
    try {
      await deleteMemory(entryId);
      setEntries((current) => current.filter((entry) => entry.id !== entryId));
      setGlobalNotice({
        id: `memory-delete-success-${Date.now()}`,
        type: 'success',
        message: 'Memory deleted.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [deleteMemory, setGlobalNotice]);

  return (
    <div className="flex-1 min-h-0 bg-background px-6 py-6 overflow-auto">
      <div className="mx-auto max-w-5xl h-full flex flex-col gap-5">
        <div className="rounded-[1.75rem] border border-border-subtle bg-surface/80 px-6 py-5 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl border border-border-subtle bg-background/70 flex items-center justify-center text-text-secondary">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-text-primary">Memory</h2>
                  <p className="text-sm text-text-muted">
                    Save durable notes across chats, then search or review them later.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-sm text-text-secondary">
                <span className="rounded-full border border-border-subtle bg-background/70 px-3 py-1.5">
                  Active chat: {activeSession?.title || 'None'}
                </span>
                <span className="rounded-full border border-border-subtle bg-background/70 px-3 py-1.5">
                  Stored entries: {entries.length}
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowMemoryPanel(false)}
              className="rounded-xl border border-border-subtle px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.1fr_1.4fr]">
          <section className="rounded-[1.75rem] border border-border-subtle bg-surface/80 px-6 py-5 shadow-soft">
            <div className="flex items-center gap-2 text-text-primary">
              <Plus className="w-4 h-4" />
              <h3 className="text-base font-semibold">Add memory</h3>
            </div>
            <p className="mt-2 text-sm text-text-muted">
              Save something you want the app to remember beyond the current conversation.
            </p>
            <textarea
              value={memoryInput}
              onChange={(event) => setMemoryInput(event.target.value)}
              placeholder={activeSessionId ? 'Project uses Python 3.11 for local tooling.' : 'Open a chat to add memory.'}
              disabled={!activeSessionId || isLoading}
              rows={5}
              className="mt-4 w-full rounded-2xl border border-border-subtle bg-background/80 px-4 py-3 text-sm text-text-primary outline-none focus:border-border-muted disabled:cursor-not-allowed disabled:opacity-60"
            />
            <input
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="Tags, comma separated"
              disabled={!activeSessionId || isLoading}
              className="mt-3 w-full rounded-xl border border-border-subtle bg-background/80 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-border-muted disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              onClick={() => void handleAddMemory()}
              disabled={!activeSessionId || !memoryInput.trim() || isLoading}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-background px-4 py-2.5 text-sm font-medium text-text-primary border border-border-subtle hover:bg-surface-hover transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="w-4 h-4" />
              Save memory
            </button>
          </section>

          <section className="rounded-[1.75rem] border border-border-subtle bg-surface/80 px-6 py-5 shadow-soft min-h-[28rem] flex flex-col">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[14rem]">
                <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleSearch();
                    }
                  }}
                  placeholder="Search memory across chats"
                  className="w-full rounded-xl border border-border-subtle bg-background/80 pl-9 pr-4 py-2.5 text-sm text-text-primary outline-none focus:border-border-muted"
                />
              </div>
              <button
                onClick={() => void handleSearch()}
                disabled={isLoading}
                className="rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-60"
              >
                Search
              </button>
              <button
                onClick={() => {
                  setSearchInput('');
                  void loadRecent();
                }}
                disabled={isLoading}
                className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-60"
              >
                Recent
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-text-primary">{resultHeading}</h3>
              {isLoading && <span className="text-sm text-text-muted">Loading…</span>}
            </div>

            <div className="mt-4 flex-1 min-h-0 overflow-auto space-y-3">
              {entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-subtle bg-background/40 px-5 py-8 text-sm text-text-muted">
                  No saved memories yet.
                </div>
              ) : (
                entries.map((entry) => (
                  <article
                    key={entry.id}
                    className="rounded-2xl border border-border-subtle bg-background/65 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary">
                          {entry.metadata.sessionTitle || entry.sessionId}
                        </div>
                        <div className="mt-1 text-xs text-text-muted">
                          {formatTimestamp(entry.createdAt)}
                        </div>
                      </div>
                      <button
                        onClick={() => void handleDelete(entry.id)}
                        disabled={isLoading}
                        className="rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors disabled:opacity-60"
                        title="Delete memory"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-primary">
                      {entry.content}
                    </p>
                    {entry.metadata.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.metadata.tags.map((tag) => (
                          <span
                            key={`${entry.id}-${tag}`}
                            className="rounded-full border border-border-subtle bg-surface/80 px-2.5 py-1 text-xs text-text-secondary"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
