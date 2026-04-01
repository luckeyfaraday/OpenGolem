import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/Sidebar.tsx');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const permissionsPanelPath = path.resolve(process.cwd(), 'src/renderer/components/PermissionsPanel.tsx');
const useIPCPath = path.resolve(process.cwd(), 'src/renderer/hooks/useIPC.ts');
const sessionManagerPath = path.resolve(process.cwd(), 'src/main/session/session-manager.ts');

describe('permissions UX entry points', () => {
  it('adds an approvals shortcut to the sidebar', () => {
    const source = fs.readFileSync(sidebarPath, 'utf8');
    expect(source).toContain('handleOpenPermissions');
    expect(source).toContain('setShowPermissionsPanel(true)');
    expect(source).toContain('>Approvals<');
    expect(source).toContain('pendingPermissions.length');
  });

  it('routes the main app view to the approvals panel', () => {
    const source = fs.readFileSync(appPath, 'utf8');
    expect(source).toContain('showPermissionsPanel');
    expect(source).toContain('PermissionsPanel');
    expect(source).toContain('!showPermissionsPanel');
  });

  it('supports reviewing pending approvals and saved rules in the panel', () => {
    const source = fs.readFileSync(permissionsPanelPath, 'utf8');
    expect(source).toContain('window.electronAPI.permissions.listRules');
    expect(source).toContain('window.electronAPI.permissions.deleteRule');
    expect(source).toContain('respondToPermission');
    expect(source).toContain('Allow and remember');
    expect(source).toContain('Pending approvals');
    expect(source).toContain('Saved rules');
  });

  it('keeps the next queued approval active after responding to the current one', () => {
    const source = fs.readFileSync(useIPCPath, 'utf8');
    expect(source).toContain('removePendingPermission(toolUseId);');
    expect(source).not.toContain('setPendingPermission(null);');
  });

  it('persists remembered approval rules in the session manager', () => {
    const source = fs.readFileSync(sessionManagerPath, 'utf8');
    expect(source).toContain('permissionRulesStore.addRememberedRule');
    expect(source).toContain("resolver(result === 'allow_always' ? 'allow' : result);");
    expect(source).toContain('const matchedRule = permissionRulesStore.match(toolName, input);');
  });
});
