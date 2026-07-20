import { useRealtimeDashboardManagement } from '@/hooks/useRealtimeManagement';

/** Hook: use Realtime Dashboard. */
export function useRealtimeDashboard(dashboardId?: string) {
  return useRealtimeDashboardManagement(dashboardId || 'default');
}
