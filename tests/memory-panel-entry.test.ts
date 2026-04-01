import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/Sidebar.tsx');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const memoryPanelPath = path.resolve(process.cwd(), 'src/renderer/components/MemoryPanel.tsx');

describe('memory panel entry points', () => {
  it('adds a memory entry point to the sidebar', () => {
    const source = fs.readFileSync(sidebarPath, 'utf8');
    expect(source).toContain('handleOpenMemory');
    expect(source).toContain('setShowMemoryPanel(true)');
    expect(source).toContain('>Memory<');
  });

  it('routes the main app view to the memory panel', () => {
    const source = fs.readFileSync(appPath, 'utf8');
    expect(source).toContain('showMemoryPanel');
    expect(source).toContain("name=\"MemoryPanel\"");
    expect(source).toContain('!showMemoryPanel');
  });

  it('supports add, search, and delete actions in the memory panel', () => {
    const source = fs.readFileSync(memoryPanelPath, 'utf8');
    expect(source).toContain('addMemory');
    expect(source).toContain('searchMemory');
    expect(source).toContain('deleteMemory');
    expect(source).toContain('Save memory');
    expect(source).toContain('Search');
    expect(source).toContain('Delete memory');
  });
});
