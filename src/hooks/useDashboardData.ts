// Re-export from consolidated useDashboardVisualizationManagement module (ETAPA 46 consolidation)
import { useDashboardDataManagement } from '@/features/dashboard/hooks/useDashboardVisualizationManagement';
import type { DashboardFilters, DashboardStats, QueueStats, RecentActivity } from './dashboardTypes';

export function useDashboardData(filters?: DashboardFilters) {
  return useDashboardDataManagement(filters);
}

export const formatResponseTime = (seconds: number | null): string => {
  if (seconds === null) return 'N/A';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}min ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}min`;
};

export type { DashboardFilters, DashboardStats, QueueStats, RecentActivity };
