import { useCallback } from 'react';
import { usePushNotificationsManagement } from '@/hooks/useNotificationManagement';
import type { PushNotificationState, NotificationPayload } from '@/hooks/useNotificationManagement';

/** Re-exported module members. */
export type { PushNotificationState, NotificationPayload };

/** Hook: use Push Notifications. */
export function usePushNotifications() {
  const mgmt = usePushNotificationsManagement();
  const { isSubscribed, toggleSubscription } = mgmt;

  const subscribe = useCallback(async () => {
    if (!isSubscribed) {
      await toggleSubscription();
    }
  }, [isSubscribed, toggleSubscription]);

  const unsubscribe = useCallback(async () => {
    if (isSubscribed) {
      await toggleSubscription();
    }
  }, [isSubscribed, toggleSubscription]);

  return {
    ...mgmt,
    subscribe,
    unsubscribe,
  };
}
