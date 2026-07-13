/**
 * useSwipeControl.ts (v1.0)
 * Unified swipe gesture control consolidating:
 * - useSwipeGesture: Basic swipe gesture handler
 * - useSwipeNavigation: iOS/Android-style edge swipe for navigation
 *
 * Backward compatibility maintained through re-exports of legacy hook names.
 */
import { useRef, useCallback, useState, useEffect } from 'react';

// ──────────────────────────────────────────────────────────────────────────
// BASIC SWIPE GESTURE
// ──────────────────────────────────────────────────────────────────────────

interface UseSwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  enabled?: boolean;
}

interface SwipeState {
  offsetX: number;
  isSwiping: boolean;
  direction: 'left' | 'right' | null;
}

/**
 * Hook for swipe gestures on touch devices.
 * Returns handlers and current swipe state for visual feedback.
 */
export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  threshold = 80,
  enabled = true,
}: UseSwipeGestureOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const isTracking = useRef(false);
  const [swipeState, setSwipeState] = useState<SwipeState>({
    offsetX: 0,
    isSwiping: false,
    direction: null,
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = startX.current;
    isTracking.current = true;
  }, [enabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled || !isTracking.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - startX.current;
    const deltaY = touch.clientY - startY.current;

    // Cancel if vertical scroll is dominant
    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
      isTracking.current = false;
      setSwipeState({ offsetX: 0, isSwiping: false, direction: null });
      return;
    }

    currentX.current = touch.clientX;

    // Clamp the offset for visual feedback
    const clampedOffset = Math.max(-threshold * 1.5, Math.min(threshold * 1.5, deltaX));
    const direction = deltaX > 0 ? 'right' : deltaX < 0 ? 'left' : null;

    setSwipeState({
      offsetX: clampedOffset,
      isSwiping: Math.abs(deltaX) > 10,
      direction,
    });
  }, [enabled, threshold]);

  const handleTouchEnd = useCallback(() => {
    if (!enabled || !isTracking.current) return;
    isTracking.current = false;

    const deltaX = currentX.current - startX.current;

    if (deltaX > threshold && onSwipeRight) {
      onSwipeRight();
    } else if (deltaX < -threshold && onSwipeLeft) {
      onSwipeLeft();
    }

    setSwipeState({ offsetX: 0, isSwiping: false, direction: null });
  }, [enabled, threshold, onSwipeLeft, onSwipeRight]);

  return {
    swipeState,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// EDGE SWIPE NAVIGATION
// ──────────────────────────────────────────────────────────────────────────

interface UseSwipeNavigationOptions {
  onSwipeBack?: () => void;
  onSwipeForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  threshold?: number;
  edgeWidth?: number;
  enabled?: boolean;
}

/**
 * iOS/Android-style edge swipe for back/forward navigation.
 * Swipe from left edge → go back; swipe from right edge → go forward.
 * Only activates on touch devices within the edge zones.
 */
export function useSwipeNavigation({
  onSwipeBack,
  onSwipeForward,
  canGoBack = false,
  canGoForward = false,
  threshold = 80,
  edgeWidth = 24,
  enabled = true,
}: UseSwipeNavigationOptions) {
  const touchStart = useRef<{ x: number; y: number; edge: 'left' | 'right' | null; time: number } | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);

  const createIndicator = useCallback((side: 'left' | 'right') => {
    if (indicatorRef.current) return;
    const el = document.createElement('div');
    el.className = `swipe-nav-indicator swipe-nav-${side}`;
    el.style.cssText = `
      position: fixed;
      top: 50%;
      ${side}: 0;
      transform: translateY(-50%) scale(0.5);
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: hsl(var(--primary) / 0.15);
      border: 2px solid hsl(var(--primary) / 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    el.textContent = side === 'left'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';
    el.style.color = 'hsl(var(--primary))';
    document.body.appendChild(el);
    indicatorRef.current = el;
    requestAnimationFrame(() => {
      el.style.opacity = '0.8';
      el.style.transform = 'translateY(-50%) scale(1)';
    });
  }, []);

  const removeIndicator = useCallback(() => {
    if (indicatorRef.current) {
      indicatorRef.current.style.opacity = '0';
      indicatorRef.current.style.transform = 'translateY(-50%) scale(0.5)';
      const el = indicatorRef.current;
      setTimeout(() => el.remove(), 200);
      indicatorRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const screenW = window.innerWidth;
      let edge: 'left' | 'right' | null = null;

      if (touch.clientX <= edgeWidth && canGoBack) edge = 'left';
      else if (touch.clientX >= screenW - edgeWidth && canGoForward) edge = 'right';

      if (edge) {
        touchStart.current = {
          x: touch.clientX,
          y: touch.clientY,
          edge,
          time: Date.now(),
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStart.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;

      // If vertical scroll is dominant, cancel
      if (Math.abs(dy) > Math.abs(dx) * 1.5) {
        removeIndicator();
        touchStart.current = null;
        return;
      }

      const { edge } = touchStart.current;
      const progress = Math.abs(dx) / threshold;

      if (edge === 'left' && dx > 20) {
        createIndicator('left');
        if (indicatorRef.current) {
          indicatorRef.current.style.transform = `translateY(-50%) scale(${Math.min(1 + progress * 0.3, 1.3)})`;
          indicatorRef.current.style.opacity = `${Math.min(progress, 1)}`;
          indicatorRef.current.style.left = `${Math.min(dx - 16, 16)}px`;
        }
      } else if (edge === 'right' && dx < -20) {
        createIndicator('right');
        if (indicatorRef.current) {
          indicatorRef.current.style.transform = `translateY(-50%) scale(${Math.min(1 + progress * 0.3, 1.3)})`;
          indicatorRef.current.style.opacity = `${Math.min(progress, 1)}`;
          indicatorRef.current.style.right = `${Math.min(Math.abs(dx) - 16, 16)}px`;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      removeIndicator();
      if (!touchStart.current) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const elapsed = Date.now() - touchStart.current.time;
      const { edge } = touchStart.current;

      touchStart.current = null;

      // Fast flick (< 300ms) or exceeded threshold
      const isFlick = elapsed < 300 && Math.abs(dx) > 30;
      const isSwipe = Math.abs(dx) >= threshold;

      if (edge === 'left' && dx > 0 && (isFlick || isSwipe)) {
        onSwipeBack?.();
      } else if (edge === 'right' && dx < 0 && (isFlick || isSwipe)) {
        onSwipeForward?.();
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      removeIndicator();
    };
  }, [enabled, canGoBack, canGoForward, onSwipeBack, onSwipeForward, threshold, edgeWidth, createIndicator, removeIndicator]);
}

// ──────────────────────────────────────────────────────────────────────────
// BACKWARD COMPATIBILITY
// ──────────────────────────────────────────────────────────────────────────

export default {
  useSwipeGesture,
  useSwipeNavigation,
};
