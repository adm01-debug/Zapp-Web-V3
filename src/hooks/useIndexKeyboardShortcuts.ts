// Re-export from consolidated useKeyboardManagement module (ETAPA 30 consolidation)
import { useIndexKeyboardShortcutsManagement } from '@/hooks/useKeyboardManagement';

interface UseIndexKeyboardShortcutsProps {
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  setCurrentView: (viewId: string) => void;
}

/** Hook: use Index Keyboard Shortcuts. */
export function useIndexKeyboardShortcuts(params: UseIndexKeyboardShortcutsProps) {
  return useIndexKeyboardShortcutsManagement(params);
}
