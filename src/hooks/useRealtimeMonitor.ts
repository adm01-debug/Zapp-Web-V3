// Re-export from consolidated useRealtimeManagement module (ETAPA 37 consolidation)
import { useRealtimeMonitorManagement } from '@/hooks/useRealtimeManagement';

export function useRealtimeMonitor(tableName: string) {
  return useRealtimeMonitorManagement(tableName);
}
