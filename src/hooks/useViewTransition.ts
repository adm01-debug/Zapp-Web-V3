// Re-export from consolidated useUIInteractionManagement module (ETAPA 32 consolidation)
import { useViewTransitionManagement } from '@/hooks/useUIInteractionManagement';

export function useViewTransition() {
  return useViewTransitionManagement();
}
