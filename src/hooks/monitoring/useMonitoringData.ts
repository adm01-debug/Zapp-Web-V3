// Re-export from consolidated useMonitoringManagement module (ETAPA 23 consolidation)
import { useMonitoringDataManagement } from './useMonitoringManagement';
import type { UseMonitoringDataParams, UseMonitoringDataResult } from './useMonitoringManagement';

export function useMonitoringData(
  paramsOrCallback?: UseMonitoringDataParams | UseMonitoringDataParams['onConnectionsUpdate']
): UseMonitoringDataResult {
  const params = typeof paramsOrCallback === 'function'
    ? { onConnectionsUpdate: paramsOrCallback }
    : paramsOrCallback;
  return useMonitoringDataManagement(params);
}
export type { UseMonitoringDataParams, UseMonitoringDataResult };
