import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/queryKeys';
import { agentService, AgentWithStats } from '../services/agentService';
import type { AgentProfile } from '../data-access/agentRepository';
import { tanstackRetry } from '@/lib/errors/queryErrors';
import { supabase } from '@/integrations/supabase/client';

/** Re-exported module members. */
export type { AgentProfile, AgentWithStats };

/** Presence row shape from zapp.agent_presence (realtime publication). */
interface AgentPresenceRow {
  user_id: string;
  status: string | null;
  updated_at: string | null;
  active_conversations: number | null;
}

const PRESENCE_STATUSES = new Set(['online', 'away', 'offline']);

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

  // zapp.agent_presence está na publication realtime mas não tinha consumidor:
  // o status era estimado por heurística (profiles.updated_at). Aqui a presença
  // real (mantida por heartbeat + cron auto-offline-agents) sobrepõe o status.
  const [presenceMap, setPresenceMap] = useState<Record<string, AgentPresenceRow>>({});

  useEffect(() => {
    let cancelled = false;

    const upsertPresence = (rows: AgentPresenceRow[]) => {
      if (cancelled) return;
      setPresenceMap((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (row?.user_id) next[row.user_id] = row;
        }
        return next;
      });
    };

    // Snapshot inicial — a subscription só entrega eventos posteriores.
    void (async () => {
      try {
        const { data } = await supabase
          .from('agent_presence')
          .select('user_id, status, updated_at, active_conversations');
        if (data) upsertPresence(data as AgentPresenceRow[]);
      } catch {
        // Snapshot falhou (ex.: RLS) — a subscription continua cobrindo eventos.
      }
    })();

    const channel = supabase
      .channel('agent-presence-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'agent_presence' },
        (payload) => {
          const row = (payload.new ?? payload.old) as AgentPresenceRow | undefined;
          if (!row?.user_id) return;
          if (payload.eventType === 'DELETE') {
            setPresenceMap((prev) => {
              const next = { ...prev };
              delete next[row.user_id];
              return next;
            });
          } else {
            upsertPresence([row]);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const agentsWithPresence = useMemo(() => {
    if (Object.keys(presenceMap).length === 0) return agents;
    return agents.map((agent) => {
      const presence = presenceMap[agent.user_id] ?? presenceMap[agent.id];
      if (!presence) return agent;
      // agent_presence.status é a fonte de verdade quando presente e válida;
      // caso contrário mantém a heurística de agentService.
      if (presence.status && PRESENCE_STATUSES.has(presence.status)) {
        return { ...agent, status: presence.status as AgentWithStats['status'] };
      }
      return agent;
    });
  }, [agents, presenceMap]);

  const stats = useMemo(() => {
    const onlineCount = agentsWithPresence.filter((a) => a.status === 'online').length;
    const awayCount = agentsWithPresence.filter((a) => a.status === 'away').length;
    const offlineCount = agentsWithPresence.filter((a) => a.status === 'offline').length;
    const totalActiveChats = agentsWithPresence.reduce((sum, a) => sum + a.activeChats, 0);

    return {
      onlineCount,
      awayCount,
      offlineCount,
      totalActiveChats,
      totalAgents: agentsWithPresence.length,
    };
  }, [agentsWithPresence]);

  return {
    agents: agentsWithPresence,
    stats,
    isLoading,
    error,
    refetch,
  };
}
