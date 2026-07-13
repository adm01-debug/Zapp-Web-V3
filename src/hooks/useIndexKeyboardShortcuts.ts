// Re-export from consolidated useKeyboardManagement module (ETAPA 30 consolidation)
import { useIndexKeyboardShortcutsManagement } from '@/hooks/useKeyboardManagement';

interface UseIndexKeyboardShortcutsProps {
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  setCurrentView: (viewId: string) => void;
}

export function useIndexKeyboardShortcuts(params: UseIndexKeyboardShortcutsProps) {
  return useIndexKeyboardShortcutsManagement(params);
}
