// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import {
  usePerformanceMonitoringManagement,
  usePerformanceSnapshots,
  type PerformanceSnapshot,
  type PerformanceSnapshotInput,
} from '@/hooks/useAnalyticsManagement';

export function usePerformanceMetrics(_componentName: string) {
  return usePerformanceMonitoringManagement();
}

export { usePerformanceSnapshots };
export type { PerformanceSnapshot, PerformanceSnapshotInput };
