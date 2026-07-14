// Re-export from consolidated useRealtimeManagement module (ETAPA 37 consolidation)
import { useRealtimeMonitorManagement } from '@/hooks/useRealtimeManagement';

/** Monitors table changes in real-time via Supabase subscriptions. */
export function useRealtimeMonitor(tableName: string) {
  return useRealtimeMonitorManagement(tableName);
}
