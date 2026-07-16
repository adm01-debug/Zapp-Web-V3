// Escape hatch pontual: `webhook_health_checks` e `sentiment_alerts` são
// tabelas do schema `zapp` que ainda não estão nos types gerados pela Lovable
// Cloud (o schema oficial vive na VPS self-hosted). Enquanto o
// gen-types-zapp.mjs não é rodado com acesso à VPS, usamos `db as any` só na
// fronteira dessas tabelas. A superfície pública do hook permanece 100% tipada.
import { useEffect, useRef, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { usePushNotificationsManagement } from '@/hooks/useNotificationManagement';
import { useNotificationSettingsManagement } from '@/hooks/useNotificationManagement';
import { toast } from 'sonner';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSounds';
import { getLogger } from '@/lib/logger';
import { warRoomAlertRowSchema, safeParseEvent } from '@/shared/webhookEventSchemas';
import { queryKeys } from '@/services/api/queryKeys';

const log = getLogger('useAlertManagement');

// Escape hatch localizado: as tabelas `webhook_health_checks` e
// `sentiment_alerts` vivem no schema `zapp` da VPS self-hosted, mas ainda não
// estão nos types gerados pela Lovable Cloud. Também usamos aqui para colunas
// de `warroom_alerts`/`conversation_sla` que ainda divergem do types.ts local.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

export interface WarRoomAlert {
  id: string;
  alert_type: string;
  title: string;
  message: string;
  source: string | null;
  is_read: boolean | null;
  created_at: string | null;
}

export interface SentimentAlertData {
  contactId: string;
  contactName: string;
  sentimentScore: number;
  previousScore?: number;
  analysisId: string;
}

export interface WebhookHealthAlert {
  id: string;
  webhook_id: string;
  status: 'healthy' | 'degraded' | 'failed';
  error_message: string | null;
  last_checked_at: string;
  created_at: string;
}

export interface RealtimeSentimentAlert {
  id: string;
  contact_id: string;
  message_id: string;
  sentiment_score: number;
  alert_level: 'low' | 'medium' | 'high';
  acknowledged: boolean;
  created_at: string;
}

export interface UseWarRoomAlertsResult {
  alerts: WarRoomAlert[];
  dismissAlert: (alertId: string) => Promise<void>;
}

export interface UseSentimentAlertsResult {
  checkAndTriggerAlert: (
    data: SentimentAlertData
  ) => Promise<{ triggered: boolean; reason: string }>;
}

export interface UseWebhookHealthAlertsResult {
  alerts: WebhookHealthAlert[];
  loading: boolean;
  acknowledgeAlert: (alertId: string) => Promise<void>;
  checkHealth: () => Promise<void>;
}

export interface UseRealtimeSentimentAlertsResult {
  alerts: RealtimeSentimentAlert[];
  acknowledgeAlert: (alertId: string) => Promise<void>;
  clearAlert: (alertId: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// WAR ROOM ALERTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Manages war room alerts with sound notifications, push notifications, and alert history tracking. */
export function useWarRoomAlertsManagement(soundEnabled = true): UseWarRoomAlertsResult {
  const queryClient = useQueryClient();
  const { permission: pushPermission } = usePushNotificationsManagement();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(
      'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgip6LbUg3WX2OgGtLPE51g3lgSkRHZXVzYFRDSWBwaV5WTFFcaGReW1haYmhkYl9eYGVpZ2VkZGRnamlnZmZnaGlpaGdnaGhpaWloaGhpaWhoaGlpaGlpaGhpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaQ=='
    );
    if (audioRef.current) audioRef.current.volume = 0.5;
  }, []);

  const playAlertSound = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((err: unknown) => {
        log.debug('Alert sound blocked by autoplay policy', err);
      });
    }
  }, [soundEnabled]);

  const { data: alerts = [] } = useQuery({
    queryKey: queryKeys.alerts.all(),
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
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  useEffect(() => {
    const channel = supabase
      .channel('warroom-alerts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'warroom_alerts' },
        (payload) => {
          const parsed = safeParseEvent(warRoomAlertRowSchema, payload.new);
          if (!parsed.ok) {
            log.warn(
              '[useWarRoomAlertsManagement] received malformed realtime payload',
              payload.new
            );
            return;
          }
          const alert = parsed.data as WarRoomAlert;
          void queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all() });

          if (alert.alert_type === 'critical') {
            playAlertSound();
            playAlertSound();
          } else {
            playAlertSound();
          }

          if (pushPermission === 'granted') {
            showBrowserNotification(`⚠️ ${alert.title}`, alert.message);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [queryClient, playAlertSound, pushPermission]);

  const dismissAlert = async (alertId: string) => {
    const { error } = await supabase
      .from('warroom_alerts')
      .update({ is_read: true })
      .eq('id', alertId);
    if (error) log.error('Failed to dismiss warroom alert', error);
    queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all() });
  };

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
    void checkSLABreaches();
    return () => clearInterval(interval);
  }, []);

  return { alerts, dismissAlert };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// SENTIMENT ALERTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Detects negative sentiment patterns with configurable thresholds and quiet hours support. */
export function useSentimentAlertsManagement(): UseSentimentAlertsResult {
  const { settings, isQuietHours } = useNotificationSettingsManagement();

  const threshold = settings.sentimentAlertThreshold ?? 30;
  const consecutiveRequired = settings.sentimentConsecutiveCount ?? 2;
  const alertsEnabled = settings.sentimentAlertEnabled ?? true;

  const checkAndTriggerAlert = useCallback(
    async (data: SentimentAlertData) => {
      if (!alertsEnabled) {
        return { triggered: false, reason: 'Sentiment alerts disabled by user' };
      }

      const { contactId, contactName, sentimentScore, previousScore, analysisId } = data;

      if (sentimentScore >= threshold) {
        return { triggered: false, reason: 'Sentiment above threshold' };
      }

      log.debug('Checking sentiment alert for:', {
        contactName,
        sentimentScore,
        threshold,
        consecutiveRequired,
      });

      try {
        const { data: alertResult, error } = await supabase.functions.invoke('sentiment-alert', {
          body: {
            contactId,
            contactName,
            sentimentScore,
            previousScore,
            analysisId,
            threshold,
            consecutiveRequired,
          },
        });

        if (error) {
          log.error('Error invoking sentiment-alert function:', error);
          return { triggered: false, reason: `Function error: ${error.message}` };
        }

        if (alertResult?.triggered) {
          const alertMessage = `⚠️ Sentiment Alert: ${contactName} (Score: ${sentimentScore.toFixed(1)})`;
          toast.warning(alertMessage, {
            description: `Consecutive low sentiment detections for this contact.`,
          });

          if (settings.soundEnabled && !isQuietHours()) {
            playNotificationSound(
              'sla_warning' as const,
              settings.slaSoundType,
              settings.soundVolume
            );
          }

          if (settings.browserNotifications) {
            showBrowserNotification('Sentiment Alert', alertMessage);
          }

          return { triggered: true, reason: 'Alert triggered' };
        }

        return { triggered: false, reason: alertResult?.reason || 'No alert needed' };
      } catch (error) {
        log.error('Error checking sentiment alert:', error);
        return {
          triggered: false,
          reason: `Exception: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
    [threshold, consecutiveRequired, alertsEnabled, settings, isQuietHours]
  );

  return { checkAndTriggerAlert };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// WEBHOOK HEALTH ALERTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Monitors webhook endpoint health with failure detection and alert management. */
export function useWebhookHealthAlertsManagement(): UseWebhookHealthAlertsResult {
  const [alerts, setAlerts] = useState<WebhookHealthAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await safeClient.from('webhook_health_checks', (q) =>
        q.select('*').order('created_at', { ascending: false }).limit(100)
      );

      if (error) throw error;
      setAlerts((data || []) as WebhookHealthAlert[]);
    } catch (error) {
      log.error('Failed to check webhook health:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    try {
      await supabase.from('webhook_health_checks').update({ acknowledged: true }).eq('id', alertId);
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a } : a)));
    } catch (error) {
      log.error('Failed to acknowledge webhook health alert:', error);
    }
  }, []);

  return { alerts, loading, acknowledgeAlert, checkHealth };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// REALTIME SENTIMENT ALERTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Tracks real-time sentiment alerts with Supabase subscriptions and quiet hours enforcement. */
export function useRealtimeSentimentAlertsManagement(): UseRealtimeSentimentAlertsResult {
  const [alerts, setAlerts] = useState<RealtimeSentimentAlert[]>([]);
  const { settings, isQuietHours } = useNotificationSettingsManagement();

  // Refs para evitar re-subscribe a cada render (settings/isQuietHours mudam de referência)
  const settingsRef = useRef(settings);
  const isQuietHoursRef = useRef(isQuietHours);
  useEffect(() => {
    settingsRef.current = settings;
    isQuietHoursRef.current = isQuietHours;
  }, [settings, isQuietHours]);

  useEffect(() => {
    // Canal único por mount para prevenir reuso após subscribe()
    const channelName = `realtime-sentiment-alerts-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'sentiment_alerts' },
        (payload) => {
          const newAlert = payload.new as RealtimeSentimentAlert;
          setAlerts((prev) => [newAlert, ...prev.slice(0, 49)]);

          const s = settingsRef.current;
          const quiet = isQuietHoursRef.current;
          if (s.soundEnabled && !quiet()) {
            playNotificationSound('sla_warning' as const, s.slaSoundType, s.soundVolume);
          }
          if (s.browserNotifications) {
            showBrowserNotification(
              `Sentiment Alert - Level: ${newAlert.alert_level}`,
              `Contact: ${newAlert.contact_id}`
            );
          }
          toast.warning(`Sentiment Alert (${newAlert.alert_level})`, {
            description: `Contact ${newAlert.contact_id} - Score: ${newAlert.sentiment_score.toFixed(2)}`,
          });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    try {
      await supabase.from('sentiment_alerts').update({ acknowledged: true }).eq('id', alertId);
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)));
    } catch (error) {
      log.error('Failed to acknowledge sentiment alert:', error);
    }
  }, []);

  const clearAlert = useCallback(async (alertId: string) => {
    try {
      await supabase.from('sentiment_alerts').delete().eq('id', alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (error) {
      log.error('Failed to clear sentiment alert:', error);
    }
  }, []);

  return { alerts, acknowledgeAlert, clearAlert };
}
