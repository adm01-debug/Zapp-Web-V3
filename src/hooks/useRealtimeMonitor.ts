// Re-export from consolidated useRealtimeManagement module (ETAPA 37 consolidation)
import { useRealtimeMonitorManagement } from '@/hooks/useRealtimeManagement';

/** Hook: use Realtime Monitor. */
export function useRealtimeMonitor(tableName: string) {
  return useRealtimeMonitorManagement(tableName);
}
