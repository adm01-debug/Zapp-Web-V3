import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePushNotifications } from './usePushNotifications';
import { getLogger } from '@/lib/logger';
import { warRoomAlertRowSchema, safeParseEvent } from '@/shared/webhookEventSchemas';

const log = getLogger('useWarRoomAlerts');

interface WarRoomAlert {
  id: string;
  alert_type: string;
  title: string;
  message: string;
  source: string | null;
  is_read: boolean;
  created_at: string;
}

export function useWarRoomAlerts(soundEnabled = true) {
  const queryClient = useQueryClient();
  const { showNotification, permission } = usePushNotifications();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize alert sound
  useEffect(() => {
    audioRef.current = new Audio(
      'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgip6LbUg3WX2OgGtLPE51g3lgSkRHZXVzYFRDSWBwaV5WTFFcaGReW1haYmhkYl9eYGVpZ2VkZGRnamlnZmZnaGlpaGdnaGhpaWloaGhpaWhoaGlpaGlpaGhpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaQ=='
    );
    audioRef.current.volume = 0.5;
  }, []);

  const playAlertSound = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((err: unknown) => {
        // Autoplay policy prevents sound — browsers require a prior user gesture.
        // This is expected behaviour; log at debug level only.
        log.debug('Alert sound blocked by autoplay policy', err);
      });
    }
  }, [soundEnabled]);

  // Fetch existing alerts
  const { data: alerts = [] } = useQuery({
    queryKey: ['warroom-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warroom_alerts')
        .select('*')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        log.error('Failed to fetch warroom_alerts', error);
        return [] as WarRoomAlert[];
      }
      return (data || []) as WarRoomAlert[];
    },
    refetchInterval: 30000,
  });

  const alertsRef = useRef(alerts);
  // Keep alertsRef in sync so the SLA interval can read latest alerts without being in its dep array
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  // Real-time subscription for new alerts
  useEffect(() => {
    const channel = supabase
      .channel('warroom-alerts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'warroom_alerts' },
        (payload) => {
          const parsed = safeParseEvent(warRoomAlertRowSchema, payload.new);
          if (!parsed.ok) {
            log.warn('warroom_alerts INSERT payload rejeitado', parsed.error);
            return;
          }
          const alert = parsed.data as WarRoomAlert;
          queryClient.invalidateQueries({ queryKey: ['warroom-alerts'] });

          // Play sound
          if (alert.alert_type === 'critical') {
            playAlertSound();
            playAlertSound(); // double beep for critical
          } else {
            playAlertSound();
          }

          // Push notification
          if (permission === 'granted') {
            showNotification({
              title: `⚠️ ${alert.title}`,
              body: alert.message,
              tag: `warroom-${alert.id}`,
              requireInteraction: alert.alert_type === 'critical',
            });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, playAlertSound, permission, showNotification]);

  // Dismiss alert
  const dismissAlert = async (alertId: string) => {
    const { error } = await supabase
      .from('warroom_alerts')
      .update({ is_read: true })
      .eq('id', alertId);
    if (error) log.error('Failed to dismiss warroom alert', error);
    queryClient.invalidateQueries({ queryKey: ['warroom-alerts'] });
  };

  // SLA breach monitor - checks every 60s and creates alerts
  useEffect(() => {
    const checkSLABreaches = async () => {
      const { data: breaches, error: breachesErr } = await supabase
        .from('conversation_sla')
        .select('id, contact_id, first_response_breached, resolution_breached')
        .or('first_response_breached.eq.true,resolution_breached.eq.true');

      if (breachesErr) {
        log.error('Failed to check SLA breaches', breachesErr);
        return;
      }

      if (breaches && breaches.length > 0) {
        const newBreachCount = breaches.length;
        // Only alert if breaches exist (idempotent via source field)
        const existingAlerts = alertsRef.current.filter((a) => a.source === 'sla-monitor');
        if (existingAlerts.length === 0 || newBreachCount > existingAlerts.length) {
          const { error: insertErr } = await supabase.from('warroom_alerts').insert({
            alert_type: 'critical',
            title: `${newBreachCount} SLA(s) Violado(s)`,
            message: `Existem ${newBreachCount} conversas com SLA violado que precisam de atenção imediata.`,
            source: 'sla-monitor',
          });
          if (insertErr) log.error('Failed to insert SLA breach alert', insertErr);
        }
      }
    };

    const interval = setInterval(() => {
      void checkSLABreaches();
    }, 60000);
    void checkSLABreaches(); // initial check
    return () => clearInterval(interval);
  }, []);

  return { alerts, dismissAlert };
}
