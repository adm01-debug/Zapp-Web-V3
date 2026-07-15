import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

// Schema escape hatch: zapp tables not yet in generated types (gen-types-zapp.mjs pendente na VPS)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const log = getLogger('useInboxHeartbeat');

const THROTTLE_MS = 120_000; // 2 min between writes (except going offline)
const HEARTBEAT_MS = 180_000; // 3 min ping while tab visible

export function useInboxHeartbeat(profileId: string | undefined) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [onlineStatus, setOnlineStatus] = useState<string>('offline');

  useEffect(() => {
    if (!profileId) return;

    let lastWriteAt = 0;
    let lastWrittenStatus: string | null = null;

    const updateStatus = async (status: string) => {
      setOnlineStatus(status);
      setIsOnline(status === 'online');

      const now = Date.now();
      const goingOffline = status === 'offline';
      // Skip DB write if status unchanged AND we're inside the throttle window
      if (
        !goingOffline &&
        status === lastWrittenStatus &&
        now - lastWriteAt < THROTTLE_MS
      ) {
        return;
      }
      lastWriteAt = now;
      lastWrittenStatus = status;

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

    const handleVisibilityChange = () => {
      updateStatus(document.visibilityState === 'visible' ? 'online' : 'offline');
    };
    const handleOnline = () => updateStatus('online');
    const handleOffline = () => updateStatus('offline');

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    updateStatus('online');

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') updateStatus('online');
    }, HEARTBEAT_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      // Best-effort offline write on unmount
      void supabase
        .from('profiles')
        .update({ online_status: 'offline', last_seen: new Date().toISOString() })
        .eq('id', profileId);
    };
  }, [profileId]);

  return { isOnline, onlineStatus };
}
