import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/Sidebar.tsx');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const tasksPanelPath = path.resolve(process.cwd(), 'src/renderer/components/TasksPanel.tsx');

describe('tasks panel entry points', () => {
  it('adds a tasks shortcut to the sidebar', () => {
    const source = fs.readFileSync(sidebarPath, 'utf8');
    expect(source).toContain('handleOpenTasks');
    expect(source).toContain('setShowTasksPanel(true)');
    expect(source).toContain('>Tasks<');
  });

  it('routes the main app view to the tasks panel', () => {
    const source = fs.readFileSync(appPath, 'utf8');
    expect(source).toContain('showTasksPanel');
    expect(source).toContain('TasksPanel');
    expect(source).toContain('!showTasksPanel');
  });

  it('supports quick create and task actions in the tasks panel', () => {
    const source = fs.readFileSync(tasksPanelPath, 'utf8');
    expect(source).toContain('window.electronAPI.projectTasks.create');
    expect(source).toContain('window.electronAPI.projectTasks.update');
    expect(source).toContain('window.electronAPI.projectTasks.delete');
    expect(source).toContain('window.electronAPI.schedule.create');
    expect(source).toContain('window.electronAPI.schedule.update');
    expect(source).toContain('window.electronAPI.schedule.toggle');
    expect(source).toContain('window.electronAPI.schedule.runNow');
    expect(source).toContain('window.electronAPI.schedule.delete');
    expect(source).toContain('Project tasks');
    expect(source).toContain('Create project task');
    expect(source).toContain('Link current chat');
    expect(source).toContain('Open chat');
    expect(source).toContain('Advanced scheduling');
    expect(source).toContain('Create task');
    expect(source).toContain('Edit task');
    expect(source).toContain('Search tasks');
    expect(source).toContain('Attention (');
    expect(source).toContain('Open session');
  });
});
