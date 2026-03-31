import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const telegramApiPath = path.resolve(process.cwd(), 'src/main/remote/channels/telegram/telegram-api.ts');
const telegramChannelPath = path.resolve(process.cwd(), 'src/main/remote/channels/telegram/telegram-channel.ts');

describe('telegram typing indicator wiring', () => {
  it('adds sendChatAction support to the Telegram API client', () => {
    const source = readFileSync(telegramApiPath, 'utf8');

    expect(source).toContain('async sendChatAction(params:');
    expect(source).toContain("const url = `${this.baseUrl}/sendChatAction`;");
    expect(source).toContain("Telegram sendChatAction error:");
  });

  it('uses the typing action from the Telegram channel', () => {
    const source = readFileSync(telegramChannelPath, 'utf8');

    expect(source).toContain('async sendTypingIndicator(channelId: string): Promise<void> {');
    expect(source).toContain('await this.api.sendChatAction({');
    expect(source).toContain("action: 'typing'");
  });
});
