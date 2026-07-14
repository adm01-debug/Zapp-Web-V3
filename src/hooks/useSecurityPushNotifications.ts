// Re-export from consolidated useNotificationManagement module (ETAPA 27 consolidation)
import { useSecurityPushNotificationsManagement } from '@/hooks/useNotificationManagement';

/** Subscribes to real-time security alerts and suspicious activity notifications. */
export function useSecurityPushNotifications() {
  return useSecurityPushNotificationsManagement();
}
