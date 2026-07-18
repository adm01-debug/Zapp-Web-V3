import { useCallback } from 'react';
import { usePushNotificationsManagement } from '@/hooks/useNotificationManagement';
import type { PushNotificationState, NotificationPayload } from '@/hooks/useNotificationManagement';

export type { PushNotificationState, NotificationPayload };

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
