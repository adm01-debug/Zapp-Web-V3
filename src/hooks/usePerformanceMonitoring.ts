// Re-export from consolidated useAnalyticsManagement module (ETAPA 39 consolidation)
import { usePerformanceMonitoringManagement } from '@/hooks/useAnalyticsManagement';

export function usePerformanceMetrics(componentName: string) {
  return usePerformanceMonitoringManagement();
}
