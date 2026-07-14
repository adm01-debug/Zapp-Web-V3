// Re-export from consolidated useNotificationManagement module (ETAPA 27 consolidation)
import { useGoalNotificationsManagement } from '@/hooks/useNotificationManagement';

/** Subscribes to real-time goal achievement and progress notifications. */
export function useGoalNotifications() {
  return useGoalNotificationsManagement();
}
