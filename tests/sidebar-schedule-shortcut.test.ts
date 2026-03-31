import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/Sidebar.tsx');
const sidebarContent = readFileSync(sidebarPath, 'utf8');

describe('Sidebar schedule shortcut', () => {
  it('opens settings directly on the schedule tab', () => {
    expect(sidebarContent).toContain("const handleOpenSettings = useCallback((tab: string | null = null) => {");
    expect(sidebarContent).toContain("setSettingsTab(tab);");
    expect(sidebarContent).toContain("handleOpenSettings('schedule')");
  });

  it('renders a visible schedule shortcut in both sidebar layouts', () => {
    expect(sidebarContent).toContain('<Clock3 className="w-4 h-4" />');
    expect(sidebarContent).toContain("title={t('settings.schedule')}");
    expect(sidebarContent).toContain("{t('settings.schedule')}");
  });
});
