import { useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSound';

/** Subscribes to realtime sentiment alerts from audit_logs and shows a toast (plus optional browser notification and sound) when a sentiment_alert event is inserted. */
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
          const title = record?.contact_name as string | undefined;
          const sentiment = record?.sentiment as string | undefined;
          const message = sentiment
            ? `Sentimento ${sentiment} detectado${title ? ` para ${title}` : ''}`
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