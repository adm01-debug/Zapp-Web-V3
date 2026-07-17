// Re-export from consolidated useUIInteractionManagement module (ETAPA 32 consolidation)
import {
  useSwipeGestureManagement,
  useSwipeNavigationManagement,
  type SwipeState,
  type UseSwipeGestureOptions,
  type UseSwipeNavigationOptions,
} from '@/hooks/useUIInteractionManagement';

export type { SwipeState, UseSwipeGestureOptions, UseSwipeNavigationOptions };

export function useSwipeGesture(options: UseSwipeGestureOptions) {
  return useSwipeGestureManagement(options);
}

export function useSwipeNavigation(options: UseSwipeNavigationOptions) {
  return useSwipeNavigationManagement(options);
}

export default {
  useSwipeGesture,
  useSwipeNavigation,
};