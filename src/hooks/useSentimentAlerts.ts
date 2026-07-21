// @ts-nocheck
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';

/** Hook: use Sentiment Alerts. */
export function useSentimentAlerts() {
  const { settings } = useNotificationSettings();

  const threshold = settings.sentimentAlertThreshold ?? 30;
  const consecutiveRequired = settings.sentimentConsecutiveCount ?? 2;
  const alertsEnabled = settings.sentimentAlertEnabled ?? true;

  const checkAndTriggerAlert = useCallback(
    async (data: SentimentAlertData) => {
      if (!alertsEnabled) {
        return { triggered: false, reason: 'Alerts disabled' };
      }

      if (data.sentimentScore >= threshold) {
        return { triggered: false, reason: 'Sentiment above threshold' };
      }

      try {
        const { data: result, error } = await supabase.functions.invoke('sentiment-alert', {
          body: {
            contactId: data.contactId,
            contactName: data.contactName,
            sentimentScore: data.sentimentScore,
            consecutiveRequired,
            analysisId: data.analysisId,
          },
        });

        if (error) {
          return { triggered: false, error };
        }

        return {
          triggered: result?.alerted ?? false,
          consecutiveLow: result?.consecutiveLow,
          emailSent: result?.emailSent,
          ...result,
        };
      } catch (err) {
        return { triggered: false, error: err };
      }
    },
    [threshold, consecutiveRequired, alertsEnabled]
  );

  const getRecentAlerts = useCallback(async (limit = 10) => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'sentiment_alert')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map(
        (entry: { id: string; entity_id: string; created_at: string; details?: Record<string, unknown> }) => ({
          id: entry.id,
          contactId: entry.entity_id,
          createdAt: entry.created_at,
          ...((entry.details || {}) as Record<string, unknown>),
        })
      );
    } catch {
      return [];
    }
  }, []);

  return {
    checkAndTriggerAlert,
    getRecentAlerts,
    threshold,
    consecutiveRequired,
    alertsEnabled,
  };
}