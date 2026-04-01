import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const telegramChannelPath = path.resolve(process.cwd(), 'src/main/remote/channels/telegram/telegram-channel.ts');
const feishuChannelPath = path.resolve(process.cwd(), 'src/main/remote/channels/feishu/feishu-channel.ts');
const routerPath = path.resolve(process.cwd(), 'src/main/remote/message-router.ts');

describe('remote discoverability wiring', () => {
  it('attaches remote quick actions in the router', () => {
    const source = readFileSync(routerPath, 'utf8');
    expect(source).toContain('quickActions: DEFAULT_REMOTE_QUICK_ACTIONS');
    expect(source).toContain("buildRemoteCommandHelpText()");
    expect(source).toContain("case 'list':");
    expect(source).toContain("case 'rename':");
    expect(source).toContain("case 'switch':");
    expect(source).toContain('this.setActiveSessionForBaseKey(');
  });

  it('renders Telegram quick actions as inline keyboards', () => {
    const source = readFileSync(telegramChannelPath, 'utf8');
    expect(source).toContain('inline_keyboard: this.buildQuickActionKeyboard(content.quickActions)');
    expect(source).toContain('callback_data: action.command');
  });

  it('falls back to quick action hints in Feishu responses', () => {
    const source = readFileSync(feishuChannelPath, 'utf8');
    expect(source).toContain('content = this.withQuickActionHint(content);');
  });
});
