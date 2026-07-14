// Re-export from consolidated useNotificationManagement module (ETAPA 27 consolidation)
import { useSecurityPushNotificationsManagement } from '@/hooks/useNotificationManagement';

export function useSecurityPushNotifications() {
  return useSecurityPushNotificationsManagement();
}
