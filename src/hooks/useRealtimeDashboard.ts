// Re-export from consolidated useRealtimeManagement module (ETAPA 37 consolidation)
import { useRealtimeDashboardManagement } from '@/hooks/useRealtimeManagement';

/** Provides real-time dashboard updates and live data streaming. */
export function useRealtimeDashboard(dashboardId?: string) {
  return useRealtimeDashboardManagement(dashboardId || 'default');
}
