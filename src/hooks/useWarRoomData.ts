// Re-export from consolidated useDashboardVisualizationManagement module (ETAPA 46 consolidation)
import { useMemo } from 'react';
import { useWarRoomDataManagement } from '@/hooks/useDashboardVisualizationManagement';
export type { WarRoomAgent, WarRoomQueue } from '@/hooks/useDashboardVisualizationManagement';

export interface WarRoomAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  isNew?: boolean;
}

export function useWarRoomData() {
  const { agents, queues } = useWarRoomDataManagement();
  return { agents, queues, alerts: [] as WarRoomAlert[] };
}

export function useWarRoomMetrics(agents: any[], queues: any[]) {
  return useMemo(() => {
    const totalWaiting = queues.reduce((acc, q) => acc + q.waiting, 0);
    const totalBreaches = queues.reduce((acc, q) => acc + q.slaBreaches, 0);
    const totalWarnings = queues.reduce((acc, q) => acc + q.slaWarnings, 0);
    const onlineAgents = agents.filter((a) => a.status === 'online' || a.status === 'busy').length;
    const avgSatisfaction = agents.length > 0 ? agents.reduce((acc, a) => acc + a.satisfaction, 0) / agents.length : 0;
    const totalResolved = agents.reduce((acc, a) => acc + a.resolvedToday, 0);
    return { totalWaiting, totalBreaches, totalWarnings, onlineAgents, avgSatisfaction, totalResolved };
  }, [agents, queues]);
}
