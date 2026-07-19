// Re-export from consolidated useUIInteractionManagement module (ETAPA 32 consolidation)
import { useViewTransitionManagement } from '@/hooks/useUIInteractionManagement';

/** Hook: use View Transition. */
export function useViewTransition() {
  return useViewTransitionManagement();
}
