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
});
