// Re-export from consolidated useKeyboardManagement module (ETAPA 30 consolidation)
import { useGlobalKeyboardShortcutsManagement } from '@/hooks/useKeyboardManagement';

interface GlobalShortcutAction {
  id: string;
  action: () => void;
}

export function useGlobalKeyboardShortcuts(customActions?: GlobalShortcutAction[]) {
  return useGlobalKeyboardShortcutsManagement(customActions);
}
