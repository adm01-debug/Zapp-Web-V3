// Re-export from consolidated useAlertManagement module (ETAPA 28 consolidation)
import { useWebhookHealthAlertsManagement } from '@/hooks/useAlertManagement';

interface UseWebhookHealthAlertsOptions {
  enabled?: boolean;
  config?: unknown;
}

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
