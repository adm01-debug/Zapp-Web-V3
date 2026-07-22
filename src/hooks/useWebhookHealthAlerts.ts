// Re-export from consolidated useAlertManagement module (ETAPA 28 consolidation)
import { useWebhookHealthAlertsManagement } from '@/hooks/useAlertManagement';
import { DEFAULT_ALERT_CONFIG, type WebhookAlertConfig } from '@/lib/webhookHealthAlerts';
import type { AlertHistoryEntry } from '@/lib/alertHistory';


/** Hook: Recent Alert Entry. */
export interface RecentAlertEntry {
  instance: string;
  type: 'signature_spike' | 'silence' | string;
  firedAt: string;
  reason: string;
}

interface UseWebhookHealthAlertsOptions {
  enabled?: boolean;
  config?: WebhookAlertConfig;
}

/** Hook: use Webhook Health Alerts. */
export function useWebhookHealthAlerts(options: UseWebhookHealthAlertsOptions = {}) {
  const { alerts, loading, acknowledgeAlert, checkHealth } = useWebhookHealthAlertsManagement();

  return {
    config: options.config ?? DEFAULT_ALERT_CONFIG,
    setConfig: (_next: WebhookAlertConfig) => {
      /* stub */
    },
    activeBreaches: [] as RecentAlertEntry[],
    recentAlerts: [] as RecentAlertEntry[],
    history: [] as RecentAlertEntry[],
    reloadHistory: () => {
      /* stub */
    },
    isPolling: loading,
    alerts,
    acknowledgeAlert,
    checkHealth,
  };
}

