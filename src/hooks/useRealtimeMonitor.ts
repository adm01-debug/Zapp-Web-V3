import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribes to realtime changes that matter for the realtime monitor page
 * (channel connection status + new failed messages) and invalidates the
 * matching React Query keys so the UI reflects the change without a refresh.
 *
 * Returns `lastEventAt` (timestamp of the most recent realtime payload) so
 * the page header can render a pulsing "ao vivo" badge.
 */
export function useRealtimeMonitor(enabled: boolean) {
  const queryClient = useQueryClient();
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel('realtime-monitor')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'zapp', table: 'channel_connections' },
        () => {
          setLastEventAt(Date.now());
          void queryClient.invalidateQueries({ queryKey: ['realtime-monitor', 'connections'] });
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'zapp', table: 'failed_messages' }, () => {
        setLastEventAt(Date.now());
        void queryClient.invalidateQueries({ queryKey: ['realtime-monitor', 'dispatch-errors'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);

  return { lastEventAt };
}
