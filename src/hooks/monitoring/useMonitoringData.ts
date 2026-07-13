// Re-export from consolidated useMonitoringManagement module (ETAPA 23 consolidation)
import { useMonitoringDataManagement } from './useMonitoringManagement';
import type { UseMonitoringDataParams, UseMonitoringDataResult } from './useMonitoringManagement';

export { useMonitoringDataManagement as useMonitoringData };
export type { UseMonitoringDataParams, UseMonitoringDataResult };
