import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const chatViewPath = path.resolve(process.cwd(), 'src/renderer/components/ChatView.tsx');
const welcomeViewPath = path.resolve(process.cwd(), 'src/renderer/components/WelcomeView.tsx');

describe('slash command entry points', () => {
  it('wires slash command parsing into the active chat composer', () => {
    const source = fs.readFileSync(chatViewPath, 'utf8');
    expect(source).toContain("parseSlashCommand(trimmedPrompt)");
    expect(source).toContain('getSlashCommandSuggestions(prompt)');
    expect(source).toContain('<SlashCommandMenu');
    expect(source).toContain("case 'review':");
    expect(source).toContain("case 'memory':");
    expect(source).toContain("case 'where':");
    expect(source).toContain("case 'usage':");
    expect(source).toContain("case 'new':");
  });

  it('wires slash command parsing into the welcome composer', () => {
    const source = fs.readFileSync(welcomeViewPath, 'utf8');
    expect(source).toContain("parseSlashCommand(trimmedPrompt)");
    expect(source).toContain('getSlashCommandSuggestions(prompt)');
    expect(source).toContain('<SlashCommandMenu');
    expect(source).toContain("case 'help':");
    expect(source).toContain("case 'memory':");
    expect(source).toContain("case 'review':");
    expect(source).toContain("case 'new':");
  });
});
