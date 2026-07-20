// Re-export from consolidated useUIInteractionManagement module (ETAPA 32 consolidation)
import {
  useSwipeGestureManagement,
  useSwipeNavigationManagement,
  type SwipeState,
  type UseSwipeGestureOptions,
  type UseSwipeNavigationOptions,
} from '@/hooks/useUIInteractionManagement';

/** Re-exported module members. */
export type { SwipeState, UseSwipeGestureOptions, UseSwipeNavigationOptions };

/** Hook: use Swipe Gesture. */
export function useSwipeGesture(options: UseSwipeGestureOptions) {
  return useSwipeGestureManagement(options);
}

/** Hook: use Swipe Navigation. */
export function useSwipeNavigation(options: UseSwipeNavigationOptions) {
  return useSwipeNavigationManagement(options);
}

export default {
  useSwipeGesture,
  useSwipeNavigation,
};