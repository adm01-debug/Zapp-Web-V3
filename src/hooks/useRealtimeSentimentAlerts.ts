import { useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, warnSupabaseUnconfigured } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { playNotificationSound } from '@/utils/notificationSound';
import { showBrowserNotification, requestNotificationPermission } from '@/utils/notificationSound';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { getLogger } from '@/lib/logger';
import {
  safeParseEvent,
  sentimentAlertAuditRowSchema,
} from '@/shared/webhookEventSchemas';

const log = getLogger('SentimentAlerts');

interface SentimentAlertPayload {
  id: string;
  action: string;
  entity_id: string | null;
  entity_type: string | null;
  user_id: string | null;
  details: {
    type?: string;
    contact_id?: string;
    contact_name?: string;
    contact_phone?: string;
    sentiment_score?: number;
    consecutive_low?: number;
    agent_name?: string;
    message?: string;
  } | null;
  created_at: string;
}

export function useRealtimeSentimentAlerts() {
  const { settings, isQuietHours } = useNotificationSettings();

  const handleNewAlert = useCallback(async (payload: SentimentAlertPayload) => {
    log.debug('New sentiment alert received', { payload });

    const details = payload.details || {};
    const contactName = details.contact_name || 'Cliente';
    const sentimentScore = details.sentiment_score || 0;
    const consecutiveLow = details.consecutive_low || 0;

    // Show toast notification
    toast.error(
      `⚠️ Alerta de Sentimento: ${contactName}`,
      {
        description: `Sentimento negativo (${sentimentScore}%) detectado em ${consecutiveLow} análises consecutivas`,
        duration: 10000,
        action: {
          label: 'Ver detalhes',
          onClick: () => {
            // Navigate to sentiment dashboard
            const tabsList = document.querySelector('[value="ai"]');
            if (tabsList) {
              (tabsList as HTMLElement).click();
            }
          },
        },
      }
    );

    // Play alert sound if not in quiet hours
    if (!isQuietHours() && settings.soundEnabled) {
      try {
        playNotificationSound('alert');
      } catch (err) {
        log.error('Error playing notification sound:', err);
      }
    }

    // Show browser notification
    if (settings.browserNotifications) {
      await requestNotificationPermission();
      showBrowserNotification(
        '⚠️ Alerta de Sentimento Negativo',
        `${contactName}: Sentimento em ${sentimentScore}% (${consecutiveLow} análises consecutivas)`,
        '/favicon.ico'
      );
    }
  }, [settings, isQuietHours]);

  useEffect(() => {
    // Skip realtime entirely when Supabase isn't configured — otherwise the
    // socket retries forever against an unreachable host and floods the console.
    if (!isSupabaseConfigured) {
      warnSupabaseUnconfigured('useRealtimeSentimentAlerts');
      return;
    }

    log.debug('Setting up realtime subscription');

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
          log.debug('Realtime payload', { payload });
          const parsed = safeParseEvent(sentimentAlertAuditRowSchema, payload.new);
          if (!parsed.ok) {
            log.warn('sentiment_alert payload rejeitado', parsed.error);
            return;
          }
          void handleNewAlert(parsed.data as SentimentAlertPayload);
        }
      )
      .subscribe((status) => {
        log.debug('Subscription status', { status });
      });

    return () => {
      log.debug('Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [handleNewAlert]);

  return null;
}
