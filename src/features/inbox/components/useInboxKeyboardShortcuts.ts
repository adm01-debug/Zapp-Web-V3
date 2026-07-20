import { useEffect } from 'react';

interface UseInboxKeyboardShortcutsOptions {
  selectAll: () => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  bulkArchive: () => void;
  clearSelection: () => void;
  bulkMarkAsRead: () => void;
}

/** use Inbox Keyboard Shortcuts component. */
export function useInboxKeyboardShortcuts({
  selectAll,
  selectionMode,
  selectedIds,
  bulkArchive,
  clearSelection,
  bulkMarkAsRead,
}: UseInboxKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInput =
        active?.tagName === 'INPUT' ||
        active?.tagName === 'TEXTAREA' ||
        active?.getAttribute('contenteditable') === 'true';
      if (isInput) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectionMode && selectedIds.size > 0) {
        e.preventDefault();
        bulkArchive();
      }
      if (e.key === 'Escape' && selectionMode) {
        e.preventDefault();
        clearSelection();
      }
      if (e.key === 'r' && selectionMode && selectedIds.size > 0 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        bulkMarkAsRead();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectAll, selectionMode, selectedIds, bulkArchive, clearSelection, bulkMarkAsRead]);
}
