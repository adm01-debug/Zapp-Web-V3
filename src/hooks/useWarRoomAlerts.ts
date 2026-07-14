// Re-export from consolidated useAlertManagement module (ETAPA 28 consolidation)
import { useWarRoomAlertsManagement } from '@/hooks/useAlertManagement';

/** Manages war room alerts with optional sound notifications for critical events. */
export function useWarRoomAlerts(soundEnabled = true) {
  return useWarRoomAlertsManagement(soundEnabled);
}
