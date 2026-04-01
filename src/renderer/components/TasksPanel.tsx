import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ExternalLink, ListChecks, Pencil, Play, Power, Search, Trash2 } from 'lucide-react';
import { useAppStore } from '../store';
import { useIPC } from '../hooks/useIPC';
import type { ProjectTask, ProjectTaskStatus, ScheduleTask } from '../types';

function toLocalDateTimeInput(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(timestamp: number | null): string {
  if (timestamp === null) {
    return 'No upcoming run';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatScheduleRule(task: ScheduleTask): string {
  if (task.scheduleConfig?.kind === 'daily') {
    return `Daily at ${task.scheduleConfig.times.join(', ')}`;
  }
  if (task.scheduleConfig?.kind === 'weekly') {
    return `Weekly at ${task.scheduleConfig.times.join(', ')}`;
  }
  if (task.repeatEvery && task.repeatUnit) {
    return `Every ${task.repeatEvery} ${task.repeatUnit}${task.repeatEvery === 1 ? '' : 's'}`;
  }
  return 'One-time task';
}

function formatProjectStatusLabel(status: ProjectTaskStatus): string {
  switch (status) {
    case 'in_progress':
      return 'In progress';
    case 'done':
      return 'Done';
    default:
      return 'Backlog';
  }
}

function formatRelativeTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function TasksPanel() {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const workingDir = useAppStore((s) => s.workingDir);
  const sessions = useAppStore((s) => s.sessions);
  const messagesBySession = useAppStore((s) => s.messagesBySession);
  const traceStepsBySession = useAppStore((s) => s.traceStepsBySession);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const setMessages = useAppStore((s) => s.setMessages);
  const setTraceSteps = useAppStore((s) => s.setTraceSteps);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const setShowTasksPanel = useAppStore((s) => s.setShowTasksPanel);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  const setGlobalNotice = useAppStore((s) => s.setGlobalNotice);
  const { stopSession, getSessionMessages, getSessionTraceSteps, isElectron } = useIPC();
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const [projectTitle, setProjectTitle] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [cwd, setCwd] = useState('');
  const [runAt, setRunAt] = useState(() => toLocalDateTimeInput(Date.now() + 5 * 60 * 1000));
  const [taskSearch, setTaskSearch] = useState('');
  const [taskFilter, setTaskFilter] = useState<'all' | 'enabled' | 'running' | 'attention'>('all');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingPrompt, setEditingPrompt] = useState('');
  const [editingCwd, setEditingCwd] = useState('');

  useEffect(() => {
    if (!cwd) {
      setCwd(workingDir || '');
    }
  }, [cwd, workingDir]);

  const loadTasks = useCallback(async (silent = false) => {
    if (!window.electronAPI) {
      return;
    }
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const rows = await window.electronAPI.schedule.list();
      setTasks(rows);
    } catch (error) {
      setGlobalNotice({
        id: `tasks-load-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to load tasks.',
      });
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [setGlobalNotice]);

  const loadProjectTasks = useCallback(async (silent = false) => {
    if (!window.electronAPI) {
      return;
    }
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const rows = await window.electronAPI.projectTasks.list();
      setProjectTasks(rows);
    } catch (error) {
      setGlobalNotice({
        id: `project-tasks-load-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to load project tasks.',
      });
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [setGlobalNotice]);

  useEffect(() => {
    void loadTasks();
    void loadProjectTasks(true);
  }, [loadProjectTasks, loadTasks]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadTasks(true);
      void loadProjectTasks(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [loadProjectTasks, loadTasks]);

  const groupedProjectTasks = useMemo(() => {
    const groups: Record<ProjectTaskStatus, ProjectTask[]> = {
      backlog: [],
      in_progress: [],
      done: [],
    };
    for (const task of projectTasks) {
      groups[task.status].push(task);
    }
    for (const status of Object.keys(groups) as ProjectTaskStatus[]) {
      groups[status].sort((left, right) => right.updatedAt - left.updatedAt);
    }
    return groups;
  }, [projectTasks]);

  const projectTaskStats = useMemo(
    () => ({
      total: projectTasks.length,
      backlog: groupedProjectTasks.backlog.length,
      inProgress: groupedProjectTasks.in_progress.length,
      done: groupedProjectTasks.done.length,
    }),
    [groupedProjectTasks, projectTasks.length]
  );

  const stats = useMemo(() => {
    const enabled = tasks.filter((task) => task.enabled).length;
    const running = tasks.filter((task) => {
      if (!task.lastRunSessionId) return false;
      return sessions.some((session) => session.id === task.lastRunSessionId && session.status === 'running');
    }).length;
    const attention = tasks.filter((task) => Boolean(task.lastError)).length;
    return {
      total: tasks.length,
      enabled,
      running,
      attention,
    };
  }, [sessions, tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = taskSearch.trim().toLowerCase();
    const now = Date.now();
    return tasks
      .filter((task) => {
        const runSession = task.lastRunSessionId
          ? sessions.find((session) => session.id === task.lastRunSessionId) || null
          : null;
        const isRunning = runSession?.status === 'running';
        if (taskFilter === 'enabled' && !task.enabled) {
          return false;
        }
        if (taskFilter === 'running' && !isRunning) {
          return false;
        }
        if (taskFilter === 'attention' && !task.lastError) {
          return false;
        }
        if (!normalizedQuery) {
          return true;
        }
        const searchable = [
          task.title,
          task.prompt,
          task.cwd,
          formatScheduleRule(task),
          task.lastError || '',
        ].join('\n').toLowerCase();
        return searchable.includes(normalizedQuery);
      })
      .sort((left, right) => {
        const leftRunning = left.lastRunSessionId
          ? sessions.some((session) => session.id === left.lastRunSessionId && session.status === 'running')
          : false;
        const rightRunning = right.lastRunSessionId
          ? sessions.some((session) => session.id === right.lastRunSessionId && session.status === 'running')
          : false;
        if (leftRunning !== rightRunning) {
          return leftRunning ? -1 : 1;
        }
        const leftDue = left.nextRunAt ?? Number.MAX_SAFE_INTEGER;
        const rightDue = right.nextRunAt ?? Number.MAX_SAFE_INTEGER;
        const leftOverdue = leftDue < now;
        const rightOverdue = rightDue < now;
        if (leftOverdue !== rightOverdue) {
          return leftOverdue ? -1 : 1;
        }
        if (leftDue !== rightDue) {
          return leftDue - rightDue;
        }
        return right.updatedAt - left.updatedAt;
      });
  }, [sessions, taskFilter, taskSearch, tasks]);

  const openAdvancedScheduling = useCallback(() => {
    setShowTasksPanel(false);
    setSettingsTab('schedule');
    setShowSettings(true);
  }, [setSettingsTab, setShowSettings, setShowTasksPanel]);

  const openSessionById = useCallback(async (sessionId: string) => {
    if (isElectron) {
      const existingMessages = messagesBySession[sessionId];
      if (!existingMessages || existingMessages.length === 0) {
        const messages = await getSessionMessages(sessionId);
        if (messages.length > 0) {
          setMessages(sessionId, messages);
        }
      }

      const existingTraceSteps = traceStepsBySession[sessionId];
      if (!existingTraceSteps || existingTraceSteps.length === 0) {
        const nextTraceSteps = await getSessionTraceSteps(sessionId);
        if (nextTraceSteps.length > 0) {
          setTraceSteps(sessionId, nextTraceSteps);
        }
      }
    }
    setShowTasksPanel(false);
    setActiveSession(sessionId);
  }, [
    getSessionMessages,
    getSessionTraceSteps,
    isElectron,
    messagesBySession,
    setActiveSession,
    setMessages,
    setShowTasksPanel,
    setTraceSteps,
    traceStepsBySession,
  ]);

  const createProjectTask = useCallback(async () => {
    const title = projectTitle.trim();
    if (!title) {
      setGlobalNotice({
        id: `project-task-create-empty-${Date.now()}`,
        type: 'warning',
        message: 'Project task title is required.',
      });
      return;
    }
    setIsLoading(true);
    try {
      await window.electronAPI.projectTasks.create({
        title,
        description: projectDescription.trim(),
      });
      setProjectTitle('');
      setProjectDescription('');
      await loadProjectTasks(true);
      setGlobalNotice({
        id: `project-task-create-success-${Date.now()}`,
        type: 'success',
        message: 'Project task created.',
      });
    } catch (error) {
      setGlobalNotice({
        id: `project-task-create-error-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to create project task.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadProjectTasks, projectDescription, projectTitle, setGlobalNotice]);

  const updateProjectTask = useCallback(async (taskId: string, updates: Partial<ProjectTask>) => {
    setIsLoading(true);
    try {
      await window.electronAPI.projectTasks.update(taskId, {
        title: updates.title,
        description: updates.description,
        status: updates.status,
        linkedSessionId:
          Object.prototype.hasOwnProperty.call(updates, 'linkedSessionId')
            ? (updates.linkedSessionId ?? null)
            : undefined,
      });
      await loadProjectTasks(true);
    } catch (error) {
      setGlobalNotice({
        id: `project-task-update-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to update project task.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadProjectTasks, setGlobalNotice]);

  const deleteProjectTask = useCallback(async (task: ProjectTask) => {
    if (!window.confirm(`Delete project task "${task.title}"?`)) {
      return;
    }
    setIsLoading(true);
    try {
      await window.electronAPI.projectTasks.delete(task.id);
      setProjectTasks((current) => current.filter((entry) => entry.id !== task.id));
    } catch (error) {
      setGlobalNotice({
        id: `project-task-delete-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete project task.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [setGlobalNotice]);

  const beginEditTask = useCallback((task: ScheduleTask) => {
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
    setEditingPrompt(task.prompt);
    setEditingCwd(task.cwd);
  }, []);

  const cancelEditTask = useCallback(() => {
    setEditingTaskId(null);
    setEditingTitle('');
    setEditingPrompt('');
    setEditingCwd('');
  }, []);

  const createTask = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setGlobalNotice({
        id: `task-create-empty-${Date.now()}`,
        type: 'warning',
        message: 'Task prompt is required.',
      });
      return;
    }

    const runAtValue = new Date(runAt).getTime();
    if (!Number.isFinite(runAtValue) || runAtValue <= Date.now()) {
      setGlobalNotice({
        id: `task-create-time-${Date.now()}`,
        type: 'warning',
        message: 'Choose a future execution time.',
      });
      return;
    }

    setIsLoading(true);
    try {
      await window.electronAPI.schedule.create({
        prompt: trimmedPrompt,
        cwd: cwd.trim() || workingDir || '',
        runAt: runAtValue,
        nextRunAt: runAtValue,
        enabled: true,
      });
      setPrompt('');
      setRunAt(toLocalDateTimeInput(Date.now() + 5 * 60 * 1000));
      await loadTasks(true);
      setGlobalNotice({
        id: `task-create-success-${Date.now()}`,
        type: 'success',
        message: 'Task created.',
      });
    } catch (error) {
      setGlobalNotice({
        id: `task-create-error-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to create task.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [cwd, loadTasks, prompt, runAt, setGlobalNotice, workingDir]);

  const toggleTask = useCallback(async (task: ScheduleTask) => {
    setIsLoading(true);
    try {
      await window.electronAPI.schedule.toggle(task.id, !task.enabled);
      await loadTasks(true);
    } catch (error) {
      setGlobalNotice({
        id: `task-toggle-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to update task.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadTasks, setGlobalNotice]);

  const runNow = useCallback(async (task: ScheduleTask) => {
    setIsLoading(true);
    try {
      await window.electronAPI.schedule.runNow(task.id);
      await loadTasks(true);
      setGlobalNotice({
        id: `task-run-${Date.now()}`,
        type: 'success',
        message: 'Task run started.',
      });
    } catch (error) {
      setGlobalNotice({
        id: `task-run-error-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to start task.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadTasks, setGlobalNotice]);

  const deleteTask = useCallback(async (task: ScheduleTask) => {
    if (!window.confirm(`Delete task "${task.title}"?`)) {
      return;
    }
    setIsLoading(true);
    try {
      await window.electronAPI.schedule.delete(task.id);
      setTasks((current) => current.filter((row) => row.id !== task.id));
    } catch (error) {
      setGlobalNotice({
        id: `task-delete-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete task.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [setGlobalNotice]);

  const saveTaskEdits = useCallback(async () => {
    if (!editingTaskId) {
      return;
    }
    const trimmedTitle = editingTitle.trim();
    const trimmedPrompt = editingPrompt.trim();
    if (!trimmedPrompt) {
      setGlobalNotice({
        id: `task-edit-empty-${Date.now()}`,
        type: 'warning',
        message: 'Task prompt is required.',
      });
      return;
    }
    setIsLoading(true);
    try {
      await window.electronAPI.schedule.update(editingTaskId, {
        title: trimmedTitle || undefined,
        prompt: trimmedPrompt,
        cwd: editingCwd.trim(),
      });
      await loadTasks(true);
      cancelEditTask();
      setGlobalNotice({
        id: `task-edit-success-${Date.now()}`,
        type: 'success',
        message: 'Task updated.',
      });
    } catch (error) {
      setGlobalNotice({
        id: `task-edit-error-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to update task.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [cancelEditTask, editingCwd, editingPrompt, editingTaskId, editingTitle, loadTasks, setGlobalNotice]);

  const stopTask = useCallback(async (task: ScheduleTask) => {
    if (!task.lastRunSessionId) {
      return;
    }
    try {
      await stopSession(task.lastRunSessionId);
      setGlobalNotice({
        id: `task-stop-${Date.now()}`,
        type: 'success',
        message: 'Stop sent for the running task session.',
      });
    } catch (error) {
      setGlobalNotice({
        id: `task-stop-error-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to stop task session.',
      });
    }
  }, [setGlobalNotice, stopSession]);

  const openTaskSession = useCallback(async (task: ScheduleTask) => {
    if (!task.lastRunSessionId) {
      return;
    }
    await openSessionById(task.lastRunSessionId);
  }, [openSessionById]);

  return (
    <div className="flex-1 min-h-0 bg-background px-6 py-6 overflow-auto">
      <div className="mx-auto max-w-6xl h-full flex flex-col gap-5">
        <div className="rounded-[1.75rem] border border-border-subtle bg-surface/80 px-6 py-5 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl border border-border-subtle bg-background/70 flex items-center justify-center text-text-secondary">
                  <ListChecks className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-text-primary">Tasks</h2>
                  <p className="text-sm text-text-muted">
                    Manage project work and scheduled automation from one panel instead of burying both inside settings.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-sm text-text-secondary">
                <span className="rounded-full border border-border-subtle bg-background/70 px-3 py-1.5">
                  Project: {projectTaskStats.total}
                </span>
                <span className="rounded-full border border-border-subtle bg-background/70 px-3 py-1.5">
                  Total: {stats.total}
                </span>
                <span className="rounded-full border border-border-subtle bg-background/70 px-3 py-1.5">
                  Enabled: {stats.enabled}
                </span>
                <span className="rounded-full border border-border-subtle bg-background/70 px-3 py-1.5">
                  Running: {stats.running}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={openAdvancedScheduling}
                className="rounded-xl border border-border-subtle px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
              >
                Advanced scheduling
              </button>
              <button
                onClick={() => setShowTasksPanel(false)}
                className="rounded-xl border border-border-subtle px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        <section className="rounded-[1.75rem] border border-border-subtle bg-surface/80 px-6 py-5 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-text-primary">Project tasks</h3>
              <p className="mt-1 text-sm text-text-muted">
                Track backlog, in-progress, and done work separately from automation schedules.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-text-muted">
              <span className="rounded-full border border-border-subtle bg-background/70 px-3 py-1.5">
                Backlog: {projectTaskStats.backlog}
              </span>
              <span className="rounded-full border border-border-subtle bg-background/70 px-3 py-1.5">
                In progress: {projectTaskStats.inProgress}
              </span>
              <span className="rounded-full border border-border-subtle bg-background/70 px-3 py-1.5">
                Done: {projectTaskStats.done}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.8fr]">
            <div className="rounded-2xl border border-border-subtle bg-background/50 px-4 py-4">
              <div className="text-sm font-medium text-text-primary">New project task</div>
              <input
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
                placeholder="Release checklist cleanup"
                className="mt-4 w-full rounded-xl border border-border-subtle bg-background/80 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-border-muted"
              />
              <textarea
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
                rows={5}
                placeholder="Add notes, acceptance criteria, or context for the next person who picks this up."
                className="mt-3 w-full rounded-2xl border border-border-subtle bg-background/80 px-4 py-3 text-sm text-text-primary outline-none focus:border-border-muted"
              />
              {activeSessionId && (
                <div className="mt-3 rounded-xl border border-border-subtle bg-background/70 px-3 py-2 text-xs text-text-muted">
                  Current chat is available for linking after creation.
                </div>
              )}
              <button
                onClick={() => void createProjectTask()}
                disabled={isLoading}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-background px-4 py-2.5 text-sm font-medium text-text-primary border border-border-subtle hover:bg-surface-hover transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ListChecks className="w-4 h-4" />
                Create project task
              </button>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {([
                ['backlog', 'Backlog'],
                ['in_progress', 'In progress'],
                ['done', 'Done'],
              ] as const).map(([status, label]) => (
                <div
                  key={status}
                  className="rounded-2xl border border-border-subtle bg-background/45 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-text-primary">{label}</div>
                    <span className="text-xs text-text-muted">
                      {groupedProjectTasks[status].length}
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {groupedProjectTasks[status].length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border-subtle bg-background/40 px-3 py-6 text-xs text-text-muted">
                        No tasks here.
                      </div>
                    ) : (
                      groupedProjectTasks[status].map((task) => {
                        const linkedSession = task.linkedSessionId
                          ? sessions.find((session) => session.id === task.linkedSessionId) || null
                          : null;
                        return (
                          <article
                            key={task.id}
                            className="rounded-2xl border border-border-subtle bg-background/75 px-4 py-4"
                          >
                            <div className="text-sm font-medium text-text-primary">{task.title}</div>
                            {task.description && (
                              <p className="mt-2 text-sm text-text-secondary whitespace-pre-wrap line-clamp-4">
                                {task.description}
                              </p>
                            )}
                            <div className="mt-3 text-xs text-text-muted">
                              Updated {formatRelativeTime(task.updatedAt)}
                            </div>
                            <div className="mt-2 text-xs text-text-muted">
                              Linked chat: {linkedSession?.title || task.linkedSessionId || 'None'}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <select
                                value={task.status}
                                onChange={(event) =>
                                  void updateProjectTask(task.id, {
                                    status: event.target.value as ProjectTaskStatus,
                                  })
                                }
                                className="rounded-lg border border-border-subtle bg-background px-3 py-2 text-xs text-text-secondary"
                              >
                                <option value="backlog">{formatProjectStatusLabel('backlog')}</option>
                                <option value="in_progress">{formatProjectStatusLabel('in_progress')}</option>
                                <option value="done">{formatProjectStatusLabel('done')}</option>
                              </select>
                              {activeSessionId && task.linkedSessionId !== activeSessionId && (
                                <button
                                  onClick={() =>
                                    void updateProjectTask(task.id, { linkedSessionId: activeSessionId })
                                  }
                                  disabled={isLoading}
                                  className="rounded-lg border border-border-subtle px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-60"
                                >
                                  Link current chat
                                </button>
                              )}
                              {task.linkedSessionId && (
                                <>
                                  <button
                                    onClick={() => void openSessionById(task.linkedSessionId!)}
                                    className="rounded-lg border border-border-subtle px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                                  >
                                    Open chat
                                  </button>
                                  <button
                                    onClick={() => void updateProjectTask(task.id, { linkedSessionId: null })}
                                    disabled={isLoading}
                                    className="rounded-lg border border-border-subtle px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-60"
                                  >
                                    Unlink
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => void deleteProjectTask(task)}
                                disabled={isLoading}
                                className="rounded-lg border border-border-subtle px-3 py-2 text-xs text-error hover:bg-error/10 transition-colors disabled:opacity-60"
                              >
                                Delete
                              </button>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_1.45fr]">
          <section className="rounded-[1.75rem] border border-border-subtle bg-surface/80 px-6 py-5 shadow-soft">
            <div className="flex items-center gap-2 text-text-primary">
              <CalendarClock className="w-4 h-4" />
              <h3 className="text-base font-semibold">Quick task</h3>
            </div>
            <p className="mt-2 text-sm text-text-muted">
              Create a one-time scheduled task here. Use advanced scheduling for daily or weekly recurrences.
            </p>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={5}
              placeholder="Review the latest release checklist and summarize blockers."
              className="mt-4 w-full rounded-2xl border border-border-subtle bg-background/80 px-4 py-3 text-sm text-text-primary outline-none focus:border-border-muted"
            />
            <input
              value={cwd}
              onChange={(event) => setCwd(event.target.value)}
              placeholder="Working directory"
              className="mt-3 w-full rounded-xl border border-border-subtle bg-background/80 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-border-muted"
            />
            <input
              type="datetime-local"
              value={runAt}
              onChange={(event) => setRunAt(event.target.value)}
              className="mt-3 w-full rounded-xl border border-border-subtle bg-background/80 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-border-muted"
            />
            <button
              onClick={() => void createTask()}
              disabled={isLoading}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-background px-4 py-2.5 text-sm font-medium text-text-primary border border-border-subtle hover:bg-surface-hover transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CalendarClock className="w-4 h-4" />
              Create task
            </button>

            {editingTaskId && (
              <div className="mt-6 rounded-2xl border border-border-subtle bg-background/60 px-4 py-4">
                <div className="flex items-center gap-2 text-text-primary">
                  <Pencil className="w-4 h-4" />
                  <h4 className="text-sm font-semibold">Edit task</h4>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Quick edit covers the title, prompt, and working directory. Use advanced scheduling to change recurrence rules.
                </p>
                <input
                  value={editingTitle}
                  onChange={(event) => setEditingTitle(event.target.value)}
                  placeholder="Task title"
                  className="mt-4 w-full rounded-xl border border-border-subtle bg-background/80 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-border-muted"
                />
                <textarea
                  value={editingPrompt}
                  onChange={(event) => setEditingPrompt(event.target.value)}
                  rows={4}
                  placeholder="Task prompt"
                  className="mt-3 w-full rounded-2xl border border-border-subtle bg-background/80 px-4 py-3 text-sm text-text-primary outline-none focus:border-border-muted"
                />
                <input
                  value={editingCwd}
                  onChange={(event) => setEditingCwd(event.target.value)}
                  placeholder="Working directory"
                  className="mt-3 w-full rounded-xl border border-border-subtle bg-background/80 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-border-muted"
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => void saveTaskEdits()}
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 rounded-xl bg-background px-4 py-2.5 text-sm font-medium text-text-primary border border-border-subtle hover:bg-surface-hover transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Pencil className="w-4 h-4" />
                    Save changes
                  </button>
                  <button
                    onClick={cancelEditTask}
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 rounded-xl border border-border-subtle px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-hover transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-[1.75rem] border border-border-subtle bg-surface/80 px-6 py-5 shadow-soft min-h-[30rem] flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-text-primary">Scheduled tasks</h3>
              <div className="flex items-center gap-2">
                {isLoading && <span className="text-sm text-text-muted">Loading…</span>}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-text-muted" />
                  <input
                    value={taskSearch}
                    onChange={(event) => setTaskSearch(event.target.value)}
                    placeholder="Search tasks"
                    className="w-52 rounded-xl border border-border-subtle bg-background/80 pl-9 pr-3 py-2 text-sm text-text-primary outline-none focus:border-border-muted"
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {([
                ['all', `All (${tasks.length})`],
                ['enabled', `Enabled (${stats.enabled})`],
                ['running', `Running (${stats.running})`],
                ['attention', `Attention (${stats.attention})`],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setTaskFilter(value)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    taskFilter === value
                      ? 'border-border-muted bg-background text-text-primary'
                      : 'border-border-subtle bg-background/50 text-text-muted hover:bg-surface-hover'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex-1 min-h-0 overflow-auto space-y-3">
              {filteredTasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-subtle bg-background/40 px-5 py-8 text-sm text-text-muted">
                  {tasks.length === 0 ? 'No tasks yet.' : 'No tasks match the current filter.'}
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const runSession = task.lastRunSessionId
                    ? sessions.find((session) => session.id === task.lastRunSessionId) || null
                    : null;
                  const isTaskRunning = runSession?.status === 'running';

                  return (
                    <article
                      key={task.id}
                      className="rounded-2xl border border-border-subtle bg-background/65 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-text-primary">{task.title}</div>
                          <p className="mt-1 text-sm text-text-secondary whitespace-pre-wrap line-clamp-3">
                            {task.prompt}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs ${
                            task.enabled ? 'bg-success/10 text-success' : 'bg-surface-hover text-text-muted'
                          }`}
                        >
                          {task.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-text-muted sm:grid-cols-2">
                        <div>Next run: {formatTime(task.nextRunAt)}</div>
                        <div>Rule: {formatScheduleRule(task)}</div>
                        <div className="truncate" title={task.cwd}>CWD: {task.cwd}</div>
                        <div>Last run: {formatTime(task.lastRunAt)}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {isTaskRunning && (
                          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-accent">
                            Running now
                          </span>
                        )}
                        {task.lastError && (
                          <span className="rounded-full bg-error/10 px-2.5 py-1 text-error">
                            Needs attention
                          </span>
                        )}
                      </div>
                      {task.lastError && (
                        <div className="mt-3 rounded-xl bg-error/10 px-3 py-2 text-xs text-error">
                          {task.lastError}
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => void toggleTask(task)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-60"
                        >
                          <Power className="w-3.5 h-3.5" />
                          {task.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => void runNow(task)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-60"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Run now
                        </button>
                        <button
                          onClick={() => void stopTask(task)}
                          disabled={isLoading || !isTaskRunning}
                          className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-60"
                        >
                          <Power className="w-3.5 h-3.5" />
                          Stop
                        </button>
                        <button
                          onClick={() => beginEditTask(task)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-60"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => void openTaskSession(task)}
                          disabled={!task.lastRunSessionId}
                          className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-60"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open session
                        </button>
                        <button
                          onClick={() => void deleteTask(task)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-2 text-xs text-error hover:bg-error/10 transition-colors disabled:opacity-60"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
