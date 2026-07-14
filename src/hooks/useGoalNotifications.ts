// Re-export from consolidated useNotificationManagement module (ETAPA 27 consolidation)
import { useGoalNotificationsManagement } from '@/hooks/useNotificationManagement';

export function useGoalNotifications() {
  return useGoalNotificationsManagement();
}
