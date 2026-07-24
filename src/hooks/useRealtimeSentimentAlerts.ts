import { useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSound';

/** Subscribes to realtime sentiment alerts from zapp.sentiment_alerts and shows a toast (plus optional browser notification and sound) when a new alert is inserted. */
export function useRealtimeSentimentAlerts() {
  const { settings, isQuietHours } = useNotificationSettings();

  useEffect(() => {
    const channel = supabase
      .channel('sentiment-alerts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'zapp',
          table: 'sentiment_alerts',
        },
        (payload) => {
          const record = payload.new as Record<string, unknown>;
          const level =
            typeof record?.alert_level === 'string' ? record.alert_level : undefined;
          const rawScore = record?.sentiment_score;
          const score =
            typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : undefined;
          const message = level
            ? `Alerta de sentimento ${level}${score != null ? ` (score: ${score})` : ''} detectado`
            : 'Alerta de sentimento detectado';

          toast.warning(message);

          if (settings?.soundEnabled && !isQuietHours()) {
            playNotificationSound('alert');
          }

          if (settings?.browserNotifications) {
            showBrowserNotification('Alerta de Sentimento', message);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [settings, isQuietHours]);

  return null;
}
