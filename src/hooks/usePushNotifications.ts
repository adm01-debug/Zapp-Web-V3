// Re-export from consolidated useNotificationManagement module (ETAPA 27 consolidation)
import { usePushNotificationsManagement } from '@/hooks/useNotificationManagement';
import type { PushNotificationState, NotificationPayload } from '@/hooks/useNotificationManagement';

export type { PushNotificationState, NotificationPayload };

/** Manages browser push notifications with permission requests and notification sending. */
export function usePushNotifications() {
  return usePushNotificationsManagement();
}
