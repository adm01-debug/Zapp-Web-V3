// Re-export from consolidated useAlertManagement module (ETAPA 28 consolidation)
import { useSentimentAlertsManagement } from '@/hooks/useAlertManagement';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { supabase } from '@/integrations/supabase/client';
import { useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('useSentimentAlerts');

export function useSentimentAlerts() {
  const { checkAndTriggerAlert } = useSentimentAlertsManagement();
  const { settings } = useNotificationSettings();

  const threshold = settings.sentimentAlertThreshold ?? 30;
  const consecutiveRequired = settings.sentimentConsecutiveCount ?? 2;
  const alertsEnabled = settings.sentimentAlertEnabled ?? true;

  const getRecentAlerts = useCallback(async (limit = 10) => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'sentiment_alert')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (
        data?.map((entry) => ({
          id: entry.id,
          contactId: entry.entity_id,
          createdAt: entry.created_at,
          ...((entry.details || {}) as Record<string, unknown>),
        })) || []
      );
    } catch (err) {
      log.error('Failed to fetch recent alerts:', err);
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
