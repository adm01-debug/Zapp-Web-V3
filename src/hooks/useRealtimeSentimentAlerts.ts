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
          schema: 'public',
          table: 'audit_logs',
          filter: 'action=eq.sentiment_alert',
        },
        (payload) => {
          const record = payload.new as Record<string, unknown>;
          const title = (record?.details as Record<string, unknown>)?.contact_name as string | undefined;
          const sentiment = (record?.details as Record<string, unknown>)?.sentiment as string | undefined;
          const message = sentiment
            ? `Sentimento ${sentiment} detectado${title ? ` para ${title}` : ''}`
            : 'Alerta de sentimento detectado';

          toast.warning(message);

          if (settings?.soundEnabled && !isQuietHours()) {
            playNotificationSound();
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