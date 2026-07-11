import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { agentService, AgentWithStats } from '../services/agentService';
import type { AgentProfile } from '../data-access/agentRepository';

export type { AgentProfile, AgentWithStats };

export function useAgents() {
  const {
    data: agents = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['agents-with-stats'],
    queryFn: () => agentService.getAgentsWithStats(),
  });

  const stats = useMemo(() => {
    const onlineCount = agents.filter((a) => a.status === 'online').length;
    const awayCount = agents.filter((a) => a.status === 'away').length;
    const offlineCount = agents.filter((a) => a.status === 'offline').length;
    const totalActiveChats = agents.reduce((sum, a) => sum + a.activeChats, 0);

    return {
      onlineCount,
      awayCount,
      offlineCount,
      totalActiveChats,
      totalAgents: agents.length,
    };
  }, [agents]);

  return {
    agents,
    stats,
    isLoading,
    error,
    refetch,
  };
}
