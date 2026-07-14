// Re-export from consolidated useDashboardVisualizationManagement module (ETAPA 46 consolidation)
import { useLeaderboardManagement } from '@/features/dashboard/hooks/useDashboardVisualizationManagement';
export type { LeaderboardAgent } from '@/features/dashboard/hooks/useDashboardVisualizationManagement';

/** Retrieves leaderboard rankings and agent performance metrics. */
export function useLeaderboard() {
  return useLeaderboardManagement();
}
