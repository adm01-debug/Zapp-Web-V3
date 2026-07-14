// Re-export from consolidated useNotificationManagement module (ETAPA 27 consolidation)
import { usePushNotificationsManagement } from '@/hooks/useNotificationManagement';
import type { PushNotificationState, NotificationPayload } from '@/hooks/useNotificationManagement';

export type { PushNotificationState, NotificationPayload };

export function usePushNotifications() {
  return usePushNotificationsManagement();
}
