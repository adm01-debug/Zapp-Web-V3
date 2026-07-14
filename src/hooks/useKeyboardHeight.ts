// Re-export from consolidated useKeyboardManagement module (ETAPA 30 consolidation)
import { useKeyboardHeightManagement } from '@/hooks/useKeyboardManagement';

export function useKeyboardHeight() {
  return useKeyboardHeightManagement();
}
