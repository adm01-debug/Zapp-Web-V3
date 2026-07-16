import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { agentService, AgentWithStats } from '../services/agentService';
import type { AgentProfile } from '../data-access/agentRepository';

export type { AgentProfile, AgentWithStats };

/**
 * Classifica se um erro é permanente (sem sentido fazer retry).
 * Erros de permissão (42501), tabela inexistente (42P01) e auth (401/403)
 * são permanentes — retries só geram spam no console e saturação no banco.
 */
function isPermanentError(error: unknown): boolean {
  const msg = ((error as Error)?.message ?? '').toLowerCase();
  return (
    msg.includes('permission denied') ||
    msg.includes('does not exist') ||
    msg.includes('not found') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('42501') ||
    msg.includes('42p01')
  );
}

export function useAgents() {
  const {
    data: agents = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['agents-with-stats'],
    queryFn: () => agentService.getAgentsWithStats(),
    // ✅ Não loopear em erros permanentes (permission denied, tabela não existe, auth)
    // Máximo 2 retries para erros transientes (rede, timeout)
    retry: (failureCount, error) => {
      if (isPermanentError(error)) return false;
      return failureCount < 2;
    },
    // ✅ Dados de agente mudam devagar — reduzir refetches desnecessários
    staleTime: 30_000,             // 30s antes de considerar stale
    gcTime: 5 * 60_000,            // 5min no cache antes de gc
    refetchInterval: false,        // sem polling automático
    refetchOnWindowFocus: false,   // sem refetch ao focar janela
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
