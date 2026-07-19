import { useRealtimeDashboardManagement } from '@/hooks/useRealtimeManagement';

export function useRealtimeDashboard(dashboardId?: string) {
  return useRealtimeDashboardManagement(dashboardId || 'default');
}
