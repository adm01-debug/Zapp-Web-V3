// Re-export from consolidated useMonitoringManagement module (ETAPA 23 consolidation)
import { useMonitoringActionsManagement } from './useMonitoringManagement';
import type { UseMonitoringActionsParams, UseMonitoringActionsResult } from './useMonitoringManagement';

export { useMonitoringActionsManagement as useMonitoringActions };
export type { UseMonitoringActionsParams, UseMonitoringActionsResult };
