// Re-export from consolidated useDashboardVisualizationManagement module (ETAPA 46 consolidation)
import { useDashboardWidgetsManagement } from '@/features/dashboard/hooks/useDashboardVisualizationManagement';
export type { DashboardWidget } from '@/features/dashboard/hooks/useDashboardVisualizationManagement';

export function useDashboardWidgets() {
  return useDashboardWidgetsManagement();
}
