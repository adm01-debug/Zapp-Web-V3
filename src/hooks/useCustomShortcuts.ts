// Re-export from consolidated useKeyboardManagement module (ETAPA 30 consolidation)
import { useCustomShortcutsManagement, type ShortcutBinding } from '@/hooks/useKeyboardManagement';

export type { ShortcutBinding };

/** Hook for managing custom keyboard shortcuts and their bindings. */
export function useCustomShortcuts() {
  return useCustomShortcutsManagement();
}
