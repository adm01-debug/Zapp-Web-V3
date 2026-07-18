import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePushNotifications } from '@/hooks/usePushNotifications';

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

export function useWarRoomAlerts(soundEnabled = true) {
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

      if (error) return [];
      return (data ?? []).filter(
        (a) => a.id && VALID_ALERT_TYPES.includes(a.alert_type)
      );
    },
  });

  useEffect(() => {
    const subscription = supabase
      .channel('warroom-alerts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'warroom_alerts' },
        (payload: { new: WarRoomAlert }) => {
          const alert = payload.new;
          if (!alert?.id || !VALID_ALERT_TYPES.includes(alert.alert_type)) return;

          queryClient.invalidateQueries({ queryKey: ['warroom_alerts'] });

          if (soundEnabled) {
            showNotification({
              title: alert.title || 'Alerta',
              body: alert.message,
              requireInteraction: alert.alert_type === 'critical',
            });
          }
        }
      )
      .subscribe();

    return () => { subscription.unsubscribe(); };
  }, [soundEnabled, showNotification, queryClient]);

  const dismissAlert = useCallback(async (alertId: string) => {
    await supabase
      .from('warroom_alerts')
      .update({ is_read: true })
      .eq('id', alertId);
    queryClient.invalidateQueries({ queryKey: ['warroom_alerts'] });
  }, [queryClient]);

  return { alerts, dismissAlert };
}
