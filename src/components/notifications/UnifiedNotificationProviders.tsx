/**
 * Unified Notification Providers (v1.0)
 * Consolidates SLANotificationProvider, GoalNotificationProvider, and
 * RealtimeSentimentAlertProvider into a single composable factory.
 * Maintains backward compatibility through re-exports.
 */
import { forwardRef, ReactNode } from 'react';
import { useRealtimeSentimentAlerts } from '@/hooks/useRealtimeSentimentAlerts';
import { useSLANotifications } from '@/features/sla';
import { useGoalNotifications } from '@/hooks/useGoalNotifications';

interface UnifiedNotificationProvidersProps {
  children?: ReactNode;
  enableSLA?: boolean;
  enableGoals?: boolean;
  enableSentimentAlerts?: boolean;
}

/**
 * Unified provider for all notification types.
 * Supports selective enabling of individual notification systems.
 * When used with all defaults (all enabled), replaces all three separate providers.
 */
export const UnifiedNotificationProviders = forwardRef<
  HTMLDivElement,
  UnifiedNotificationProvidersProps
>(
  function UnifiedNotificationProviders(
    {
      children,
      enableSLA = true,
      enableGoals = true,
      enableSentimentAlerts = true,
    },
    _ref
  ) {
    // Initialize selected notification hooks
    if (enableSentimentAlerts) {
      useRealtimeSentimentAlerts();
    }
    if (enableSLA) {
      useSLANotifications();
    }
    if (enableGoals) {
      useGoalNotifications();
    }

    return <>{children}</>;
  }
);

/**
 * SLA Notification Provider (legacy — use UnifiedNotificationProviders)
 * Re-exported for backward compatibility.
 */
export const SLANotificationProvider = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode }
>(function SLANotificationProvider({ children }, _ref) {
  useSLANotifications();
  return <>{children}</>;
});

/**
 * Goal Notification Provider (legacy — use UnifiedNotificationProviders)
 * Re-exported for backward compatibility.
 */
export const GoalNotificationProvider = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode }
>(
  function GoalNotificationProvider({ children }, _ref) {
    useGoalNotifications();
    return <>{children}</>;
  }
);

/**
 * Realtime Sentiment Alert Provider (legacy — use UnifiedNotificationProviders)
 * Re-exported for backward compatibility.
 */
export const RealtimeSentimentAlertProvider = forwardRef<HTMLDivElement>(
  function RealtimeSentimentAlertProvider(_props, _ref) {
    useRealtimeSentimentAlerts();
    return null;
  }
);
