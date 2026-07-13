// Re-export from consolidated useDashboardVisualizationManagement module (ETAPA 46 consolidation)
import { useLeaderboardManagement } from '@/hooks/useDashboardVisualizationManagement';
export type { LeaderboardAgent } from '@/hooks/useDashboardVisualizationManagement';

export function useLeaderboard() {
  return useLeaderboardManagement();
}
