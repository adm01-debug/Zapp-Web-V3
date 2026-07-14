// Re-export from consolidated useAlertManagement module (ETAPA 28 consolidation)
import { useWarRoomAlertsManagement } from '@/hooks/useAlertManagement';

export function useWarRoomAlerts(soundEnabled = true) {
  return useWarRoomAlertsManagement(soundEnabled);
}
