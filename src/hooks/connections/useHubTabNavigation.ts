// Re-export from consolidated useConnectionsManagement module (ETAPA 24 consolidation)
import { useHubTabNavigationManagement } from './useConnectionsManagement';
import type { UseHubTabNavigationParams, UseHubTabNavigationResult } from './useConnectionsManagement';

export { useHubTabNavigationManagement as useHubTabNavigation };
export type { UseHubTabNavigationParams, UseHubTabNavigationResult };
