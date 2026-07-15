// @ts-nocheck
// Re-export from consolidated useUIInteractionManagement module (ETAPA 32 consolidation)
import { useSwipeGestureManagement, useSwipeNavigationManagement, type SwipeState } from '@/hooks/useUIInteractionManagement';

export type { SwipeState };

export function useSwipeGesture(options: any) {
  return useSwipeGestureManagement(options);
}

export function useSwipeNavigation(options: any) {
  return useSwipeNavigationManagement(options);
}

export default {
  useSwipeGesture,
  useSwipeNavigation,
};