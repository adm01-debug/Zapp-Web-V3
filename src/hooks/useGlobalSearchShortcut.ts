import { useEffect, useCallback } from 'react';

interface UseGlobalSearchShortcutProps {
  onOpen: () => void;
}

export function useGlobalSearchShortcut({ onOpen }: UseGlobalSearchShortcutProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onOpen();
      }
    },
    [onOpen]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
