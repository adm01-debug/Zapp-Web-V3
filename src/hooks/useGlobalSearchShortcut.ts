// Re-export from consolidated useSearchManagement module (ETAPA 29 consolidation)
import { useEffect } from 'react';
import { useGlobalSearchShortcutManagement } from '@/hooks/useSearchManagement';

interface UseGlobalSearchShortcutProps {
  onOpen: () => void;
}

/** Enables global search with Ctrl+K keyboard shortcut. */
export function useGlobalSearchShortcut({ onOpen }: UseGlobalSearchShortcutProps) {
  const shortcut = useGlobalSearchShortcutManagement();
  useEffect(() => {
    if (shortcut.isOpen) onOpen();
  }, [shortcut.isOpen, onOpen]);
  return shortcut;
}
