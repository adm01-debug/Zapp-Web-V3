import { useCallback } from 'react';
import { usePushNotificationsManagement } from '@/hooks/useNotificationManagement';
import type { PushNotificationState, NotificationPayload } from '@/hooks/useNotificationManagement';

/** Re-exported module members. */
export type { PushNotificationState, NotificationPayload };

/** Hook: use Push Notifications. */
export function usePushNotifications() {
  const mgmt = usePushNotificationsManagement();

  const subscribe = useCallback(async () => {
    if (!mgmt.isSubscribed) {
      await mgmt.toggleSubscription();
    }
  }, [mgmt.isSubscribed, mgmt.toggleSubscription]);

  const unsubscribe = useCallback(async () => {
    if (mgmt.isSubscribed) {
      await mgmt.toggleSubscription();
    }
  }, [mgmt.isSubscribed, mgmt.toggleSubscription]);

  return {
    ...mgmt,
    subscribe,
    unsubscribe,
  };
}
