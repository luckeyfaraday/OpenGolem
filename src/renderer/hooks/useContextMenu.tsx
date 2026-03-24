import { useState, useCallback, useEffect, useRef } from 'react';

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>;
}

export function useContextMenu() {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    targetRef: { current: null },
  });
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // Check if target is an input or textarea
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // For password fields, we still show the menu but clip operations may be limited
      e.preventDefault();

      // Get the actual input element
      const inputElement = target as HTMLInputElement | HTMLTextAreaElement;

      // Calculate position - keep menu within viewport
      let x = e.clientX;
      let y = e.clientY;

      // Approximate menu dimensions
      const menuWidth = 160;
      const menuHeight = 120;

      if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 8;
      }
      if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 8;
      }

      setMenuState({
        visible: true,
        x,
        y,
        targetRef: { current: inputElement },
      });
    }
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleAction = useCallback(
    (action: 'cut' | 'copy' | 'paste' | 'selectAll') => {
      const input = menuState.targetRef.current;
      if (!input) return;

      const isPassword = input.type === 'password';
      const isReadOnly = input.readOnly || input.disabled;

      switch (action) {
        case 'cut':
          if (!isPassword && !isReadOnly) {
            const selectedText = input.value.substring(
              input.selectionStart ?? 0,
              input.selectionEnd ?? 0
            );
            if (selectedText) {
              navigator.clipboard.writeText(selectedText);
              const before = input.value.substring(0, input.selectionStart ?? 0);
              const after = input.value.substring(input.selectionEnd ?? 0);
              const newValue = before + after;
              const newCursorPos = input.selectionStart ?? 0;
              input.value = newValue;
              input.setSelectionRange(newCursorPos, newCursorPos);
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
          break;
        case 'copy':
          const selectedForCopy = input.value.substring(
            input.selectionStart ?? 0,
            input.selectionEnd ?? 0
          );
          if (selectedForCopy) {
            navigator.clipboard.writeText(selectedForCopy);
          } else if (!isPassword) {
            // If nothing selected, copy entire value
            navigator.clipboard.writeText(input.value);
          }
          break;
        case 'paste':
          if (!isReadOnly) {
            navigator.clipboard.readText().then((text) => {
              if (text) {
                const start = input.selectionStart ?? 0;
                const end = input.selectionEnd ?? 0;
                const before = input.value.substring(0, start);
                const after = input.value.substring(end);
                const newValue = before + text + after;
                const newCursorPos = start + text.length;
                input.value = newValue;
                input.setSelectionRange(newCursorPos, newCursorPos);
                input.dispatchEvent(new Event('input', { bubbles: true }));
              }
            });
          }
          break;
        case 'selectAll':
          input.select();
          break;
      }

      closeMenu();
    },
    [menuState.targetRef, closeMenu]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as HTMLElement)
      ) {
        closeMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    };

    if (menuState.visible) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuState.visible, closeMenu]);

  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [handleContextMenu]);

  return {
    menuState,
    menuRef,
    handleAction,
    closeMenu,
  };
}
