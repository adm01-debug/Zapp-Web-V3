// Re-export from consolidated useKeyboardManagement module (ETAPA 30 consolidation)
import { useCustomShortcutsManagement, type ShortcutBinding } from '@/hooks/useKeyboardManagement';

/** Re-exported module members. */
export type { ShortcutBinding };

/** Hook: use Custom Shortcuts. */
export function useCustomShortcuts() {
  return useCustomShortcutsManagement();
}
