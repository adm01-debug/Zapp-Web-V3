// Re-export from consolidated useKeyboardManagement module (ETAPA 30 consolidation)
import { useCustomShortcutsManagement, type ShortcutBinding } from '@/hooks/useKeyboardManagement';

export type { ShortcutBinding };

export function useCustomShortcuts() {
  return useCustomShortcutsManagement();
}
