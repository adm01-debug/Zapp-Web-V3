// Re-export from consolidated useDashboardVisualizationManagement module (ETAPA 46 consolidation)
import { useDashboardWidgetsManagement } from '@/features/dashboard/hooks/useDashboardVisualizationManagement';
/** Re-exported module members. */
export type { DashboardWidget } from '@/features/dashboard/hooks/useDashboardVisualizationManagement';

/** Provides dashboard widget configuration and rendering state. */
export function useDashboardWidgets() {
  return useDashboardWidgetsManagement();
}
