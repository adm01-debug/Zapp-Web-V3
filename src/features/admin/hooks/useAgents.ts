import { useEffect, useMemo, useRef, useState } from 'react';
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

/** Fallback de re-sincronização do snapshot de presença quando o canal Realtime está fora. */
const PRESENCE_FALLBACK_POLL_MS = 120_000;

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
  // Saúde do canal Realtime — o fallback polling (120s) só roda em erro/fechado.
  const channelStatusRef = useRef<'connecting' | 'connected' | 'error' | 'closed'>('connecting');

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

    // Snapshot inicial + fallback — a subscription só entrega eventos posteriores.
    const fetchPresenceSnapshot = async () => {
      try {
        const { data } = await supabase
          .from('agent_presence')
          .select('user_id, status, updated_at, active_conversations');
        if (data) upsertPresence(data as AgentPresenceRow[]);
      } catch {
        // Snapshot falhou (ex.: RLS) — a subscription continua cobrindo eventos.
      }
    };

    // Snapshot inicial — a subscription só entrega eventos posteriores.
    void fetchPresenceSnapshot();

    // Topic único por mount — evita reutilizar instância de canal já inscrita
    // cujo teardown (removeChannel assíncrono) ainda não terminou.
    const channelName = `agent-presence-realtime:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
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
      .subscribe((status) => {
        // Rastreia a saúde do canal para o fallback polling abaixo.
        if (status === 'SUBSCRIBED') channelStatusRef.current = 'connected';
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
          channelStatusRef.current = 'error';
        else if (status === 'CLOSED') channelStatusRef.current = 'closed';
        else channelStatusRef.current = 'connecting';
      });

    // Fallback polling 120s: SÓ quando a subscription está em erro/fechado
    // (blip de rede, restart do servidor). Canal saudável → sem polling.
    const fallbackTimer = setInterval(() => {
      if (cancelled) return;
      const st = channelStatusRef.current;
      if (st !== 'error' && st !== 'closed') return;
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchPresenceSnapshot();
    }, PRESENCE_FALLBACK_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(fallbackTimer);
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
