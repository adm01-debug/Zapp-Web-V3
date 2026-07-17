import { useRef, useCallback, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { getLogger } from '@/lib/logger';
import { safeGetItem, safeSetItem } from '@/lib/safeStorage';

const viewTransitionLog = getLogger('useViewTransition');
const deviceDetectionLog = getLogger('DeviceDetection');

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

export interface UseSwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  enabled?: boolean;
}

export interface SwipeState {
  offsetX: number;
  isSwiping: boolean;
  direction: 'left' | 'right' | null;
}

export interface UseSwipeNavigationOptions {
  onSwipeBack?: () => void;
  onSwipeForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  threshold?: number;
  edgeWidth?: number;
  enabled?: boolean;
}

export interface UserDevice {
  id: string;
  device_fingerprint: string;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  city: string | null;
  country: string | null;
  is_trusted: boolean | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface UserSession {
  id: string;
  device_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  is_active: boolean | null;
  started_at: string;
  last_activity_at: string;
  expires_at: string;
}

export interface SidebarState {
  collapsed: boolean;
  toggleCollapsed: () => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  maxReached: boolean;
}

export interface UseAriaAnnouncerReturn {
  announce: (message: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// SWIPE GESTURE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Detects and handles swipe gestures with configurable threshold and direction callbacks. */
export function useSwipeGestureManagement(options: UseSwipeGestureOptions = {}) {
  const { onSwipeLeft, onSwipeRight, threshold = 80, enabled = true } = options;
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

    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
      isTracking.current = false;
      setSwipeState({ offsetX: 0, isSwiping: false, direction: null });
      return;
    }

    currentX.current = touch.clientX;
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// EDGE SWIPE NAVIGATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Enables edge-based swipe navigation for back/forward with visual feedback indicators. */
export function useSwipeNavigationManagement(options: UseSwipeNavigationOptions = {}) {
  const { onSwipeBack, onSwipeForward, canGoBack = false, canGoForward = false, threshold = 80, edgeWidth = 24, enabled = true } = options;
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
        touchStart.current = { x: touch.clientX, y: touch.clientY, edge, time: Date.now() };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStart.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;

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

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// DEVICE DETECTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Detects and manages trusted devices and user sessions for security monitoring. */
export function useDeviceDetectionManagement() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const generateFingerprint = useCallback(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('fingerprint', 2, 2);
    }

    const components = [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      `${screen.width}x${screen.height}`,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 'unknown',
      canvas.toDataURL(),
    ];

    const hash = components
      .join('|')
      .split('')
      .reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
      }, 0);

    return Math.abs(hash).toString(36);
  }, []);

  const getBrowserInfo = useCallback(() => {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    let os = 'Unknown';

    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';
    else if (ua.includes('Opera')) browser = 'Opera';

    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
    const deviceName = isMobile ? 'Dispositivo Móvel' : 'Desktop';

    return { browser, os, deviceName };
  }, []);

  const checkDevice = useCallback(async () => {
    if (!user) return;

    try {
      const fingerprint = generateFingerprint();
      const { browser, os, deviceName } = getBrowserInfo();

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await supabase.functions.invoke('detect-new-device', {
        body: { device_fingerprint: fingerprint, browser, os, device_name: deviceName },
      });

      if (response.data && mountedRef.current) {
        setCurrentDeviceId(response.data.device_id);
        deviceDetectionLog.debug('Device check result:', response.data);
      }
    } catch (error) {
      if (mountedRef.current) {
        deviceDetectionLog.error('Error checking device:', error);
      }
    }
  }, [user, generateFingerprint, getBrowserInfo, mountedRef]);

  const fetchDevices = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_devices')
        .select('*')
        .order('last_seen_at', { ascending: false });

      if (error) throw error;
      if (mountedRef.current) setDevices(data || []);
    } catch (error) {
      if (mountedRef.current) {
        deviceDetectionLog.error('Error fetching devices:', error);
      }
    }
  }, [user, mountedRef]);

  const fetchSessions = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('is_active', true)
        .order('last_activity_at', { ascending: false });

      if (error) throw error;
      if (mountedRef.current) setSessions(data || []);
    } catch (error) {
      if (mountedRef.current) {
        deviceDetectionLog.error('Error fetching sessions:', error);
      }
    }
  }, [user, mountedRef]);

  const trustDevice = useCallback(async (deviceId: string) => {
    try {
      const { error } = await supabase
        .from('user_devices')
        .update({ is_trusted: true })
        .eq('id', deviceId);

      if (error) throw error;
      await fetchDevices();
    } catch (error) {
      if (mountedRef.current) {
        deviceDetectionLog.error('Error trusting device:', error);
      }
    }
  }, [fetchDevices, mountedRef]);

  const removeDevice = useCallback(async (deviceId: string) => {
    try {
      await supabase
        .from('user_sessions')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('device_id', deviceId);

      const { error } = await supabase.from('user_devices').delete().eq('id', deviceId);

      if (error) throw error;
      await fetchDevices();
      await fetchSessions();
    } catch (error) {
      if (mountedRef.current) {
        deviceDetectionLog.error('Error removing device:', error);
      }
    }
  }, [fetchDevices, fetchSessions, mountedRef]);

  const endSession = useCallback(async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('user_sessions')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;
      await fetchSessions();
    } catch (error) {
      if (mountedRef.current) {
        deviceDetectionLog.error('Error ending session:', error);
      }
    }
  }, [fetchSessions, mountedRef]);

  const endAllOtherSessions = useCallback(async () => {
    if (!currentDeviceId) return;

    try {
      const { error } = await supabase
        .from('user_sessions')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .neq('device_id', currentDeviceId)
        .eq('is_active', true);

      if (error) throw error;
      await fetchSessions();
    } catch (error) {
      if (mountedRef.current) {
        deviceDetectionLog.error('Error ending sessions:', error);
      }
    }
  }, [currentDeviceId, fetchSessions, mountedRef]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      Promise.all([checkDevice(), fetchDevices(), fetchSessions()]).finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    }
  }, [user, checkDevice, fetchDevices, fetchSessions, mountedRef]);

  return {
    devices,
    sessions,
    loading,
    currentDeviceId,
    trustDevice,
    removeDevice,
    endSession,
    endAllOtherSessions,
    refetch: async () => {
      await fetchDevices();
      await fetchSessions();
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ARIA ANNOUNCER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Creates and manages ARIA live region for screen reader announcements. */
export function useAriaAnnouncerManagement(): UseAriaAnnouncerReturn {
  const regionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!regionRef.current) {
      const el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      el.className = 'sr-only';
      el.id = 'aria-route-announcer';
      document.body.appendChild(el);
      regionRef.current = el;
    }

    return () => {
      if (regionRef.current && document.body.contains(regionRef.current)) {
        document.body.removeChild(regionRef.current);
        regionRef.current = null;
      }
    };
  }, []);

  const announce = useCallback((message: string) => {
    if (regionRef.current) {
      regionRef.current.textContent = '';
      requestAnimationFrame(() => {
        if (regionRef.current) {
          regionRef.current.textContent = message;
        }
      });
    }
  }, []);

  return { announce };
}

/** Component that initializes ARIA announcer for accessibility. */
export function AriaAnnouncer() {
  useAriaAnnouncerManagement();
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// VIEW TRANSITION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Provides API for starting View Transitions with fallback for unsupported browsers. */
export function useViewTransitionManagement() {
  const startTransition = useCallback((callback: () => void) => {
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => {
        finished: Promise<void>;
        ready: Promise<void>;
        updateCallbackDone: Promise<void>;
      };
    };

    if (doc.startViewTransition) {
      const transition = doc.startViewTransition(callback);
      transition.finished.catch((err: unknown) => {
        viewTransitionLog.debug('ViewTransition.finished rejected (aborted by rapid navigation)', err);
      });
      transition.ready.catch((err: unknown) => {
        viewTransitionLog.debug('ViewTransition.ready rejected', err);
      });
      transition.updateCallbackDone.catch((err: unknown) => {
        viewTransitionLog.debug('ViewTransition.updateCallbackDone rejected', err);
      });
    } else {
      callback();
    }
  }, []);

  return { startTransition };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// SIDEBAR STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

const COLLAPSE_STORAGE_KEY = 'zapp-sidebar-collapsed';
const FAVORITES_STORAGE_KEY = 'sidebar-favorites';
const MAX_FAVORITES = 6;

/** Manages sidebar collapse state with persistent storage. */
export function useSidebarCollapseManagement() {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = safeGetItem(COLLAPSE_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      safeSetItem(COLLAPSE_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = () => toggle();
    document.addEventListener('toggle-sidebar', handler);
    return () => document.removeEventListener('toggle-sidebar', handler);
  }, [toggle]);

  return { collapsed, toggle };
}

/** Manages sidebar favorites with limit enforcement and persistent storage. */
export function useSidebarFavoritesManagement() {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch {}
  }, [favorites]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      if (prev.includes(id)) {
        return prev.filter((f) => f !== id);
      }
      if (prev.length >= MAX_FAVORITES) return prev;
      return [...prev, id];
    });
  }, []);

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);

  return { favorites, toggleFavorite, isFavorite, maxReached: favorites.length >= MAX_FAVORITES };
}

/** Combines sidebar collapse and favorites state for unified management. */
export function useSidebarStateManagement(): SidebarState {
  const { collapsed, toggle: toggleCollapsed } = useSidebarCollapseManagement();
  const { favorites, toggleFavorite, isFavorite, maxReached } = useSidebarFavoritesManagement();

  return {
    collapsed,
    toggleCollapsed,
    favorites,
    toggleFavorite,
    isFavorite,
    maxReached,
  };
}