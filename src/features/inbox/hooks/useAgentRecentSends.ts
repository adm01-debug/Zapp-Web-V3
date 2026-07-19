import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/queryKeys';
import { useMemo } from 'react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { dbFrom } from '@/integrations/datasource/db';


export interface RecentSend {
  idem_key: string;
  instance_name: string;
  http_status: number;
  external_message_id: string | null;
  created_at: string;
  path: string;
  message_id: string;
}

const IDEM_PREFIX_RE = /^msg:(.+)$/;
const SENDS_LIMIT = 200;
const PER_AGENT_LIMIT = 5;

/**
 * Lê os últimos envios rastreados pelo proxy Evolution (`/message/*`) e os
 * agrupa pelo agente dono da mensagem. Como Lovable Cloud (messages) e
 * `evolution_send_idempotency` vivem no mesmo backend (default supabase),
 * fazemos um lookup batch via `.in('id', [...])` sobre os IDs que aparecem
 * com o prefixo `msg:`. Linhas sem `agent_id` (envios automatizados) são
 * ignoradas — elas não pertencem a um atendente específico.
 *
 * Resultado: `Map<profile.id, RecentSend[]>` com no máx. 5 entradas por
 * agente, ordem desc. por `created_at`.
 */
export function useAgentRecentSends() {
  const query = useQuery({
    queryKey: queryKeys.agentGamification.recentSends(),
    queryFn: async () => {
      const { data: sends, error: sendsErr } = await safeClient.from(
        'evolution_send_idempotency',
        (q) =>
          q
            .select('idem_key, instance_name, http_status, external_message_id, created_at, path')
            .order('created_at', { ascending: false })
            .limit(SENDS_LIMIT)
      );
      if (sendsErr) throw sendsErr;

      const parsed = ((sends as unknown) ?? [])
        .map((s: unknown) => {
          const record = s as Record<string, unknown>;
          const idemKey = record.idem_key as string;
          const match = idemKey.match(IDEM_PREFIX_RE);
          return match ? {
            idem_key: idemKey,
            instance_name: record.instance_name as string,
            http_status: record.http_status as number,
            external_message_id: (record.external_message_id as string | null) ?? null,
            created_at: record.created_at as string,
            path: record.path as string,
            message_id: match[1],
          } satisfies RecentSend : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (parsed.length === 0) {
        return { byAgent: new Map<string, RecentSend[]>(), totalSends: 0 };
      }

      const ids = Array.from(new Set(parsed.map((p) => p.message_id)));
      const { data: msgs, error: msgsErr } = await dbFrom('messages')
        .select('id, agent_id')
        .in('id', ids);
      if (msgsErr) throw msgsErr;

      const idToAgent = new Map<string, string | null>();
      for (const m of msgs ?? []) {
        idToAgent.set(m.id, m.agent_id ?? null);
      }

      const byAgent = new Map<string, RecentSend[]>();
      for (const send of parsed) {
        const agentId = idToAgent.get(send.message_id);
        if (!agentId) continue;
        const list = byAgent.get(agentId) ?? [];
        if (list.length >= PER_AGENT_LIMIT) continue;
        list.push({
          idem_key: send.idem_key,
          instance_name: send.instance_name,
          http_status: send.http_status,
          external_message_id: send.external_message_id,
          created_at: send.created_at,
          path: send.path,
          message_id: send.message_id,
        });
        byAgent.set(agentId, list);
      }

      return { byAgent, totalSends: parsed.length };
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const empty = useMemo(() => new Map<string, RecentSend[]>(), []);

  return {
    byAgent: query.data?.byAgent ?? empty,
    totalSends: query.data?.totalSends ?? 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}