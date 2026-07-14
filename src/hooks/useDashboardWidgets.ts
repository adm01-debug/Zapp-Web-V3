// Re-export from consolidated useDashboardVisualizationManagement module (ETAPA 46 consolidation)
import { useDashboardWidgetsManagement } from '@/hooks/useDashboardVisualizationManagement';
export type { DashboardWidget } from '@/hooks/useDashboardVisualizationManagement';

export function useDashboardWidgets() {
  return useDashboardWidgetsManagement();
}
