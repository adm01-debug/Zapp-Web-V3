import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import type { MessageReaction } from './types';

const log = getLogger('useBatchReactions');

/**
 * Busca reações de MÚLTIPLAS mensagens em NO MÁXIMO 2 GETs (FIX N+1 2026-08-06):
 *  1. Tenta `rpc_get_reactions_batch` (1 GET) — RPC existente em produção;
 *  2. Se a RPC não existir/fallhar, cai para `.in('message_id', ids)` (1 GET);
 *  3. Enriquece com nomes de usuários via 1 GET em `profiles` (guard: pula se
 *     não houver user_ids sem nome — evita GET desnecessário).
 *
 * Retorna as linhas já enriquecidas com `user_name` (mesmo contrato do
 * queryFn por-mensagem de `useMessageReactions`).
 */
export async function fetchReactionsBatch(messageIds: string[]): Promise<MessageReaction[]> {
  if (messageIds.length === 0) return [];

  let rows: MessageReaction[] | null = null;

  // 1ª tentativa: RPC batch (1 call, RLS aplicado no servidor)
  try {
    const { data, error } = await supabase.rpc('rpc_get_reactions_batch', {
      p_message_ids: messageIds,
    });
    if (!error && Array.isArray(data)) {
      rows = data as unknown as MessageReaction[];
    } else if (error) {
      log.warn('rpc_get_reactions_batch indisponível; usando fallback .in()', {
        error: error.message,
      });
    }
  } catch (err) {
    log.warn('rpc_get_reactions_batch lançou exceção; usando fallback .in()', err);
  }

  // Fallback: query direta `.in('message_id', ids)` (1 call por chunk de 100 —
  // URLs >8k com 1000+ ids estourariam o limite do nginx; R11 regression
  // review da onda).
  if (!rows) {
    const CHUNK_SIZE = 100;
    rows = [];
    for (let i = 0; i < messageIds.length; i += CHUNK_SIZE) {
      const chunk = messageIds.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', chunk);
      if (error) throw error;
      rows.push(...((data ?? []) as MessageReaction[]));
    }
  }

  // Enriquece com nomes de usuários (1 GET em profiles, com guard se lista vazia)
  const needsName = rows.filter((r) => r.user_id && !r.user_name);
  if (needsName.length > 0) {
    const userIds = [...new Set(needsName.map((r) => r.user_id as string))];
    try {
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
      if (!usersError && users) {
        const usersMap = new Map(users.map((u) => [u.id, u.name]));
        rows = rows.map((r) =>
          r.user_name
            ? r
            : { ...r, user_name: r.user_id ? usersMap.get(r.user_id) || 'Agente' : 'Cliente' }
        );
      }
    } catch (err) {
      log.warn('Falha ao enriquecer reações com perfis', err);
    }
  }

  return rows;
}

/**
 * Hook for batch loading reactions for multiple messages.
 *
 * Performance: uses useMemo for messageIds join key to avoid re-triggering
 * on same arrays. Returns a typed Record<string, MessageReaction[]>.
 */
export function useMessagesReactions(messageIds: string[]) {
  const [reactionsMap, setReactionsMap] = useState<Record<string, MessageReaction[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  const memoizedIds = useMemo(() => messageIds.join(','), [messageIds]);
  const messageIdsRef = useRef(messageIds);
  messageIdsRef.current = messageIds;

  useEffect(() => {
    if (messageIdsRef.current.length === 0) {
      setReactionsMap({});
      return;
    }

    let cancelled = false;

    const fetchReactions = async () => {
      setIsLoading(true);
      try {
        const rawData = await fetchReactionsBatch(messageIdsRef.current);

        if (cancelled) return;

        const grouped = rawData.reduce(
          (acc, r) => {
            if (!acc[r.message_id]) acc[r.message_id] = [];
            acc[r.message_id].push(r);
            return acc;
          },
          {} as Record<string, MessageReaction[]>
        );

        setReactionsMap(grouped);
      } catch (err) {
        if (!cancelled) log.error('Error fetching reactions:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void fetchReactions();
    return () => {
      cancelled = true;
    };
  }, [memoizedIds]);

  return { reactionsMap, isLoading };
}
