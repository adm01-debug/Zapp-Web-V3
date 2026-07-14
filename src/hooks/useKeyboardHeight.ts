// Re-export from consolidated useKeyboardManagement module (ETAPA 30 consolidation)
import { useKeyboardHeightManagement } from '@/hooks/useKeyboardManagement';

/** Detects and provides keyboard height for responsive UI adjustments. */
export function useKeyboardHeight() {
  return useKeyboardHeightManagement();
}
