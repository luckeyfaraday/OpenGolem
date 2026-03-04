import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const settingsPanelPath = path.resolve(process.cwd(), 'src/renderer/components/SettingsPanel.tsx');
const settingsPanelContent = readFileSync(settingsPanelPath, 'utf8');

describe('SettingsPanel schedule tab entry', () => {
  it('renders schedule tab id', () => {
    expect(settingsPanelContent).toContain("id: 'schedule' as TabId");
  });

  it('uses schedule i18n keys', () => {
    expect(settingsPanelContent).toContain("t('settings.schedule'");
    expect(settingsPanelContent).toContain("t('settings.scheduleDesc'");
  });

  it('handles null nextRunAt explicitly', () => {
    expect(settingsPanelContent).toContain("task.nextRunAt === null ? '无' : formatTime(task.nextRunAt)");
  });

  it('avoids resetting schedule time when editing without changing runAt', () => {
    expect(settingsPanelContent).toContain('shouldResetScheduleTime');
    expect(settingsPanelContent).toContain('runAt !== originalRunAtInput');
  });

  it('polls schedule list in background', () => {
    expect(settingsPanelContent).toContain("void loadTasks({ silent: true })");
  });

  it('validates future run time and suggests runNow for immediate execution', () => {
    expect(settingsPanelContent).toContain('执行时间必须晚于当前时间；如需立刻执行请使用“立即执行”');
  });
});
