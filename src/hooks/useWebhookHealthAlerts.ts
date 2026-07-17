// Re-export from consolidated useAlertManagement module (ETAPA 28 consolidation)
import { useWebhookHealthAlertsManagement } from '@/hooks/useAlertManagement';

export interface RecentAlertEntry {
  instance: string;
  type: 'signature_spike' | 'silence' | string;
  firedAt: string;
  reason: string;
}

interface UseWebhookHealthAlertsOptions {
  enabled?: boolean;
  config?: unknown;
}

/** Monitors webhook health status and triggers alerts on failures or breaches. */
export function useWebhookHealthAlerts(options: UseWebhookHealthAlertsOptions = {}) {
  const { alerts, loading, acknowledgeAlert, checkHealth } = useWebhookHealthAlertsManagement();

  return {
    config: options.config || {},
    setConfig: () => {
      /* stub */
    },
    activeBreaches: [],
    recentAlerts: [],
    history: [],
    reloadHistory: () => {
      /* stub */
    },
    isPolling: loading,
    alerts,
    acknowledgeAlert,
    checkHealth,
  };
}
