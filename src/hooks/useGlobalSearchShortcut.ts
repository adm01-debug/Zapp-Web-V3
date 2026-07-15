// @ts-nocheck
// Re-export from consolidated useSearchManagement module (ETAPA 29 consolidation)
import { useGlobalSearchShortcutManagement } from '@/hooks/useSearchManagement';

interface UseGlobalSearchShortcutProps {
  onOpen: () => void;
}

/** Enables global search with Ctrl+K keyboard shortcut. */
export function useGlobalSearchShortcut(props: UseGlobalSearchShortcutProps) {
  return useGlobalSearchShortcutManagement(props);
}