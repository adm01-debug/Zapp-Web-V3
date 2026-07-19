// Re-export from consolidated useMonitoringManagement module (ETAPA 23 consolidation)
import { useMonitoringActionsManagement } from './useMonitoringManagement';
import type { UseMonitoringActionsParams, UseMonitoringActionsResult } from './useMonitoringManagement';

/** Hook: use Monitoring Actions. */
export function useMonitoringActions(
  paramsOrFetchData: UseMonitoringActionsParams | UseMonitoringActionsParams['fetchData']
): UseMonitoringActionsResult {
  const params = typeof paramsOrFetchData === 'function'
    ? { fetchData: paramsOrFetchData }
    : paramsOrFetchData;
  return useMonitoringActionsManagement(params);
}
/** Re-exported module members. */
export type { UseMonitoringActionsParams, UseMonitoringActionsResult };
