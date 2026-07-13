// Re-export from consolidated useNotificationManagement module (ETAPA 27 consolidation)
import { useSecurityNotificationsManagement } from '@/hooks/useNotificationManagement';
import type { SecurityNotificationConfig } from '@/hooks/useNotificationManagement';

export type { SecurityNotificationConfig };

export function useSecurityPushNotifications() {
  return useSecurityNotificationsManagement();
}
