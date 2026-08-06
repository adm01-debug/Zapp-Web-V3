import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useInboxHeartbeat');

const THROTTLE_MS = 240_000; // 4 min between writes (throttle > heartbeat, so the interval never bypasses it)
const HEARTBEAT_MS = 180_000; // 3 min ping while tab visible
const OFFLINE_DEBOUNCE_MS = 30_000; // write offline only after tab stays hidden for 30s+

/** Tracks agent online presence by writing `online_status` + `last_seen` to the profiles table on visibility/network changes, throttled to 4-minute intervals. */
export function useInboxHeartbeat(profileId: string | undefined) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [onlineStatus, setOnlineStatus] = useState<string>('offline');

  // Refs survive effect re-runs and remounts (StrictMode, SPA navigation): a real
  // throttle across the whole component lifetime, not per-effect-instance.
  const lastWriteAtRef = useRef(0);
  const lastWrittenStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!profileId) return;

    const updateStatus = async (status: string, forceWrite = false) => {
      setOnlineStatus(status);
      setIsOnline(status === 'online');

      // Throttle applies to EVERY transition; only a real page close (pagehide)
      // may force an immediate write.
      const now = Date.now();
      if (!forceWrite && now - lastWriteAtRef.current < THROTTLE_MS) return;

      lastWriteAtRef.current = now;
      lastWrittenStatusRef.current = status;

      try {
        await supabase
          .from('profiles')
          .update({
            online_status: status as 'online' | 'offline' | 'busy',
            last_seen: new Date().toISOString(),
          })
          .eq('id', profileId);
      } catch (err) {
        log.error('Failed to update heartbeat status:', err);
      }
    };

    let hiddenTimeout: ReturnType<typeof setTimeout> | undefined;
    let heartbeatInterval: ReturnType<typeof setInterval> | undefined;

    // Pausa REAL do heartbeat: o timer é destruído com a aba oculta (zero
    // ticks desperdiçados) e recriado ao voltar a ficar visível. O write de
    // saída (offline) continua sendo responsabilidade do debounce abaixo.
    const stopHeartbeat = () => {
      if (heartbeatInterval !== undefined) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = undefined;
      }
    };

    const startHeartbeat = () => {
      stopHeartbeat();
      heartbeatInterval = setInterval(() => {
        if (document.visibilityState === 'visible') updateStatus('online');
      }, HEARTBEAT_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (hiddenTimeout) {
          clearTimeout(hiddenTimeout);
          hiddenTimeout = undefined;
        }
        startHeartbeat();
        updateStatus('online');
      } else {
        // No immediate write when hidden: debounce — only write offline if the
        // tab stays hidden for 30s+ (a real leave, not a quick tab switch).
        // Timer de heartbeat pausado: nada roda com a aba oculta.
        stopHeartbeat();
        hiddenTimeout = setTimeout(() => {
          if (document.visibilityState !== 'visible') {
            // Already passed a 30s debounce: this is a real leave, force the
            // write (the throttle of 240s would otherwise swallow the signal).
            updateStatus('offline', true);
          }
        }, OFFLINE_DEBOUNCE_MS);
      }
    };
    const handlePageHide = () => {
      // Real tab close / navigation: immediate offline write, bypassing throttle.
      void updateStatus('offline', true);
    };
    const handleOnline = () => updateStatus('online');
    const handleOffline = () => updateStatus('offline', true);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    // pagehide is dispatched on the WINDOW (not document) and does not bubble —
    // registering on document would silently kill the handler.
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    updateStatus('online');

    startHeartbeat();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (hiddenTimeout) clearTimeout(hiddenTimeout);
      stopHeartbeat();

      // Conditional cleanup: only write offline if we had written 'online' AND the
      // throttle window elapsed. Real closes are handled by pagehide, so plain
      // remounts (StrictMode/SPA navigation) don't spam PATCHes.
      if (
        lastWrittenStatusRef.current === 'online' &&
        Date.now() - lastWriteAtRef.current > THROTTLE_MS
      ) {
        void supabase
          .from('profiles')
          .update({ online_status: 'offline', last_seen: new Date().toISOString() })
          .eq('id', profileId)
          .then(undefined, (err: unknown) => {
            // Fire-and-forget no unmount: sem handler, uma falha de rede vira
            // unhandled promise rejection no console de produção.
            log.warn('Failed to write offline heartbeat on unmount:', err);
          });
      }
    };
  }, [profileId]);

  return { isOnline, onlineStatus };
}
