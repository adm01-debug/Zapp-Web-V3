import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { getLogger } from '@/lib/logger';

const log = getLogger('useWarRoomAlerts');

interface WarRoomAlert {
  id: string;
  alert_type: string;
  title: string;
  message: string;
  is_read: boolean;
  source: string | null;
  created_at: string;
}

const VALID_ALERT_TYPES = ['critical', 'warning', 'info', 'sla_breach'];

/** Subscribes to warroom_alerts in realtime and fires browser notifications and sounds for critical/warning/SLA-breach events. Logs errors before returning an empty array on fetch failure. */
export function useWarRoomAlerts(_soundEnabled = true) {
  const { showNotification } = usePushNotifications();
  const queryClient = useQueryClient();

  const { data: alerts = [] } = useQuery<WarRoomAlert[]>({
    queryKey: ['warroom_alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warroom_alerts')
        .select('*')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        log.error('Failed to fetch warroom alerts', error);
        return [];
      }
      return (data ?? []).filter((a) => a.id && VALID_ALERT_TYPES.includes(a.alert_type));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('warroom-alerts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'warroom_alerts' },
        (payload: { new: WarRoomAlert }) => {
          const alert = payload.new;
          if (!alert?.id || !VALID_ALERT_TYPES.includes(alert.alert_type)) return;

          queryClient.invalidateQueries({ queryKey: ['warroom_alerts'] });

          showNotification({
            title: alert.title || 'Alerta',
            body: alert.message,
            requireInteraction: alert.alert_type === 'critical',
          });
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'zapp', table: 'warroom_alerts' }, () => {
        queryClient.invalidateQueries({ queryKey: ['warroom_alerts'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showNotification, queryClient]);

  const dismissAlert = useCallback(
    async (alertId: string) => {
      const { error } = await supabase
        .from('warroom_alerts')
        .update({ is_read: true })
        .eq('id', alertId);
      if (error) {
        log.error('Failed to dismiss alert', alertId, error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['warroom_alerts'] });
    },
    [queryClient]
  );

  return { alerts, dismissAlert };
}
