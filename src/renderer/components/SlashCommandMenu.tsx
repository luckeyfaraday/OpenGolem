import type { SlashCommandDefinition } from '../utils/slash-commands';

interface SlashCommandMenuProps {
  commands: SlashCommandDefinition[];
  selectedIndex: number;
  onSelect: (command: SlashCommandDefinition) => void;
}

export function SlashCommandMenu({
  commands,
  selectedIndex,
  onSelect,
}: SlashCommandMenuProps) {
  if (commands.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 rounded-2xl border border-border-muted bg-background/96 shadow-soft overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle text-[11px] uppercase tracking-[0.12em] text-text-muted">
        Slash commands
      </div>
      <div className="p-1.5 space-y-1">
        {commands.map((command, index) => (
          <button
            key={command.name}
            type="button"
            onClick={() => onSelect(command)}
            className={`w-full text-left px-3 py-2 rounded-xl transition-colors ${
              index === selectedIndex
                ? 'bg-accent/12 text-text-primary'
                : 'hover:bg-surface-hover text-text-secondary'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">{command.syntax}</span>
              <span className="text-[11px] uppercase tracking-[0.1em] text-text-muted">
                Enter
              </span>
            </div>
            <div className="mt-1 text-xs text-text-muted">{command.summary}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
