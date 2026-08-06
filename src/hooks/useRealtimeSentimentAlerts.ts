import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSound';
import { useAuth } from '@/hooks/useAuth';

/** Subscribes to realtime sentiment alerts from zapp.sentiment_alerts and shows a toast (plus optional browser notification and sound) when a new alert is inserted. */
export function useRealtimeSentimentAlerts() {
  const { session } = useAuth();
  const { settings, isQuietHours } = useNotificationSettings();

  // Refs para capturar sempre os valores mais recentes sem re-criar o canal.
  // O canal é criado/destruído apenas quando userId muda (login/logout),
  // não a cada token refresh ou atualização de settings.
  const settingsRef = useRef(settings);
  const isQuietHoursRef = useRef(isQuietHours);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    isQuietHoursRef.current = isQuietHours;
  }, [isQuietHours]);

  // userId é primitivo (string | undefined) — estável entre token refreshes,
  // diferente do objeto `session` que recebe nova referência a cada renovação.
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;

    // Nome único por usuário evita colisão durante cleanup/remount simultâneo
    // (ex.: StrictMode duplo-mount em dev).
    const channelName = `sentiment-alerts-${userId}`;
    const channel = supabase
      .channel(`sentiment-alerts-realtime:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'zapp',
          table: 'sentiment_alerts',
        },
        (payload) => {
          const record = payload.new as Record<string, unknown>;
          const level = typeof record?.alert_level === 'string' ? record.alert_level : undefined;
          const rawScore = record?.sentiment_score;
          const score =
            typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : undefined;
          const message = level
            ? `Alerta de sentimento ${level}${score != null ? ` (score: ${score})` : ''} detectado`
            : 'Alerta de sentimento detectado';

          toast.warning(message);

          if (settingsRef.current?.soundEnabled && !isQuietHoursRef.current()) {
            playNotificationSound('alert');
          }

          if (settingsRef.current?.browserNotifications) {
            showBrowserNotification('Alerta de Sentimento', message);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe().catch(() => {});
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [userId]);

  return null;
}
