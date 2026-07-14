// Re-export from consolidated useConnectionsManagement module (ETAPA 24 consolidation)
import {
  useHubTabNavigationManagement,
  type UseHubTabNavigationParams,
  type UseHubTabNavigationResult,
} from './useConnectionsManagement';

/** Hook for managing hub connection tab navigation and active tab state. */
export { useHubTabNavigationManagement as useHubTabNavigation };
export type { UseHubTabNavigationParams, UseHubTabNavigationResult };
