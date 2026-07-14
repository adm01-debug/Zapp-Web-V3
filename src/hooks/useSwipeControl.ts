// Re-export from consolidated useUIInteractionManagement module (ETAPA 32 consolidation)
import {
  useSwipeGestureManagement,
  useSwipeNavigationManagement,
  type SwipeState,
} from '@/hooks/useUIInteractionManagement';

export type { SwipeState };

/** Handles swipe gestures for navigation and interactions on touch devices. */
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
