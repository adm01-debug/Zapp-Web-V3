// Re-export from consolidated useUtilityHelpersManagement module (ETAPA 49 consolidation)
import { usePullToRefreshManagement } from '@/hooks/useUtilityHelpersManagement';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

export function usePullToRefresh(options: UsePullToRefreshOptions) {
  return usePullToRefreshManagement(options);
}
