import { useEffect, useRef } from 'react';
import { useRealtimeDashboardManagement } from '@/hooks/useRealtimeManagement';
import { supabase } from '@/integrations/supabase/client';

export function useRealtimeDashboard(dashboardId?: string) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channel = supabase.channel('realtime-dashboard-messages');
    channelRef.current = channel;

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {}
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => {}
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  return useRealtimeDashboardManagement(dashboardId || 'default');
}
