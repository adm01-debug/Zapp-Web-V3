// Re-export from consolidated useKeyboardManagement module (ETAPA 30 consolidation)
import { useKeyboardHeightManagement } from '@/hooks/useKeyboardManagement';

/** Hook: use Keyboard Height. */
export function useKeyboardHeight() {
  return useKeyboardHeightManagement();
}
