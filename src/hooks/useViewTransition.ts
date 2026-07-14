// Re-export from consolidated useUIInteractionManagement module (ETAPA 32 consolidation)
import { useViewTransitionManagement } from '@/hooks/useUIInteractionManagement';

/** Manages view transition animations and navigation effects. */
export function useViewTransition() {
  return useViewTransitionManagement();
}
