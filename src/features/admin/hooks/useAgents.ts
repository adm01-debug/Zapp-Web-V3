import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/queryKeys';
import { agentService, AgentWithStats } from '../services/agentService';
import type { AgentProfile } from '../data-access/agentRepository';
import { tanstackRetry } from '@/lib/errors/queryErrors';

/** Re-exported module members. */
export type { AgentProfile, AgentWithStats };

/** Hook: use Agents. */
export function useAgents() {
  const {
    data: agents = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.agentGamification.withStats(),
    queryFn: () => agentService.getAgentsWithStats(),
    retry: tanstackRetry,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
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
