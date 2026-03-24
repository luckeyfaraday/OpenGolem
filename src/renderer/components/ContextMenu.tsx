import { Scissors, Copy, Clipboard, CheckSquare } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  menuRef: React.RefObject<HTMLDivElement>;
  onAction: (action: 'cut' | 'copy' | 'paste' | 'selectAll') => void;
}

export function ContextMenu({ x, y, menuRef, onAction }: ContextMenuProps) {
  const menuItems = [
    { action: 'cut' as const, label: 'Cut', icon: Scissors, shortcut: 'Ctrl+X' },
    { action: 'copy' as const, label: 'Copy', icon: Copy, shortcut: 'Ctrl+C' },
    { action: 'paste' as const, label: 'Paste', icon: Clipboard, shortcut: 'Ctrl+V' },
    { action: 'selectAll' as const, label: 'Select All', icon: CheckSquare, shortcut: 'Ctrl+A' },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-background border border-border-subtle rounded-xl shadow-elevated py-1 min-w-[160px] animate-fade-in"
      style={{ left: x, top: y }}
    >
      {menuItems.map((item) => (
        <button
          key={item.action}
          onClick={() => onAction(item.action)}
          className="w-full px-3 py-2 flex items-center gap-3 text-sm text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <item.icon className="w-4 h-4 text-text-secondary" />
          <span className="flex-1 text-left">{item.label}</span>
          <span className="text-xs text-text-muted">{item.shortcut}</span>
        </button>
      ))}
    </div>
  );
}
