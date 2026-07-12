import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { dbFrom } from '@/integrations/datasource/db';

/**
 * Conta mensagens com status `pending` ou `failed` agrupadas pelo agente
 * dono do envio. Usamos `agent_id` (nullable) — corresponde ao perfil que
 * efetivamente disparou a mensagem. Apenas mensagens outbound (`sender = 'me'`)
 * entram na contagem; respostas recebidas nunca são "pendentes do agente".
 *
 * staleTime curto (15s) + refetch a cada 30s para refletir um envio que
 * acabou de falhar quase em tempo real, sem pressão extra no backend.
 */
export function useAgentPendingCounts() {
  const query = useQuery({
    queryKey: ['agent-pending-counts'],
    queryFn: async () => {
      const PAGE = 1000;
      const all: Array<{ agent_id: string | null; status: string | null; sender: string }> = [];
      let from = 0;
      while (true) {
        const { data, error } = await dbFrom('messages')
          .select('agent_id, status, sender')
          .in('status', ['pending', 'failed'])
          .eq('sender', 'me')
          .not('agent_id', 'is', null)
          .order('id', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as typeof all));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const counts = useMemo<Record<string, number>>(() => {
    const acc: Record<string, number> = {};
    for (const row of query.data ?? []) {
      const id = row.agent_id;
      if (!id) continue;
      acc[id] = (acc[id] ?? 0) + 1;
    }
    return acc;
  }, [query.data]);

  return { counts, isLoading: query.isLoading, refetch: query.refetch };
}
